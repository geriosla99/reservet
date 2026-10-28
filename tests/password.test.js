import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.ts';

// No usa base de datos ni red.
test('hashPassword usa scrypt con sal única y verifyPassword lo comprueba', async () => {
  const first = await hashPassword('clave-de-prueba');
  const second = await hashPassword('clave-de-prueba');
  assert.match(first, /^scrypt\$/);
  assert.notEqual(first, second);
  assert.ok(!first.includes('clave-de-prueba'));
  assert.equal(await verifyPassword('clave-de-prueba', first), true);
  assert.equal(await verifyPassword('otra-clave', first), false);
});

test('los hashes nuevos cumplen el coste mínimo equivalente de OWASP (N=2^16, r=8, p=2)', async () => {
  const [, n, r, p] = (await hashPassword('clave-de-prueba')).split('$');
  assert.deepEqual([n, r, p], ['65536', '8', '2']);
});

test('los hashes antiguos (N=2^14, r=8, p=1) siguen verificándose', async () => {
  const salt = randomBytes(16);
  const key = scryptSync('clave-antigua', salt, 64, { N: 16384, r: 8, p: 1 });
  const stored = `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
  assert.equal(await verifyPassword('clave-antigua', stored), true);
  assert.equal(await verifyPassword('otra', stored), false);
});

test('verifyPassword rechaza hashes mal formados o con costes absurdos sin lanzar errores', async () => {
  const absurd = `scrypt$1073741824$8$1$${randomBytes(16).toString('base64')}$${randomBytes(64).toString('base64')}`;
  for (const stored of ['', 'texto-plano', 'scrypt$1$2', 'sha256$1$2$3$4$5', absurd]) {
    assert.equal(await verifyPassword('x', stored), false, stored);
  }
});
