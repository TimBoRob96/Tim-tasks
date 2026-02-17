import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const app = express();
const port = Number(process.env.PORT || 8080);
const databaseUrl = process.env.DATABASE_URL;
const writePassword = process.env.WRITE_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET || writePassword;

if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL environment variable.');
}
if (!writePassword) {
  throw new Error('Missing WRITE_PASSWORD environment variable.');
}
if (!sessionSecret) {
  throw new Error('Missing SESSION_SECRET environment variable.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, 'dist');

app.set('trust proxy', true);
app.use(express.json({ limit: '10kb' }));

const validColumns = new Set(['todo', 'doing', 'done']);
const writeRateWindowMs = 60_000;
const maxWritesPerWindow = 30;
const writesByIp = new Map();
const sessionCookieName = 'timtasks_session';
const sessionTtlMs = 1000 * 60 * 60 * 12;

function getClientIp(req) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return String(ip);
}

function safeCompare(secret, provided) {
  const secretBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  if (secretBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(secretBuffer, providedBuffer);
}

function sanitizeTitle(value) {
  const withoutControls = value.replace(/[\u0000-\u001f\u007f]/g, '');
  return withoutControls.replace(/\s+/g, ' ').trim();
}

function requireWriteAuth(req, res, next) {
  const token = getCookie(req, sessionCookieName);
  if (!token || !isValidSessionToken(token)) {
    res.status(401).json({ error: 'Unauthorized write request.' });
    return;
  }
  next();
}

function writeRateLimit(req, res, next) {
  const now = Date.now();
  const ip = getClientIp(req);
  const existing = writesByIp.get(ip) || [];
  const recent = existing.filter((timestamp) => now - timestamp < writeRateWindowMs);

  if (recent.length >= maxWritesPerWindow) {
    res.status(429).json({ error: 'Rate limit exceeded. Try again shortly.' });
    return;
  }

  recent.push(now);
  writesByIp.set(ip, recent);
  next();
}

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return '';
  const pairs = cookieHeader.split(';');

  for (const pair of pairs) {
    const [rawName, ...rawValue] = pair.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }
  return '';
}

function signValue(value) {
  return createHmac('sha256', sessionSecret).update(value).digest('hex');
}

function createSessionToken() {
  const payload = {
    nonce: randomBytes(16).toString('hex'),
    exp: Date.now() + sessionTtlMs
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function isValidSessionToken(token) {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return false;
  if (!safeCompare(signValue(encodedPayload), signature)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

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

app.get('/api/auth-status', (req, res) => {
  const token = getCookie(req, sessionCookieName);
  res.json({ canWrite: Boolean(token && isValidSessionToken(token)) });
});

app.post('/api/login', writeRateLimit, (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password || !safeCompare(writePassword, password)) {
    res.status(401).json({ error: 'Invalid password.' });
    return;
  }

  res.cookie(sessionCookieName, createSessionToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: sessionTtlMs,
    path: '/'
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
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

app.post('/api/tasks', requireWriteAuth, writeRateLimit, async (req, res, next) => {
  const rawTitle = typeof req.body?.title === 'string' ? req.body.title : '';
  const title = sanitizeTitle(rawTitle);

  if (!title) {
    res.status(400).json({ error: 'Title is required.' });
    return;
  }
  if (title.length > 140) {
    res.status(400).json({ error: 'Title must be 140 characters or fewer.' });
    return;
  }

  try {
    const id = randomUUID();
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

app.patch(
  '/api/tasks/:id',
  requireWriteAuth,
  writeRateLimit,
  async (req, res, next) => {
  const { id } = req.params;
  const column = typeof req.body?.column === 'string' ? req.body.column : '';
  const uuidV4Pattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidV4Pattern.test(id)) {
    res.status(400).json({ error: 'Invalid task id.' });
    return;
  }
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
  }
);

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
    app.listen(port, '0.0.0.0', () => {
      console.log(`Server listening on 0.0.0.0:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
