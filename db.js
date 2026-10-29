import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
export function openDatabase(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(resolve(dir, 'portal.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,company TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','client')),active INTEGER NOT NULL DEFAULT 1,must_change INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS prototypes(id TEXT PRIMARY KEY,title TEXT NOT NULL,client TEXT NOT NULL,description TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated TEXT NOT NULL,html BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS access(user_id TEXT REFERENCES users(id) ON DELETE CASCADE,prototype_id TEXT REFERENCES prototypes(id) ON DELETE CASCADE,PRIMARY KEY(user_id,prototype_id));
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
  `);
  return db;
}
export function transaction(db, fn) { db.exec('BEGIN IMMEDIATE'); try { const result=fn(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } }
