import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const configuredPath = process.env.DATABASE_FILE || "./data/learning-tracker.sqlite";
const dbPath = path.resolve(configuredPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Coordinator','Candidate')),
    must_change_password INTEGER NOT NULL DEFAULT 0,
    auth_version INTEGER NOT NULL DEFAULT 0,
    temporary_password_expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS learners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    cohort TEXT NOT NULL,
    account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    planned_hours REAL NOT NULL CHECK(planned_hours > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    learner_id INTEGER NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
    activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'Not Started'
      CHECK(status IN ('Not Started','In Progress','Completed')),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(learner_id, activity_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_assignments_learner ON assignments(learner_id);
`);

export function publicUser(account) {
  if (!account) return null;
  const learner = account.role === "Candidate"
    ? db.prepare("SELECT id, display_name, cohort FROM learners WHERE account_id = ?").get(account.id)
    : null;
  return {
    id: account.id,
    email: account.email,
    role: account.role,
    mustChangePassword: Boolean(account.must_change_password),
    learner,
  };
}
