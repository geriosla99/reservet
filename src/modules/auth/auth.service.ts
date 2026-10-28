import { createHash, randomBytes } from 'node:crypto';
import { HttpError } from '../../shared/http-error.js';
import type { User, createAuthRepository } from './auth.repository.js';
import { hashPassword, verifyPassword } from './password.js';

type AuthRepository = ReturnType<typeof createAuthRepository>;

// Caducidad absoluta: la sesión termina 8 horas después del login, aunque se use.
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const MAX_USERNAME_LENGTH = 50;
const MAX_PASSWORD_LENGTH = 200;

// Hash de una contraseña inexistente: se verifica igualmente cuando el usuario no existe,
// para que el tiempo de respuesta no revele qué usuarios están registrados.
const dummyHash = hashPassword('contraseña-que-nadie-usa');

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function invalid(message: string): HttpError {
  return new HttpError(400, 'VALIDATION_ERROR', message);
}

export function createAuthService(repository: AuthRepository) {
  return {
    async login(input: unknown): Promise<{ token: string; user: User }> {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw invalid('El cuerpo debe ser un objeto JSON');
      }
      const { username, password } = input as Record<string, unknown>;
      if (typeof username !== 'string' || typeof password !== 'string') {
        throw invalid('Usuario y contraseña son obligatorios');
      }
      const name = username.trim();
      if (name.length === 0 || name.length > MAX_USERNAME_LENGTH || password.length === 0) {
        throw invalid('Usuario y contraseña son obligatorios');
      }
      // Límite para que una contraseña enorme no se use para agotar la CPU con scrypt.
      if (password.length > MAX_PASSWORD_LENGTH) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
      }

      const found = await repository.findUserByUsername(name);
      const valid = await verifyPassword(password, found?.passwordHash ?? (await dummyHash));
      if (!found || !valid) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
      }

      await repository.deleteExpiredSessions();
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
      await repository.createSession(hashToken(token), found.id, expiresAt);
      return { token, user: { id: found.id, username: found.username } };
    },

    getSession: (token: string): Promise<User | null> =>
      repository.findUserBySession(hashToken(token)),

    // Revocar = borrar la fila: el token deja de servir al instante, aunque no haya caducado.
    logout: (token: string): Promise<void> => repository.deleteSession(hashToken(token)),
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
