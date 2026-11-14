import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const directory=process.argv[2];fs.mkdirSync(directory,{recursive:true});
const files=[];
for(const owner of ['tff','tjo'])for(const kind of ['stations','materials']){
 const canonicalName=owner+'-'+kind+'.csv',bytes=Buffer.from('uid,name\nfixture,Example\n');
 fs.writeFileSync(path.join(directory,canonicalName),bytes);
 const sha256=createHash('sha256').update(bytes).digest('hex');
 files.push({owner:owner.toUpperCase(),kind:kind==='stations'?'Stations':'Materials',canonicalName,sha256,id:'api:'+canonicalName.replace('.csv','')+':'+sha256,rowCount:1});
}
fs.writeFileSync(path.join(directory,'export-manifest.json'),JSON.stringify({schemaVersion:1,source:'api',files}));
