import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeAdvisoryNative } from '../scripts/advisory-native-smoke.ts';

test('native advisory smoke isolates credentials, preserves hooks, trusts only fixture and checks warning', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'advisory-smoke-test-'));
  const file = join(directory, 'native.mjs');
  const ledger = join(directory, 'calls.json');
  await writeFile(file, `import fs from 'node:fs'; import readline from 'node:readline';
if(process.argv.includes('--version')) { console.log('codex-cli 0.164.0'); process.exit(0); }
if(process.env.OPENAI_API_KEY || process.env.TYPESAFE_API_KEY) process.exit(9);
const args=process.argv.slice(2); if(!args.some(x=>x.includes('127.0.0.1:9')) || !args.includes('app-server')) process.exit(8);
let trusted=false; const calls=[];
const send=v=>process.stdout.write(JSON.stringify(v)+'\\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line); calls.push(m); fs.writeFileSync(${JSON.stringify(ledger)},JSON.stringify({home:process.env.CODEX_HOME,calls}));
 if(m.id===undefined)return;
 let result={};
 if(m.method==='initialize')result={userAgent:'synthetic'};
 if(m.method==='hooks/list')result={data:[{warnings:[],errors:[],hooks:[
  {source:'user',eventName:'userPromptSubmit',key:'user',currentHash:'userhash',trustStatus:'untrusted',enabled:true},
  {source:'sessionFlags',eventName:'userPromptSubmit',key:'session',currentHash:'sessionhash',trustStatus:trusted?'trusted':'untrusted',enabled:true}]}]};
 if(m.method==='config/batchWrite'){if(m.params.edits.length!==1 || m.params.edits[0].keyPath!=='hooks.state."session".trusted_hash')process.exit(7);trusted=true;}
 if(m.method==='thread/start')result={thread:{id:'thread'},model:'gpt-6.1-sol',approvalPolicy:'never',sandbox:{type:'readOnly'}};
 send({id:m.id,result});
 if(m.method==='turn/start')send({method:'hook/completed',params:{threadId:'thread',run:{source:'sessionFlags',eventName:'userPromptSubmit',status:'completed',entries:[{kind:'warning',text:'ModelRudder synthetic advisory: model unchanged.'}]}}});
});`);
  try {
    const result = await probeAdvisoryNative({ file: process.execPath, args: [file] }, {
      ...process.env, OPENAI_API_KEY: 'synthetic-secret', TYPESAFE_API_KEY: 'synthetic-secret',
    });
    assert.equal(result.inferenceCalls, 0);
    assert.equal(result.nativeTuiCertified, false);
    const evidence = JSON.parse(await readFile(ledger, 'utf8'));
    assert.equal(evidence.calls.filter((m: any) => m.method === 'turn/start').length, 1);
    assert.equal(evidence.calls.find((m: any) => m.method === 'thread/start').params.sandbox, 'read-only');
    await assert.rejects(readFile(join(evidence.home, 'config.toml')), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('native advisory smoke rejects failed version probes without leaking diagnostics', async () => {
  await assert.rejects(probeAdvisoryNative({ file: process.execPath, args: ['-e', "process.stdout.write('secret');process.exit(1)", '--'] }),
    /^Error: Advisory native smoke failed at version/);
});

test('native advisory smoke rejects a backend that exits during initialization and cleans its home', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'advisory-smoke-exit-'));
  const file = join(directory, 'native.mjs');
  const ledger = join(directory, 'home');
  await writeFile(file, `import fs from 'node:fs';
if(process.argv.includes('--version')) { console.log('codex-cli 0.164.0'); process.exit(0); }
fs.writeFileSync(${JSON.stringify(ledger)},process.env.CODEX_HOME);console.error('PRIVATE DIAGNOSTIC');process.exit(1);`);
  try {
    await assert.rejects(probeAdvisoryNative({ file: process.execPath, args: [file] }), /^Error: Advisory native smoke failed at initialize/);
    const home = await readFile(ledger, 'utf8');
    await assert.rejects(readFile(join(home, 'config.toml')), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
