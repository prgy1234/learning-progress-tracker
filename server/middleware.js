import { db } from "./db.js";

export function requireAuth(req, res, next) {
  if (!req.session?.account) {
    return res.status(401).json({ message: "Please sign in to continue." });
  }
  const account = db.prepare("SELECT auth_version FROM accounts WHERE id = ?").get(req.session.account.id);
  if (!account || account.auth_version !== req.session.account.authVersion) {
    return req.session.destroy(() => res.status(401).json({ message: "Your session is no longer valid. Please sign in again." }));
  }
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.session?.account) return res.status(401).json({ message: "Please sign in to continue." });
    if (req.session.account.role !== role) return res.status(403).json({ message: "You do not have permission to do that." });
    if (req.session.account.mustChangePassword) return res.status(403).json({ message: "Change your temporary password before continuing." });
    requireAuth(req, res, next);
  };
}

export function requirePasswordSetupComplete(req, res, next) {
  if (req.session?.account?.mustChangePassword) {
    return res.status(403).json({ message: "Change your temporary password before continuing." });
  }
  next();
}

export function handleError(err, req, res, next) {
  if (res.headersSent) return next(err);
  console.error(err);
  res.status(500).json({ message: "Something went wrong. Please try again." });
}
