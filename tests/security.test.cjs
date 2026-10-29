'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('both entrypoints load the patched browser bundle of js-yaml', () => {
  for (const file of ['index.html', 'ganfpu.html']) {
    const html = read(file);
    const pinned = 'https://cdn.jsdelivr.net/npm/js-yaml@4.3.2/dist/js-yaml.min.js';
    assert.equal(html.split(pinned).length - 1, 1, file);
    assert.doesNotMatch(html, /js-yaml\/(?:4\.1\.0|4\.1\.1)\//, file);
  }
});

test('service worker installs with only existing local assets', async () => {
  const handlers = {};
  let precached = [];
  const self = {
    registration: { scope: 'https://example.test/Gen_Ai_Normalizer_For_Power_Users/' },
    addEventListener: (name, callback) => { handlers[name] = callback; },
    skipWaiting() {},
    clients: { claim() {} },
  };
  const caches = {
    open: async () => ({
      addAll: async assets => { precached = assets; },
    }),
    keys: async () => [],
  };
  vm.runInNewContext(read('sw.js'), { self, caches, console, URL });

  let installPromise;
  handlers.install({ waitUntil: promise => { installPromise = promise; } });
  await installPromise;

  assert.ok(precached.length >= 82);
  for (const asset of precached) {
    assert.ok(asset.startsWith('./'), 'asset must be relative: ' + asset);
    assert.ok(fs.existsSync(path.join(root, asset)), 'missing: ' + asset);
  }
  assert.equal(new Set(precached).size, precached.length, 'cache entries should be unique');

  let intercepted = false;
  handlers.fetch({
    request: { method: 'GET', url: 'https://cdn.jsdelivr.net/npm/js-yaml@4.3.2/dist/js-yaml.min.js' },
    respondWith: () => { intercepted = true; },
  });
  assert.equal(intercepted, false, 'CDN requests must not be intercepted');

  handlers.fetch({
    request: { method: 'GET', url: 'https://example.test/other-project/app.js' },
    respondWith: () => { intercepted = true; },
  });
  assert.equal(intercepted, false, 'other project requests must not be intercepted');
});
