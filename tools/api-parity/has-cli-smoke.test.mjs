import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Exercise the actual CLI entrypoint; function-level ledger tests cannot catch
// argument initialization bugs or absent scoped captures.
test('HAS CLI loads manifest before validating scoped API captures',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'swc-has-cli-'));
 try {
  const web=path.join(root,'web'),api=path.join(root,'api');
  fs.mkdirSync(web);fs.mkdirSync(api);
  for(const faction of ['tff','tjo'])for(const kind of ['stations','materials'])
   fs.writeFileSync(path.join(web,faction+'-'+kind+'.csv'),'uid,system\n');
  const manifest=path.join(root,'manifest.json');
  fs.writeFileSync(manifest,JSON.stringify({destinations:[{id:'test',system:'Uogo`cor'}]}));
  const cli=path.resolve('tools/api-parity/compare-production-has.mjs');
  const result=spawnSync(process.execPath,[cli,'--manifest',manifest,'--web-dir',web,'--api-dir',api,'--system','Uogo`cor','--out',path.join(root,'result.json')],{encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/No tff stations API captures for Uogo`cor/);
  assert.doesNotMatch(result.stderr,/Cannot access 'manifest' before initialization/);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
