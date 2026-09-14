const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'normal-mode.js'), 'utf8');

assert.match(source, /function startNormalNormalize\(\)/);
assert.doesNotMatch(source, /ganfpuStartGrill/);
assert.doesNotMatch(source, /ganfpuCore\?\.step/);
assert.doesNotMatch(source, /ganfpuRequirementDiscovery/);
assert.match(source, /task\.value = intent/);

console.log('normal-mode separation: passed');
