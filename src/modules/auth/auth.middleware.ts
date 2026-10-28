import type { RequestHandler } from 'express';
import type { AuthService } from './auth.service.js';
import { readSessionCookie } from './session-cookie.js';

// La protección ocurre en el servidor: ocultar botones en la interfaz no sustituye esto.
export function createRequireAuth(service: AuthService): RequestHandler {
  return async (req, res, next) => {
    const token = readSessionCookie(req.headers.cookie);
    const user = token ? await service.getSession(token) : null;
    if (!user) {
      res.status(401).json({
        code: 'UNAUTHENTICATED',
        message: 'Autenticación requerida',
        requestId: res.locals.requestId,
      });
      return;
    }
    res.locals.user = user;
    next();
  };
}
