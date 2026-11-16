import "dotenv/config";
import express from "express";
import session from "express-session";
import SQLiteStoreFactory from "connect-sqlite3";
import helmet from "helmet";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csrfSync } from "csrf-sync";
import { rateLimit } from "express-rate-limit";
import { db, publicUser } from "./db.js";
import { requireAuth, requireRole, requirePasswordSetupComplete, handleError } from "./middleware.js";
import { activitySchema, candidateSchema, statusSchema } from "./validation.js";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const app = express();
const PORT = Number(process.env.PORT || 4000);
const isProduction = process.env.NODE_ENV === "production";
const SQLiteStore = SQLiteStoreFactory(session);

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be configured in production.");
}
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "30kb" }));
if (!isProduction) {
  app.use(cors({ origin: process.env.APP_ORIGIN || "http://localhost:5173", credentials: true }));
}

app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: path.resolve("./data") }),
  name: "lpt.sid",
  secret: process.env.SESSION_SECRET || "local-development-only-change-this-secret-please",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

const { generateToken, csrfSynchronisedProtection } = csrfSync({
  getTokenFromRequest: (req) => req.headers["x-csrf-token"],
});
app.get("/api/v1/auth/csrf", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ csrfToken: generateToken(req) });
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many sign-in attempts. Please try again later." },
});

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const accountByEmail = db.prepare("SELECT * FROM accounts WHERE email = ? COLLATE NOCASE");

app.post("/api/v1/auth/login", loginLimiter, csrfSynchronisedProtection, asyncRoute(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const account = accountByEmail.get(email);
  const valid = account && await bcrypt.compare(password, account.password_hash);
  if (!valid) return res.status(401).json({ message: "Email or password is incorrect." });

  if (account.must_change_password && account.temporary_password_expires_at &&
      new Date(account.temporary_password_expires_at).getTime() < Date.now()) {
    return res.status(401).json({ message: "Your temporary password has expired. Ask your coordinator to reset it." });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ message: "Unable to start your session. Please try again." });
    req.session.account = {
      id: account.id,
      email: account.email,
      role: account.role,
      mustChangePassword: Boolean(account.must_change_password),
      authVersion: account.auth_version,
    };
    req.session.save((saveErr) => {
      if (saveErr) return res.status(500).json({ message: "Unable to save your session. Please try again." });
      res.set("Cache-Control", "no-store");
      res.json({ user: publicUser(account) });
    });
  });
}));

app.post("/api/v1/auth/change-password", requireAuth, csrfSynchronisedProtection, asyncRoute(async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (newPassword.length < 10 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return res.status(400).json({ message: "Use at least 10 characters with uppercase, lowercase, and a number." });
  }
  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.session.account.id);
  if (!account || !(await bcrypt.compare(currentPassword, account.password_hash))) {
    return res.status(400).json({ message: "Current password is incorrect." });
  }
  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare(`UPDATE accounts SET password_hash = ?, must_change_password = 0,
    temporary_password_expires_at = NULL, auth_version = auth_version + 1 WHERE id = ?`).run(hash, account.id);
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ message: "Password changed, but session refresh failed. Sign in again." });
    req.session.account = { id: account.id, email: account.email, role: account.role, mustChangePassword: false, authVersion: account.auth_version + 1 };
    req.session.save((saveErr) => {
      if (saveErr) return res.status(500).json({ message: "Please sign in again." });
      res.status(204).end();
    });
  });
}));

app.post("/api/v1/auth/logout", requireAuth, csrfSynchronisedProtection, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("lpt.sid", { httpOnly: true, sameSite: "lax", secure: isProduction });
    res.status(204).end();
  });
});

app.get("/api/v1/auth/me", requireAuth, (req, res) => {
  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.session.account.id);
  res.json({ user: publicUser(account) });
});

app.get("/api/v1/activities", requireRole("Coordinator"), (req, res) => {
  res.json(db.prepare("SELECT * FROM activities ORDER BY id DESC").all());
});
app.post("/api/v1/activities", requireRole("Coordinator"), csrfSynchronisedProtection, (req, res) => {
  const parsed = activitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Enter a title, topic, and planned hours greater than zero." });
  const result = db.prepare("INSERT INTO activities (title, topic, planned_hours) VALUES (?, ?, ?)")
    .run(parsed.data.title, parsed.data.topic, parsed.data.plannedHours);
  res.status(201).json(db.prepare("SELECT * FROM activities WHERE id = ?").get(result.lastInsertRowid));
});
app.put("/api/v1/activities/:id", requireRole("Coordinator"), csrfSynchronisedProtection, (req, res) => {
  const parsed = activitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Enter a title, topic, and planned hours greater than zero." });
  const result = db.prepare("UPDATE activities SET title = ?, topic = ?, planned_hours = ? WHERE id = ?")
    .run(parsed.data.title, parsed.data.topic, parsed.data.plannedHours, Number(req.params.id));
  if (!result.changes) return res.status(404).json({ message: "Activity not found." });
  res.json(db.prepare("SELECT * FROM activities WHERE id = ?").get(Number(req.params.id)));
});

