import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const rl = readline.createInterface({ input, output });
try {
  const email = (await rl.question("Coordinator email: ")).trim().toLowerCase();
  const password = await rl.question("Coordinator password (min 12 characters): ");
  if (!email.includes("@") || password.length < 12) {
    throw new Error("Enter a valid email and a password of at least 12 characters.");
  }
  if (db.prepare("SELECT id FROM accounts WHERE email = ? COLLATE NOCASE").get(email)) {
    throw new Error("An account with this email already exists.");
  }
  const hash = await bcrypt.hash(password, 12);
  db.prepare("INSERT INTO accounts (email, password_hash, role) VALUES (?, ?, 'Coordinator')").run(email, hash);

  const activities = [
    ["React Fundamentals", "Frontend", 6],
    ["REST API Essentials", "Backend", 8],
    ["SQL Foundations", "Database", 5],
    ["Git & Team Workflow", "Tools", 3],
  ];
  const addActivity = db.prepare("INSERT INTO activities (title, topic, planned_hours) VALUES (?, ?, ?)");
  for (const item of activities) {
    if (!db.prepare("SELECT id FROM activities WHERE title = ?").get(item[0])) addActivity.run(...item);
  }

  // Optional fictional demo learners. Their one-time credentials are printed only now.
  const demo = [
    ["Jordan Lee", "jordan.lee@example.test", "Frontend Cohort"],
    ["Avery Patel", "avery.patel@example.test", "Frontend Cohort"],
    ["Morgan Chen", "morgan.chen@example.test", "Frontend Cohort"],
  ];
  const credentials = [];
  for (const [name, learnerEmail, cohort] of demo) {
    if (db.prepare("SELECT id FROM accounts WHERE email = ? COLLATE NOCASE").get(learnerEmail)) continue;
    const temp = randomBytes(12).toString("base64url");
    const tempHash = await bcrypt.hash(temp, 12);
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const create = db.transaction(() => {
      const account = db.prepare(`INSERT INTO accounts (email, password_hash, role, must_change_password, temporary_password_expires_at)
        VALUES (?, ?, 'Candidate', 1, ?)`).run(learnerEmail, tempHash, expiry);
      db.prepare("INSERT INTO learners (display_name, cohort, account_id) VALUES (?, ?, ?)")
        .run(name, cohort, account.lastInsertRowid);
    });
    create();
    credentials.push({ email: learnerEmail, password: temp });
  }
  console.log("\\nCoordinator account created.");
  if (credentials.length) {
    console.log("\\nOne-time demo candidate credentials (share privately; shown only once):");
    credentials.forEach((c) => console.log(`${c.email}  |  ${c.password}`));
  }
  console.log("\\nSetup complete. Keep these credentials private.");
} finally {
  rl.close();
}
