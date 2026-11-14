import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {encrypt,decrypt} from './private-audit-envelope.mjs';
test('private audit capture authenticates ciphertext and rejects wrong keys',()=>{
 const pair=()=>generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 const a=pair(),b=pair(),bytes=Buffer.from('private material fixture');
 const envelope=encrypt(bytes,a.publicKey);
 assert.deepEqual(decrypt(envelope,a.privateKey),bytes);
 assert.ok(!JSON.stringify(envelope).includes('private material fixture'));
 assert.throws(()=>decrypt(envelope,b.privateKey));
 const corrupt={...envelope,data:Buffer.from('changed').toString('base64')};
 assert.throws(()=>decrypt(corrupt,a.privateKey));
});
