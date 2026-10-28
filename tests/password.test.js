import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('verifyPassword rechaza hashes mal formados sin lanzar errores', async () => {
  for (const stored of ['', 'texto-plano', 'scrypt$1$2', 'sha256$1$2$3$4$5']) {
    assert.equal(await verifyPassword('x', stored), false, stored);
  }
});
