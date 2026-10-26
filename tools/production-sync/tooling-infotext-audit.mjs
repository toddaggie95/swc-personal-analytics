import fs from 'node:fs';
import {csv} from './production-sync.mjs';
export function audit(rows){
 const yards=rows.filter(s=>/shipyard/i.test(s.type_name||''));
 const designs=[...new Set(yards.map(s=>(s['tooled-to']||'').trim()).filter(Boolean))];
 const norm=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const notes=[];
 for(const s of yards){const actual=(s['tooled-to']||'').trim(),info=(s.infotext||'').trim();if(!actual||!info)continue;
  const hay=' '+norm(info)+' ';
  const found=designs.filter(d=>norm(d).length>=4&&hay.includes(' '+norm(d)+' '));
  if(found.length&&!found.some(d=>norm(d)===norm(actual)))notes.push({uid:s.uid,owner:s.owner_name,system:s.system,x:s.sysX,y:s.sysY,station:s.name,actualTooling:actual,infotext:info,mentionedDesigns:found,reason:'Infotext mentions another known ship design'});
 }
 return {schemaVersion:1,advisory:true,shipyards:yards.length,knownDesigns:designs.length,warnings:notes.length,notes};
}
function main(){const [tff,tjo,out]=process.argv.slice(2);if(!out)throw Error('Expected two station CSVs and output path');const rows=[...csv(fs.readFileSync(tff,'utf8')),...csv(fs.readFileSync(tjo,'utf8'))];const result=audit(rows);fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({shipyards:result.shipyards,warnings:result.warnings}));}
if(process.argv[1]?.endsWith('tooling-infotext-audit.mjs'))try{main()}catch(e){console.error(e);process.exitCode=1}