app.get("/api/v1/learners", requireRole("Coordinator"), (req, res) => {
  res.json(db.prepare(`SELECT l.id, l.display_name, l.cohort, a.email
    FROM learners l JOIN accounts a ON a.id = l.account_id ORDER BY l.display_name`).all());
});
app.post("/api/v1/learners", requireRole("Coordinator"), csrfSynchronisedProtection, asyncRoute(async (req, res) => {
  const parsed = candidateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Enter a valid name, email, and cohort." });
  const email = parsed.data.email.toLowerCase();
  if (accountByEmail.get(email)) return res.status(409).json({ message: "An account with this email already exists." });
  const temporaryPassword = randomBytes(12).toString("base64url");
  const hash = await bcrypt.hash(temporaryPassword, 12);
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const create = db.transaction(() => {
    const account = db.prepare(`INSERT INTO accounts (email, password_hash, role, must_change_password, temporary_password_expires_at)
      VALUES (?, ?, 'Candidate', 1, ?)`).run(email, hash, expires);
    const learner = db.prepare("INSERT INTO learners (display_name, cohort, account_id) VALUES (?, ?, ?)")
      .run(parsed.data.name, parsed.data.cohort, account.lastInsertRowid);
    return learner.lastInsertRowid;
  });
  try {
    const learnerId = create();
    res.set("Cache-Control", "no-store");
    res.status(201).json({ learner: db.prepare("SELECT id, display_name, cohort FROM learners WHERE id = ?").get(learnerId), username: email, temporaryPassword, expiresAt: expires });
  } catch (error) {
    if (String(error.code).includes("SQLITE_CONSTRAINT")) return res.status(409).json({ message: "An account with this email already exists." });
    throw error;
  }
}));

app.post("/api/v1/learners/:id/reset-password", requireRole("Coordinator"), csrfSynchronisedProtection, asyncRoute(async (req, res) => {
  const learner = db.prepare("SELECT a.id, a.email FROM learners l JOIN accounts a ON a.id = l.account_id WHERE l.id = ?").get(Number(req.params.id));
  if (!learner) return res.status(404).json({ message: "Candidate not found." });
  const temporaryPassword = randomBytes(12).toString("base64url");
  const hash = await bcrypt.hash(temporaryPassword, 12);
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`UPDATE accounts SET password_hash = ?, must_change_password = 1,
    temporary_password_expires_at = ?, auth_version = auth_version + 1 WHERE id = ?`).run(hash, expires, learner.id);
  res.set("Cache-Control", "no-store");
  res.json({ username: learner.email, temporaryPassword, expiresAt: expires });
}));

app.post("/api/v1/assignments", requireRole("Coordinator"), csrfSynchronisedProtection, (req, res) => {
  const learnerId = Number(req.body?.learnerId);
  const activityId = Number(req.body?.activityId);
  if (!Number.isInteger(learnerId) || !Number.isInteger(activityId)) return res.status(400).json({ message: "Choose a candidate and activity." });
  try {
    const result = db.prepare("INSERT INTO assignments (learner_id, activity_id) VALUES (?, ?)").run(learnerId, activityId);
    res.status(201).json(db.prepare(`SELECT x.id, x.status, a.title, a.topic, a.planned_hours
      FROM assignments x JOIN activities a ON a.id = x.activity_id WHERE x.id = ?`).get(result.lastInsertRowid));
  } catch (error) {
    if (String(error.code).includes("SQLITE_CONSTRAINT_UNIQUE")) return res.status(409).json({ message: "This activity is already assigned to this candidate." });
    if (String(error.code).includes("SQLITE_CONSTRAINT_FOREIGNKEY")) return res.status(404).json({ message: "Candidate or activity not found." });
    throw error;
  }
});

app.get("/api/v1/learners/:id/assignments", requireRole("Coordinator"), (req, res) => {
  const learnerId = Number(req.params.id);
  const learner = db.prepare("SELECT id FROM learners WHERE id = ?").get(learnerId);
  if (!learner) return res.status(404).json({ message: "Candidate not found." });
  res.json(db.prepare(`SELECT x.id, x.status, a.id AS activity_id, a.title, a.topic, a.planned_hours
    FROM assignments x JOIN activities a ON a.id = x.activity_id
    WHERE x.learner_id = ? ORDER BY x.id DESC`).all(learnerId));
});

app.patch("/api/v1/assignments/:id/status", requireRole("Candidate"), csrfSynchronisedProtection, (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Choose a valid progress status." });
  const assignmentId = Number(req.params.id);
  const assignment = db.prepare(`SELECT x.id FROM assignments x JOIN learners l ON l.id = x.learner_id
    WHERE x.id = ? AND l.account_id = ?`).get(assignmentId, req.session.account.id);
  if (!assignment) return res.status(404).json({ message: "Assignment not found." });
  db.prepare("UPDATE assignments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(parsed.data.status, assignmentId);
  res.json({ id: assignmentId, status: parsed.data.status });
});

app.get("/api/v1/me/assignments", requireRole("Candidate"), (req, res) => {
  res.json(db.prepare(`SELECT x.id, x.status, a.title, a.topic, a.planned_hours
    FROM assignments x JOIN activities a ON a.id = x.activity_id
    JOIN learners l ON l.id = x.learner_id
    WHERE l.account_id = ? ORDER BY x.id DESC`).all(req.session.account.id));
});

app.get("/api/v1/cohort-summary", requireRole("Coordinator"), (req, res) => {
  const learners = db.prepare("SELECT COUNT(*) AS count FROM learners").get().count;
  const assignments = db.prepare("SELECT COUNT(*) AS count FROM assignments").get().count;
  const completed = db.prepare("SELECT COUNT(*) AS count FROM assignments WHERE status = 'Completed'").get().count;
  res.json({ learners, assignments, completed });
});

app.use("/api", (req, res) => res.status(404).json({ message: "API endpoint not found." }));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (isProduction) {
  app.use(express.static(path.resolve(__dirname, "../dist")));
  app.get("*", (req, res) => res.sendFile(path.resolve(__dirname, "../dist/index.html")));
}
app.use(handleError);

app.listen(PORT, () => console.log(`Learning Tracker API running on http://localhost:${PORT}`));
