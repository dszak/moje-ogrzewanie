const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/heads.js', 'utf8');
function instance() {
  const ctx = vm.createContext({});
  vm.runInContext(source, ctx);
  return code => vm.runInContext(code, ctx);
}
function payload(when) {
  const heads = {};
  for (let i = 1; i <= 8; i++) {
    heads['g' + i] = {temperature: 20 + i / 10, target_temperature: 22,
      calibration: -i / 2, mode_raw: 'standy'};
  }
  return {version: 1, last_sync: when, heads};
}
test('valid decrypted head data are parsed without contacting Tuya', async () => {
  const run = instance(), when = '2026-11-15T11:00:00Z';
  const now = Date.parse(when);
  const good = payload(when);
  const response = JSON.stringify(good);
  run(`Heads.accept(${response})`);
  assert.equal(run(`Heads.head("G1",${now}).temperature`), 20.1);
  assert.equal(run(`Heads.head("g8",${now}).calibration`), -4);
  assert.equal(run('Object.keys(Heads.lastSnapshot().heads).length'), 8);
  assert.equal(run(`Heads.status(${now}).ok`), true);
});
test('stale head data remain visible only as outdated snapshots', async () => {
  const run = instance(), when = '2026-11-15T11:00:00Z';
  const now = Date.parse(when), record = JSON.stringify(payload(when));
  run(`Heads.accept(${record})`);
  assert.equal(run(`Heads.head("G1",${now+21*60000})`),null);
  assert.equal(run('Heads.lastSnapshot().heads.g1.temperature'),20.1);
  assert.equal(run(`Heads.status(${now+21*60000}).ok`),false);
});
test('invalid readings never replace a valid previous head snapshot', async () => {
  const run = instance(), when = '2026-11-15T11:00:00Z';
  const now = Date.parse(when), good = JSON.stringify(payload(when));
  run(`Heads.accept(${good})`);
  const bad = payload(when); bad.heads.g5.target_temperature = '24';
  const broken = JSON.stringify(bad);
  assert.throws(()=>run(`Heads.accept(${broken})`));
  assert.equal(run('Heads.lastSnapshot().heads.g5.target_temperature'),22);
  assert.equal(run(`Heads.head("G5",${now}).target_temperature`),22);
});
