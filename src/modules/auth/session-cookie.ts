export const SESSION_COOKIE = 'reservet_session';

export function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === SESSION_COOKIE) {
      const value = part.slice(separator + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

// HttpOnly: JavaScript no puede leerla (mitiga robo por XSS).
// SameSite=Strict: el navegador no la envía en peticiones iniciadas desde otros sitios (mitiga CSRF).
// Secure: solo por HTTPS; en desarrollo local se usa HTTP y no puede activarse.
export function buildSessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  const attributes = ['HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${maxAgeSeconds}`];
  if (secure) attributes.push('Secure');
  return `${SESSION_COOKIE}=${token}; ${attributes.join('; ')}`;
}

export function buildClearedSessionCookie(secure: boolean): string {
  return buildSessionCookie('', 0, secure);
}
