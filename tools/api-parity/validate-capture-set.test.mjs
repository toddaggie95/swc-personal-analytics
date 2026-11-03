import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateCaptureSet} from './validate-capture-set.mjs';
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swc-api-beta-'));
 for(const faction of ['tff','tjo'])for(const kind of ['stations','materials']){
  const uid=(kind==='stations'?'3:':'4:')+(faction==='tff'?'1':'2');
  const row={uid,location:{system:{uid:'9:104'}},...(kind==='materials'?{quantity:10}:{})};
  fs.writeFileSync(path.join(dir,faction+'__'+kind+'__system-kashyyyk__fixture.json'),JSON.stringify({summary:{locationFilter:{uid:'9:104'}},[kind]:[row]}));
 }
 return dir;
}
test('validates complete four-capture fixture',t=>{const d=fixture();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));assert.equal(validateCaptureSet(d).entities,4)});
test('rejects missing faction capture',t=>{const d=fixture();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));fs.unlinkSync(path.join(d,'tjo__materials__system-kashyyyk__fixture.json'));assert.throws(()=>validateCaptureSet(d),/exactly one tjo materials/)});
test('rejects duplicate snapshot for same faction',t=>{const d=fixture();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));fs.copyFileSync(path.join(d,'tff__stations__system-kashyyyk__fixture.json'),path.join(d,'tff__stations__system-kashyyyk__second.json'));assert.throws(()=>validateCaptureSet(d),/exactly one tff stations/)});
test('rejects out-of-system entity',t=>{const d=fixture();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));const p=path.join(d,'tff__stations__system-kashyyyk__fixture.json');const v=JSON.parse(fs.readFileSync(p));v.stations[0].location.system.uid='9:999';fs.writeFileSync(p,JSON.stringify(v));assert.throws(()=>validateCaptureSet(d),/outside Kashyyyk/)});
test('rejects invalid material quantities',t=>{const d=fixture();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));const p=path.join(d,'tjo__materials__system-kashyyyk__fixture.json');const v=JSON.parse(fs.readFileSync(p));v.materials[0].quantity=-2;fs.writeFileSync(p,JSON.stringify(v));assert.throws(()=>validateCaptureSet(d),/Invalid material quantity/)});
