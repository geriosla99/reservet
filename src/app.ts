import express from 'express';
import { pool } from './shared/database.js';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { HttpError } from './shared/http-error.js';
import { createTablesRouter } from './modules/tables/tables.routes.js';
import { createAuthRepository } from './modules/auth/auth.repository.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createRequireAuth } from './modules/auth/auth.middleware.js';

export const app = express();
app.disable('x-powered-by');
app.use(
  helmet({
    // Desarrollo local usa HTTP. HTTPS/HSTS se configuran al desplegar.
    strictTransportSecurity: false,
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
  }),
);
app.use((_req, res, next) => {
  res.locals.requestId = randomUUID();
  res.setHeader('X-Request-Id', res.locals.requestId);
  next();
});
app.use(express.json({ limit: '16kb' }));
app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'reservet' });
});

app.get('/health/db', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

const authService = createAuthService(createAuthRepository(pool));
app.use('/api/auth', createAuthRouter(authService));
// Todo el módulo de mesas exige sesión válida, decidido en el servidor.
app.use('/api/tables', createRequireAuth(authService), createTablesRouter());

app.use((_req, res) => res.status(404).json({ message: 'Ruta no encontrada' }));
app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) {
      res
        .status(error.status)
        .json({ code: error.code, message: error.message, requestId: res.locals.requestId });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res
        .status(400)
        .json({ code: 'INVALID_JSON', message: 'JSON inválido', requestId: res.locals.requestId });
      return;
    }
    if (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      error.type === 'entity.too.large'
    ) {
      res.status(413).json({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'JSON demasiado grande',
        requestId: res.locals.requestId,
      });
      return;
    }
    // No registrar cuerpos, credenciales ni parámetros SQL.
    console.error({
      event: 'request_failed',
      requestId: res.locals.requestId,
      error: error instanceof Error ? error.name : 'UnknownError',
    });
    res
      .status(500)
      .json({ code: 'INTERNAL_ERROR', message: 'Error interno', requestId: res.locals.requestId });
  },
);
