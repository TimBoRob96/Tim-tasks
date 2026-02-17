import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const app = express();
const port = Number(process.env.PORT || 3001);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL environment variable.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, 'dist');

app.use(express.json());

const validColumns = new Set(['todo', 'doing', 'done']);

async function initializeDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      column_id TEXT NOT NULL CHECK (column_id IN ('todo', 'doing', 'done')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/tasks', async (_req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, title, column_id AS column FROM tasks ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/tasks', async (req, res, next) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';

  if (!title) {
    res.status(400).json({ error: 'Title is required.' });
    return;
  }

  try {
    const id = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO tasks (id, title, column_id)
       VALUES ($1, $2, 'todo')
       RETURNING id, title, column_id AS column`,
      [id, title]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/tasks/:id', async (req, res, next) => {
  const { id } = req.params;
  const column = typeof req.body?.column === 'string' ? req.body.column : '';

  if (!validColumns.has(column)) {
    res.status(400).json({ error: 'Invalid column.' });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE tasks
       SET column_id = $2
       WHERE id = $1
       RETURNING id, title, column_id AS column`,
      [id, column]
    );

    if (!result.rowCount) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error.' });
});

initializeDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
