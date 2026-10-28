import { test } from 'node:test';
import assert from 'node:assert/strict';

// Regresión: el idioma se guardaba en 'reservet.language' pero se leía de 'reservet.lang',
// así que la preferencia nunca se recuperaba al recargar la página.
test('el idioma elegido se conserva al recargar', async () => {
  const previous = globalThis.localStorage;
  const store = new Map([['reservet.language', 'ru']]);
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
  };
  try {
    const { locale } = await import('../public/i18n.js');
    assert.equal(locale(), 'ru');
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
