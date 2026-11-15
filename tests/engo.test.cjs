const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function cycles(){
  const ctx=vm.createContext({Date,Intl});
  vm.runInContext(fs.readFileSync('public/engo.js','utf8'),ctx);
  return vm.runInContext('EngoCycles',ctx);
}
const example=[
 'data;godzina;stan',
 '2024-11-15;17:12;ON',
 '2024-11-15;17:18;OFF',
 '2024-11-15;17:31;ON',
 '2024-11-15;17:46;OFF',
 '2024-11-15;18:13;ON',
 '2024-11-15;18:32;OFF',
 '2024-11-15;19:02;ON',
 '2024-11-15;19:23;OFF',
 '2024-11-15;19:52;ON',
 '2024-11-15;20:04;OFF',
].join('\n');

test('ENGO screenshot CSV creates five cycles totalling 73 minutes',()=>{
 const engine=cycles(),res=engine.parse(example);
 assert.equal(res.added,10);
 assert.equal(res.skipped,0);
 assert.equal(res.rows.length,10);
 const a=engine.analyze(res.rows);
 assert.equal(a.pairs.length,5);
 assert.equal(a.totalMinutes,73);
 assert.equal(a.incomplete,0);
 assert.equal(a.days[0].day,'2024-11-15');
 assert.equal(a.days[0].count,5);
 assert.ok(Math.abs(a.days[0].ratio-100*73/172)<0.01);
});

test('reimport does not duplicate events and preserves previous records',()=>{
 const engine=cycles(),first=engine.parse(example);
 const second=engine.parse(example,first.rows);
 assert.equal(second.added,0);
 assert.equal(second.skipped,10);
 assert.equal(second.rows.length,10);
 assert.equal(first.rows[0].status,'on');
});

test('import rejects corrupt rows and conflicting same-minute events',()=>{
 const engine=cycles(),single=engine.parse('2024-01-01;08:00;ON');
 for(const input of [
  '2024-02-30;08:00;ON',
  '2024-01-01;25:00;ON',
  '2024-01-01;08:00;MAYBE',
  '2024-01-01;08:00;ON\n2024-01-01;08:00;OFF',
  '2024-01-01;08:00',
  '2024-01-01;08:00;ON\nbad',
  '3000-01-01;08:00;ON',
 ])assert.throws(()=>engine.parse(input),/Wiersz/);
 assert.throws(()=>engine.parse('2024-01-01;08:00;OFF',single.rows),/sprzeczne/);
 assert.equal(single.rows.length,1);
});

test('incomplete and overnight cycles are not silently counted as full day observation',()=>{
 const engine=cycles();
 const missing=engine.parse('2024-11-15;17:00;ON\n2024-11-15;17:20;ON\n2024-11-15;17:40;OFF');
 const a=engine.analyze(missing.rows);
 assert.equal(a.totalMinutes,20);
 assert.equal(a.incomplete,1);
 const overnight=engine.parse('2024-11-15;23:50;ON\n2024-11-16;00:10;OFF');
 const b=engine.analyze(overnight.rows);
 assert.equal(b.totalMinutes,20);
 assert.equal(b.days.find(d=>d.day==='2024-11-15').ratio,null);
});
