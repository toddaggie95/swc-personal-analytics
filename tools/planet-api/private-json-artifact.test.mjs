import test from'node:test';import assert from'node:assert/strict';import{generateKeyPairSync}from'node:crypto';import{sealJson,openJson}from'./private-json-artifact.mjs';import{encrypt}from'../api-parity/private-audit-envelope.mjs';
test('compressed private JSON roundtrips and retains support for prior uncompressed evidence',()=>{
 const{publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const value={rows:Array.from({length:50},()=>({name:'repeated private field',zero:0,missing:null}))};
 const sealed=sealJson(value,publicKey);assert.deepEqual(openJson(sealed,privateKey),value);assert.ok(sealed.data.length<JSON.stringify(value).length);
 assert.deepEqual(openJson(encrypt(Buffer.from(JSON.stringify(value)),publicKey),privateKey),value);
 const broken={...sealed,data:'AAAA'+sealed.data.slice(4)};assert.throws(()=>openJson(broken,privateKey));
});
