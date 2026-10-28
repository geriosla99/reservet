import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
) => Promise<Buffer>;

// OWASP (Password Storage Cheat Sheet) pide como mínimo N=2^17, r=8, p=1 para scrypt, o una
// combinación de coste equivalente. Se usa N=2^16, r=8, p=2: unos 64 MiB y ~0,3 s por hash.
// Los parámetros viajan dentro del hash guardado, así que pueden subirse en el futuro y los
// hashes anteriores (por ejemplo N=2^14) siguen verificándose.
const N = 65536;
const R = 8;
const P = 2;
const KEY_LENGTH = 64;
// Memoria máxima por derivación (scrypt necesita ~128·N·r bytes): protege de hashes alterados.
const MAX_MEMORY = 256 * 1024 * 1024;

// Formato almacenado: scrypt$N$r$p$sal$hash (sal y hash en base64).
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEMORY });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  try {
    const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAX_MEMORY,
    });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    // Parámetros inválidos o excesivos en un hash guardado: no se acepta, pero no es un 500.
    return false;
  }
}
