import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { integrationSkip, startIntegrationApp, testUrl } from './support/integration.js';

const skip = integrationSkip();
const USERNAME = 'tables-test-user';
const PASSWORD = 'tables-test-password';

describe('API de mesas con PostgreSQL real', { skip }, () => {
  let env;
  let client;
  let call;

  before(async () => {
    env = await startIntegrationApp();
    await env.createUser(USERNAME, PASSWORD);
    client = env.createClient();
    assert.equal((await client.login(USERNAME, PASSWORD)).response.status, 200);
    call = client.call.bind(client);
  });

  beforeEach(async () => {
    await env.pool.query('TRUNCATE restaurant_tables RESTART IDENTITY');
  });

  after(async () => {
    await env.pool.query('DELETE FROM users WHERE username = $1', [USERNAME]);
    await env.stop();
  });

  test('lista vacía, crea una mesa disponible y la lista', async () => {
    assert.deepEqual((await call('GET', '/api/tables')).payload, []);

    const created = await call('POST', '/api/tables', { name: '  Mesa 1  ', capacity: 4 });
    assert.equal(created.response.status, 201);
    assert.deepEqual(created.payload, { id: 1, name: 'Mesa 1', capacity: 4, status: 'available' });

    const listed = await call('GET', '/api/tables');
    assert.equal(listed.response.status, 200);
    assert.deepEqual(listed.payload, [created.payload]);
  });

  test('los datos quedan confirmados en PostgreSQL (otra conexión los ve)', async () => {
    await call('POST', '/api/tables', { name: 'Terraza', capacity: 6 });
    const other = new pg.Client({ connectionString: testUrl });
    await other.connect();
    try {
      const { rows } = await other.query('SELECT name, capacity, status FROM restaurant_tables');
      assert.deepEqual(rows, [{ name: 'Terraza', capacity: 6, status: 'available' }]);
    } finally {
      await other.end();
    }
  });

  test('acepta los límites de capacidad 1 y 20', async () => {
    assert.equal(
      (await call('POST', '/api/tables', { name: 'Min', capacity: 1 })).response.status,
      201,
    );
    assert.equal(
      (await call('POST', '/api/tables', { name: 'Max', capacity: 20 })).response.status,
      201,
    );
  });

  test('rechaza datos inválidos con 400 y sin detalles internos', async () => {
    const invalid = [
      { name: 'A', capacity: 0 },
      { name: 'A', capacity: 21 },
      { name: 'A', capacity: '4' },
      { name: 'A', capacity: 2.5 },
      { name: 'A' },
      { name: '   ', capacity: 2 },
      { name: 'x'.repeat(81), capacity: 2 },
      { name: 123, capacity: 2 },
      {},
      [],
    ];
    for (const body of invalid) {
      const { response, payload } = await call('POST', '/api/tables', body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(payload.code, 'VALIDATION_ERROR');
      assert.equal(payload.requestId, response.headers.get('x-request-id'));
      assert.equal(payload.stack, undefined);
    }
    assert.deepEqual((await call('GET', '/api/tables')).payload, []);
  });

  test('nombre duplicado responde 409', async () => {
    await call('POST', '/api/tables', { name: 'Mesa 1', capacity: 4 });
    const { response, payload } = await call('POST', '/api/tables', {
      name: 'Mesa 1',
      capacity: 2,
    });
    assert.equal(response.status, 409);
    assert.equal(payload.code, 'TABLE_NAME_CONFLICT');
    assert.equal((await call('GET', '/api/tables')).payload.length, 1);
  });

  test('cambia el estado, devuelve la mesa completa y lo persiste', async () => {
    const { payload: table } = await call('POST', '/api/tables', { name: 'Mesa 1', capacity: 4 });
    for (const status of ['occupied', 'out_of_service', 'available']) {
      const { response, payload } = await call('PATCH', `/api/tables/${table.id}/status`, {
        status,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(payload, { ...table, status });
      assert.equal((await call('GET', '/api/tables')).payload[0].status, status);
    }
  });

  test('estado o id inválidos responden 400; mesa inexistente 404', async () => {
    const { payload: table } = await call('POST', '/api/tables', { name: 'Mesa 1', capacity: 4 });
    const badStatus = await call('PATCH', `/api/tables/${table.id}/status`, { status: 'roto' });
    assert.equal(badStatus.response.status, 400);
    for (const id of ['abc', '0', '-1', '1.5', '99999999999']) {
      const { response } = await call('PATCH', `/api/tables/${id}/status`, { status: 'occupied' });
      assert.equal(response.status, 400, `id ${id}`);
    }
    const missing = await call('PATCH', '/api/tables/999/status', { status: 'occupied' });
    assert.equal(missing.response.status, 404);
    assert.equal(missing.payload.code, 'TABLE_NOT_FOUND');
    assert.equal((await call('GET', '/api/tables')).payload[0].status, 'available');
  });

  test('el SQL va parametrizado: un nombre malicioso se guarda como texto', async () => {
    const name = "x'); DROP TABLE restaurant_tables; --";
    assert.equal((await call('POST', '/api/tables', { name, capacity: 2 })).response.status, 201);
    const { payload } = await call('GET', '/api/tables');
    assert.equal(payload[0].name, name);
  });
});
