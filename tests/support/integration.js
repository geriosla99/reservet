import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import 'dotenv/config';

// Las pruebas de integración usan PostgreSQL real, pero SOLO la base de TEST_DATABASE_URL.
// Si falta, se omiten con un aviso; en CI (variable CI) su ausencia es un error.
export const testUrl = process.env.TEST_DATABASE_URL;

export function integrationSkip() {
  if (!testUrl && process.env.CI) throw new Error('TEST_DATABASE_URL es obligatoria en CI.');
  return testUrl ? false : 'Define TEST_DATABASE_URL para ejecutar las pruebas de integración.';
}

// Arranca la app real contra la base de pruebas, ya migrada.
export async function startIntegrationApp() {
  // Protección: nunca se trabaja con una base que no se llame *_test.
  assert.match(
    new URL(testUrl).pathname.slice(1),
    /_test$/,
    'TEST_DATABASE_URL debe apuntar a *_test',
  );

  // La app lee DATABASE_URL al importarse: se redirige a la base de pruebas.
  process.env.DATABASE_URL = testUrl;
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });

  const { app } = await import('../../src/app.ts');
  const { pool } = await import('../../src/shared/database.ts');
  const { hashPassword } = await import('../../src/modules/auth/password.ts');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  // Crea (o reinicia) un usuario propio de cada archivo de pruebas. No se vacía la tabla
  // de usuarios: los archivos se ejecutan en paralelo y comparten la base.
  async function createUser(username, password) {
    await pool.query('DELETE FROM users WHERE lower(username) = lower($1)', [username]);
    await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [
      username,
      await hashPassword(password),
    ]);
  }

  // Cliente HTTP con su propia "jarra de cookies", como un navegador.
  function createClient() {
    let cookie = null;
    return {
      get cookie() {
        return cookie;
      },
      set cookie(value) {
        cookie = value;
      },
      async call(method, path, body) {
        const headers = { 'Content-Type': 'application/json' };
        if (cookie) headers.Cookie = cookie;
        const response = await fetch(`${base}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        return { response, payload: text ? JSON.parse(text) : null };
      },
      async login(username, password) {
        const result = await this.call('POST', '/api/auth/login', { username, password });
        const setCookie = result.response.headers.get('set-cookie');
        if (result.response.status === 200 && setCookie) cookie = setCookie.split(';')[0];
        return result;
      },
    };
  }

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }

  return { base, pool, createUser, createClient, stop };
}
