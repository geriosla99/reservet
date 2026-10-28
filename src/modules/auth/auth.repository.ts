import type { Pool } from 'pg';

export interface User {
  id: number;
  username: string;
}

export interface UserWithHash extends User {
  passwordHash: string;
}

export function createAuthRepository(db: Pick<Pool, 'query'>) {
  return {
    async findUserByUsername(username: string): Promise<UserWithHash | null> {
      const result = await db.query<UserWithHash>(
        `SELECT id, username, password_hash AS "passwordHash"
           FROM users WHERE lower(username) = lower($1)`,
        [username],
      );
      return result.rows[0] ?? null;
    },

    // Usado por el seed: crea el usuario o actualiza su contraseña si ya existe.
    async upsertUser(username: string, passwordHash: string): Promise<User> {
      const result = await db.query<User>(
        `INSERT INTO users (username, password_hash) VALUES ($1, $2)
         ON CONFLICT (lower(username)) DO UPDATE SET password_hash = EXCLUDED.password_hash
         RETURNING id, username`,
        [username, passwordHash],
      );
      return result.rows[0]!;
    },

    async createSession(tokenHash: string, userId: number, expiresAt: Date): Promise<void> {
      await db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
        tokenHash,
        userId,
        expiresAt,
      ]);
    },

    async findUserBySession(tokenHash: string): Promise<User | null> {
      const result = await db.query<User>(
        `SELECT u.id, u.username
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },

    async deleteSession(tokenHash: string): Promise<void> {
      await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    },

    async deleteExpiredSessions(): Promise<void> {
      await db.query('DELETE FROM sessions WHERE expires_at <= now()');
    },
  };
}
