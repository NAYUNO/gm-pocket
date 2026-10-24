// Accès base de données : Postgres (Render) en prod, PGlite en mémoire pour les tests locaux.
import pg from 'pg';

let backend;

export async function initDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquant');

  if (url.startsWith('pglite')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    backend = { query: (text, params) => db.query(text, params) };
  } else {
    const pool = new pg.Pool({
      connectionString: url,
      ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
    // Neon met la base en veille après 5 min : les connexions inactives sont coupées.
    // Sans ce gestionnaire, une connexion coupée ferait planter le serveur.
    pool.on('error', (err) => console.warn('Connexion Postgres fermée :', err.message));
    backend = { query: (text, params) => pool.query(text, params) };
  }

  await migrate();
}

export function query(text, params = []) {
  return backend.query(text, params);
}

async function migrate() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      players TEXT,
      duration TEXT,
      rules_md TEXT NOT NULL DEFAULT '',
      house_notes TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'ask',
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS imports (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS questions_game_idx ON questions(game_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS questions_user_idx ON questions(user_id, created_at)`,
  ];
  for (const s of statements) await query(s);
}
