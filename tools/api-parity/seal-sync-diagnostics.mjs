import fs from 'node:fs';
import path from 'node:path';
import {encrypt} from './private-audit-envelope.mjs';
const [root,keyFile,out]=process.argv.slice(2);
if(!out)throw Error('Expected ROOT PUBLIC_KEY OUTPUT');
const files=[];
function add(relative){
 const full=path.join(root,relative);
 if(!fs.existsSync(full))return;
 if(fs.statSync(full).isDirectory()){for(const entry of fs.readdirSync(full))add(path.join(relative,entry));}
 else files.push({path:relative.replaceAll('\\','/'),data:fs.readFileSync(full).toString('base64')});
}
// Explicit allowlist: never include auth credential files or the private collector directory.
for(const name of ['collector-progress','swc-exports','production-preview','audited-ledger.json','spreadsheet-comparison.json','system-has-audit.json','system-has-comparison.json','production-started-preflight.json','station-registry-audit.json','pile-trace.json'])add(name);
fs.writeFileSync(out,JSON.stringify(encrypt(Buffer.from(JSON.stringify({version:1,files})),fs.readFileSync(keyFile))),{mode:0o600});
console.log('Encrypted diagnostic files: '+files.length);
