import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('idiomas, datos de usuario, estados y errores funcionan sin base ni red', async () => {
  const dom = new JSDOM(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'), {
    url: 'http://localhost',
  });
  const previous = {};
  for (const key of ['document', 'localStorage', 'Option', 'fetch'])
    previous[key] = globalThis[key];
  try {
    for (const key of ['document', 'localStorage', 'Option']) globalThis[key] = dom.window[key];
    const { document, localStorage } = dom.window;
    const $ = (selector) => document.querySelector(selector);
    const event = (type) => new dom.window.Event(type, { cancelable: true });
    // Simular solo la API de diálogo que JSDOM todavía no implementa.
    $('#table-dialog').close = () => {};
    await import('../public/app.js');
    const { t } = await import('../public/i18n.js');
    assert.equal(
      $('#logout').hidden,
      false,
      'la acción de autenticación debe ser visible en modo demo',
    );
    assert.equal($('#logout').textContent, t('login'), 'sin sesión debe invitar a iniciar sesión');
    for (const language of ['es', 'en', 'ru']) {
      $('#language').value = language;
      $('#language').dispatchEvent(event('change'));
      assert.equal(document.documentElement.lang, language);
      assert.equal($('#app-content h1').textContent.trim(), t('headline'));
      assert.equal($('.badge').textContent, t('available'));
      assert.equal(localStorage.getItem('reservet.language'), language);
      assert.equal(document.querySelectorAll('.table-card').length, 6);
    }
    const status = $('.card-bottom select');
    status.value = 'occupied';
    status.dispatchEvent(event('change'));
    assert.equal($('#occupied').textContent, '3');
    $('#table-name').value = '<img src=x onerror=alert(1)>';
    $('#table-capacity').value = '20';
    $('#table-form').dispatchEvent(event('submit'));
    assert.equal(document.querySelectorAll('.table-card').length, 7);
    assert.equal(
      [...document.querySelectorAll('.card-body p')].at(-1).textContent,
      t('seats', { count: 20 }),
    );
    assert.equal(document.querySelectorAll('.table-card img').length, 0);
    $('#language').value = 'en';
    $('#language').dispatchEvent(event('change'));
    assert.equal(
      [...document.querySelectorAll('.card-body h3')].at(-1).textContent,
      '<img src=x onerror=alert(1)>',
    );
    $('#search').value = 'TERRACE';
    $('#search').dispatchEvent(event('input'));
    assert.equal(document.querySelectorAll('.table-card').length, 2);
    $('#search').value = 'no matches';
    $('#search').dispatchEvent(event('input'));
    assert.equal($('.empty h3').textContent, t('noMatches'));
    $('#search').value = '';
    globalThis.fetch = async (url) => ({
      ok: false,
      status: url === '/api/auth/session' ? 401 : 404,
      json: async () => ({}),
    });
    $('#source').value = 'api';
    $('#source').dispatchEvent(event('change'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    $('#language').value = 'ru';
    $('#language').dispatchEvent(event('change'));
    assert.equal($('#login-panel').hidden, false);
    assert.equal($('#login-error').textContent, '');
    assert.equal(document.querySelectorAll('.table-card').length, 7);
    globalThis.fetch = async (url, options = {}) => {
      if (url === '/api/auth/login') {
        assert.equal(options.method, 'POST');
        assert.equal(JSON.parse(options.body).username, 'qa-user');
        return {
          ok: true,
          status: 200,
          json: async () => ({ user: { id: 1, username: 'qa-user' } }),
        };
      }
      if (url === '/api/tables') return { ok: true, status: 200, json: async () => [] };
      if (url === '/api/auth/logout') return { ok: true, status: 204, json: async () => null };
      return { ok: false, status: 401, json: async () => ({}) };
    };
    $('#login-username').value = 'qa-user';
    $('#login-password').value = 'not-a-real-password';
    $('#login-form').dispatchEvent(event('submit'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal($('#login-panel').hidden, true);
    assert.equal($('#logout').hidden, false);
    assert.equal($('#logout').textContent, t('logout'));
    $('#logout').dispatchEvent(event('click'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal($('#login-panel').hidden, false);
    assert.equal($('#logout').hidden, true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    dom.window.close();
  }
});
