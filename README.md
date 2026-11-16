# Northstar Learning Progress Tracker — Track B

A responsive full-stack Learning Progress Tracker built with **React + Vite**, **Node.js + Express**, and **SQLite**. It follows the supplied capstone brief and uses fictional demo learners.

## Features

- Coordinator and candidate sign-in with role-based access.
- Coordinator dashboard with live learner, assignment, and completion totals.
- Candidate creation with case-insensitive unique email and one-time temporary password (24-hour expiry).
- Coordinator password reset; prior sessions are invalidated by changing the account password and requiring first-login setup.
- Activity create/edit with title, topic, and positive planned hours.
- Duplicate-safe candidate/activity assignments.
- Candidate-only `/me/assignments`; candidates can update only their own assignment statuses.
- Mandatory first-login password change.
- Logout, server-side sessions, HttpOnly/SameSite cookies, CSRF tokens for state-changing requests, and login rate limiting.
- Responsive UI with loading, empty, success, and error states.

## Requirements

- Node.js 20 or later (LTS recommended)
- npm 10 or later

## Setup (Windows PowerShell)

1. Extract the ZIP and open the extracted `learning-progress-tracker-track-b` folder in VS Code.
2. Open the VS Code terminal in that folder.
3. Install packages:

   ```powershell
   npm install
   ```

4. Create your local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

5. Edit `.env` and replace `SESSION_SECRET` with a long random secret. For local development, the default configuration runs on localhost.
6. Create the coordinator account and seed the sample activities plus three fictional demo candidates:

   ```powershell
   npm run setup:coordinator
   ```

   Enter your coordinator email and a strong password (at least 12 characters). The command prints the three demo candidates' temporary credentials once. Save them privately; they expire after 24 hours. No passwords are stored in source code.

7. Start the frontend and backend:

   ```powershell
   npm run dev
   ```

8. Open **http://localhost:5173**.

The Express API runs at `http://localhost:4000`; Vite forwards `/api` requests to it.

## Demo flow

1. Sign in using the coordinator email/password you created in setup.
2. Open Candidates to add a candidate. The generated temporary password appears once in a private handover dialog.
3. Open Activities to create or edit learning activities.
4. Return to Dashboard, choose a candidate, and assign an activity.
5. Sign out. Sign in as that candidate with their temporary credentials.
6. Change the temporary password when prompted. The candidate then sees only their own My Training page.
7. Change progress to Not Started, In Progress, or Completed. Sign out and return as coordinator to see updated cohort totals.

The setup command creates these fictional demo candidates if they do not already exist:
- Jordan Lee — `jordan.lee@example.test`
- Avery Patel — `avery.patel@example.test`
- Morgan Chen — `morgan.chen@example.test`

Their temporary passwords are generated at setup time and printed only once.

## Production notes

- Set `NODE_ENV=production`, a strong `SESSION_SECRET`, `DATABASE_FILE`, and `APP_ORIGIN` in the deployment environment.
- Serve the app over HTTPS. The session cookie is marked Secure in production.
- Build the frontend using `npm run build`, then start the server using `npm start`.
- The app serves the Vite build from `dist` in production.
- The SQLite database and session store are kept under `data/` by default. Back up this folder.
- Use a persistent disk for SQLite when deploying. Do not use ephemeral storage for production data.
- Do not commit `.env`, database files, or generated credentials.
- For a production deployment, configure your reverse proxy and trusted proxy settings correctly. Review CSP, CSRF, session storage, backup, monitoring, and rate-limit settings before exposing the app publicly.

## API outline

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/change-password`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET/POST /api/v1/activities`
- `PUT /api/v1/activities/:id`
- `GET/POST /api/v1/learners`
- `POST /api/v1/learners/:id/reset-password`
- `GET /api/v1/learners/:id/assignments`
- `POST /api/v1/assignments`
- `PATCH /api/v1/assignments/:id/status`
- `GET /api/v1/me/assignments`
- `GET /api/v1/cohort-summary`

All write requests require the CSRF token returned by `GET /api/v1/auth/csrf`. Candidate endpoints derive the candidate identity from the authenticated session, never from a submitted learner ID.

## Tests

Run:

```powershell
npm test
```

The included tests cover required-field validation and allowed status values. The database enforces foreign keys, positive planned hours, and unique learner/activity assignments. Add integration tests against a temporary database before production deployment.

## Project structure

```text
learning-progress-tracker-track-b/
├── server/
│   ├── scripts/setup.js
│   ├── db.js
│   ├── middleware.js
│   ├── validation.js
│   └── server.js
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
├── data/                 # created automatically
├── .env.example
├── index.html
├── package.json
└── vite.config.js
```
