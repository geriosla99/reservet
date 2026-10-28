import { Router } from 'express';
import { config } from '../../shared/config.js';
import { HttpError } from '../../shared/http-error.js';
import { SESSION_TTL_SECONDS, type AuthService } from './auth.service.js';
import {
  buildClearedSessionCookie,
  buildSessionCookie,
  readSessionCookie,
} from './session-cookie.js';

export function createAuthRouter(service: AuthService) {
  const router = Router();
  const secure = config.appEnv === 'pro';

  router.post('/login', async (req, res) => {
    const { token, user } = await service.login(req.body);
    res.setHeader('Set-Cookie', buildSessionCookie(token, SESSION_TTL_SECONDS, secure));
    res.json({ user });
  });

  router.post('/logout', async (req, res) => {
    const token = readSessionCookie(req.headers.cookie);
    if (token) await service.logout(token);
    res.setHeader('Set-Cookie', buildClearedSessionCookie(secure));
    res.status(204).end();
  });

  router.get('/session', async (req, res) => {
    const token = readSessionCookie(req.headers.cookie);
    const user = token ? await service.getSession(token) : null;
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
    res.json({ user });
  });

  return router;
}
