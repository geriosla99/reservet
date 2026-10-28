import { pool } from '../src/shared/database.js';
import { createAuthRepository } from '../src/modules/auth/auth.repository.js';
import { hashPassword } from '../src/modules/auth/password.js';

// Crea (o actualiza la contraseña de) un usuario de prueba. Es repetible.
// Las credenciales llegan por variables de entorno para no guardarlas en Git.
const username = process.env.SEED_USERNAME?.trim();
const password = process.env.SEED_PASSWORD;

try {
  if (!username || !password) {
    throw new Error('Define SEED_USERNAME y SEED_PASSWORD (consulta el README).');
  }
  if (username.length > 50) throw new Error('SEED_USERNAME admite hasta 50 caracteres.');
  if (password.length < 8 || password.length > 200) {
    throw new Error('SEED_PASSWORD debe tener entre 8 y 200 caracteres.');
  }
  const user = await createAuthRepository(pool).upsertUser(username, await hashPassword(password));
  console.log(`Usuario listo: ${user.username} (id ${user.id})`);
} catch (error) {
  console.error('Seed fallido:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
