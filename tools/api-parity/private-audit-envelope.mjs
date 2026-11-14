import {randomBytes,publicEncrypt,privateDecrypt,createCipheriv,createDecipheriv,constants} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export function encrypt(bytes,publicKey){
 const key=randomBytes(32),iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 const data=Buffer.concat([cipher.update(bytes),cipher.final()]);
 return {version:1,algorithm:'RSA-OAEP-SHA256+AES-256-GCM',
  sealedKey:publicEncrypt({key:publicKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},key).toString('base64'),
  iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
export function decrypt(envelope,privateKey){
 if(envelope.version!==1||envelope.algorithm!=='RSA-OAEP-SHA256+AES-256-GCM')throw Error('Unsupported audit envelope');
 const key=privateDecrypt({key:privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(envelope.sealedKey,'base64'));
 const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
 cipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
 return Buffer.concat([cipher.update(Buffer.from(envelope.data,'base64')),cipher.final()]);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,input,keyFile,output]=process.argv.slice(2);
 if(!output||!['encrypt','decrypt'].includes(mode))throw Error('Expected encrypt|decrypt INPUT KEY OUTPUT');
 const result=mode==='encrypt'?JSON.stringify(encrypt(readFileSync(input),readFileSync(keyFile))):decrypt(JSON.parse(readFileSync(input,'utf8')),readFileSync(keyFile));
 writeFileSync(output,result,{mode:0o600});
}
