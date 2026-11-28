const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/setti.js', 'utf8');
function instance() {
  const ctx = vm.createContext({});
  vm.runInContext(source, ctx);
  return code => vm.runInContext(code, ctx);
}
function payload(when = new Date().toISOString()) {
  const rooms = {};
  for (const id of ['bedroom', 'salon', 'kitchen', 'bigbath', 'smallbath', 'hall']) {
    rooms[id] = {temperature: 21.5, humidity: 52};
  }
  return {version: 1, last_sync: when, rooms};
}
test('decrypted Setti data are validated and accepted only while fresh', async () => {
  const run = instance();
  const good = payload();
  run(`Setti.accept(${JSON.stringify(good)})`);
  assert.equal(run('Setti.room("bedroom").temp'), 21.5);
  assert.equal(run('Object.keys(Setti.snapshot().rooms).length'), 6);
  assert.equal(run('Setti.status().ok'), true);
  assert.equal(run('Setti.isFresh(Setti.snapshot(),Date.now()+21*60*1000)'), false);
});
test('stale readings are not presented as current', async () => {
  const run = instance();
  const old = payload(new Date(Date.now()-30*60*1000).toISOString());
  run(`Setti.accept(${JSON.stringify(old)})`);
  assert.equal(run('Setti.snapshot()'), null);
  assert.equal(run('Setti.room("salon")'), null);
  assert.equal(run('Setti.status().ok'), false);
  assert.equal(run('Setti.lastRoom("salon").temp'), 21.5);
  assert.equal(run('Setti.lastRoom("salon").at'), old.last_sync);
  assert.equal(run('Setti.snapshot()'), null, 'stale values never become a live snapshot');
});
test('invalid readings cannot create false measurements', async () => {
  const run = instance();
  const bad = payload();
  bad.rooms.kitchen.temperature = '21.5';
  assert.throws(()=>run(`Setti.accept(${JSON.stringify(bad)})`));
  assert.equal(run('Setti.snapshot()'), null);

});
