# TimTasks Kanban (React + Fly.io + Neon)

Kanban board app with React + Vite frontend and a Node/Express API backed by Neon Postgres.

## Local dev

1. Install deps:
   ```bash
   npm install
   ```
2. Create env file:
   ```bash
   cp .env.example .env
   ```
3. Put your Neon connection string in `DATABASE_URL`.
4. Set a local write password in `WRITE_PASSWORD`.
5. Set `SESSION_SECRET` to a long random string.
6. Start app:
   ```bash
   npm run dev
   ```

This runs:
- Vite client on `http://localhost:5173`
- Express API on `http://localhost:3001`

## Write protection and limits

- `POST /api/tasks` and `PATCH /api/tasks/:id` require an authenticated session cookie.
- Login endpoint: `POST /api/login` with your password.
- Password is checked against server env `WRITE_PASSWORD`.
- Write endpoints are rate-limited per IP (30 requests per minute).
- Task titles are sanitized and limited to 140 chars.

In the UI, enter your password once to enable add/move actions, then a secure HttpOnly session cookie is used.

## Database

On startup, server creates a `tasks` table automatically if it does not exist.

## Fly.io setup

1. Create Fly app (once):
   ```bash
   fly launch --no-deploy --copy-config
   ```
2. If Fly generated a different app name, update `fly.toml` `app` value.
3. Set Neon URL as Fly secret:
   ```bash
   fly secrets set DATABASE_URL="<your-neon-connection-string>"
   ```
4. Set write password and session secret:
   ```bash
   fly secrets set WRITE_PASSWORD="<your-password>" SESSION_SECRET="<a-long-random-secret>"
   ```

## GitHub auto-deploy

1. Push this repo to GitHub.
2. Add repo secret:
   - `FLY_API_TOKEN`: output of `fly auth token`
3. Push to `main` to trigger `.github/workflows/deploy.yml`.

## Runtime

- Docker image builds React assets and runs `server.mjs`.
- Express serves `/api/*` and static frontend from `dist/`.
