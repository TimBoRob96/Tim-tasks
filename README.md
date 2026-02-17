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
4. Start app:
   ```bash
   npm run dev
   ```

This runs:
- Vite client on `http://localhost:5173`
- Express API on `http://localhost:3001`

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

## GitHub auto-deploy

1. Push this repo to GitHub.
2. Add repo secret:
   - `FLY_API_TOKEN`: output of `fly auth token`
3. Push to `main` to trigger `.github/workflows/deploy.yml`.

## Runtime

- Docker image builds React assets and runs `server.mjs`.
- Express serves `/api/*` and static frontend from `dist/`.
