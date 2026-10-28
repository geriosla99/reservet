import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

// Regresión: la búsqueda distinguía mayúsculas y minúsculas. Buscar "Terraza" (con la
// mayúscula con la que aparece el nombre) no devolvía mesas, aunque "terraza" sí.
test('la búsqueda por nombre no distingue mayúsculas y minúsculas', async () => {
  const dom = new JSDOM(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'), {
    url: 'http://localhost',
  });
  const previous = {};
  for (const key of ['document', 'localStorage', 'Option', 'fetch'])
    previous[key] = globalThis[key];
  try {
    for (const key of ['document', 'localStorage', 'Option']) globalThis[key] = dom.window[key];
    globalThis.fetch = async () => assert.fail('El modo demo no debe usar la red');
    const { document } = dom.window;
    const $ = (selector) => document.querySelector(selector);
    await import('../public/app.js');
    const search = (value) => {
      $('#search').value = value;
      $('#search').dispatchEvent(new dom.window.Event('input', { cancelable: true }));
      return document.querySelectorAll('.table-card').length;
    };
    assert.equal(search(''), 6);
    for (const text of ['terraza', 'Terraza', 'TERRAZA', ' tErRaZa ']) {
      assert.equal(search(text), 2, `búsqueda: "${text}"`);
    }
    assert.equal(search('inexistente'), 0);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    dom.window.close();
  }
});
