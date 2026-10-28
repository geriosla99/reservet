import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { integrationSkip, startIntegrationApp } from './support/integration.js';

const skip = integrationSkip();
const USERNAME = 'auth-test-user';
const PASSWORD = 'auth-test-password';

describe('autenticación con sesión en PostgreSQL', { skip }, () => {
  let env;

  before(async () => {
    env = await startIntegrationApp();
    await env.createUser(USERNAME, PASSWORD);
  });

  after(async () => {
    await env.pool.query('DELETE FROM users WHERE username = $1', [USERNAME]);
    await env.stop();
  });

  test('la contraseña se guarda con scrypt, nunca en texto plano', async () => {
    const { rows } = await env.pool.query('SELECT password_hash FROM users WHERE username = $1', [
      USERNAME,
    ]);
    assert.match(rows[0].password_hash, /^scrypt\$/);
    assert.ok(!rows[0].password_hash.includes(PASSWORD));
  });

  test('login correcto responde 200 con cookie HttpOnly, SameSite=Strict y sin contraseña', async () => {
    const client = env.createClient();
    const { response, payload } = await client.login(USERNAME, PASSWORD);
    assert.equal(response.status, 200);
    assert.equal(payload.user.username, USERNAME);
    assert.equal(JSON.stringify(payload).includes('hash'), false);
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /Max-Age=28800/);
  });

  test('el nombre de usuario no distingue mayúsculas', async () => {
    const client = env.createClient();
    assert.equal((await client.login(USERNAME.toUpperCase(), PASSWORD)).response.status, 200);
  });

  test('login incorrecto responde 401 con el mismo mensaje para usuario y contraseña', async () => {
    const client = env.createClient();
    const wrongPassword = await client.login(USERNAME, 'incorrecta');
    const unknownUser = await client.login('no-existe', PASSWORD);
    for (const { response, payload } of [wrongPassword, unknownUser]) {
      assert.equal(response.status, 401);
      assert.equal(payload.code, 'INVALID_CREDENTIALS');
      assert.equal(response.headers.get('set-cookie'), null);
    }
    assert.equal(wrongPassword.payload.message, unknownUser.payload.message);
  });

  test('login con datos mal formados responde 400', async () => {
    const client = env.createClient();
    for (const body of [{}, { username: USERNAME }, { username: 1, password: 2 }, []]) {
      const { response } = await client.call('POST', '/api/auth/login', body);
      assert.equal(response.status, 400, JSON.stringify(body));
    }
  });

  test('sin sesión, todos los endpoints de mesas responden 401', async () => {
    const client = env.createClient();
    for (const [method, path, body] of [
      ['GET', '/api/tables'],
      ['POST', '/api/tables', { name: 'Mesa', capacity: 2 }],
      ['PATCH', '/api/tables/1/status', { status: 'occupied' }],
    ]) {
      const { response, payload } = await client.call(method, path, body);
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.equal(payload.code, 'UNAUTHENTICATED');
    }
  });

  test('una cookie inventada no da acceso', async () => {
    const client = env.createClient();
    client.cookie = 'reservet_session=token-falso';
    assert.equal((await client.call('GET', '/api/tables')).response.status, 401);
  });

  test('consulta de sesión: 401 sin login y 200 con login', async () => {
    const client = env.createClient();
    assert.equal((await client.call('GET', '/api/auth/session')).response.status, 401);
    await client.login(USERNAME, PASSWORD);
    const { response, payload } = await client.call('GET', '/api/auth/session');
    assert.equal(response.status, 200);
    assert.equal(payload.user.username, USERNAME);
  });

  test('logout revoca la sesión: la cookie antigua deja de funcionar', async () => {
    const client = env.createClient();
    await client.login(USERNAME, PASSWORD);
    const oldCookie = client.cookie;
    assert.equal((await client.call('GET', '/api/tables')).response.status, 200);

    const logout = await client.call('POST', '/api/auth/logout');
    assert.equal(logout.response.status, 204);
    assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/);

    // Se reutiliza la cookie robada/antigua: el servidor ya no la reconoce.
    const replay = env.createClient();
    replay.cookie = oldCookie;
    assert.equal((await replay.call('GET', '/api/tables')).response.status, 401);
    assert.equal((await replay.call('GET', '/api/auth/session')).response.status, 401);
  });

  test('una sesión caducada responde 401', async () => {
    const client = env.createClient();
    await client.login(USERNAME, PASSWORD);
    await env.pool.query(
      `UPDATE sessions SET expires_at = now() - interval '1 minute'
        WHERE user_id = (SELECT id FROM users WHERE username = $1)`,
      [USERNAME],
    );
    assert.equal((await client.call('GET', '/api/tables')).response.status, 401);
  });

  test('las rutas de salud siguen siendo públicas', async () => {
    const client = env.createClient();
    assert.equal((await client.call('GET', '/health')).response.status, 200);
    assert.equal((await client.call('GET', '/health/db')).response.status, 200);
  });
});
