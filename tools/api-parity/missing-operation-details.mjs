// Generate a deterministic, read-only station-detail retry manifest.
import fs from 'node:fs';
import path from 'node:path';
import {assessCoverage} from './operation-coverage.mjs';
export function missingShipyardDetails(datasets) {
 const rows=[];
 for(const [faction,stations] of Object.entries(datasets)){
  const seen=new Set();
  for(const s of stations){
   if(!/shipyard/i.test(String(s.typeName??'')))continue;
   if(!s.uid||seen.has(s.uid))throw Error('Missing/duplicate shipyard UID in '+faction);
   seen.add(s.uid);
   const ops=s.operations||{};
   const missing=['productionActions','tooledTo'].filter(k=>ops[k]===null||ops[k]===undefined);
   if(missing.length)rows.push({faction,uid:s.uid,missing});
  }
 }
 return rows.sort((a,b)=>a.faction.localeCompare(b.faction)||a.uid.localeCompare(b.uid));
}
export function buildRetryManifest(datasets){
 const coverage=assessCoverage(datasets);
 return {schemaVersion:1,mode:'read_only',scope:'shipyard-operation-details',coverage,requests:missingShipyardDetails(datasets)};
}
if(process.argv[1]&&process.argv[1].endsWith('missing-operation-details.mjs')){
 try{
  const [dir,out]=process.argv.slice(2);
  if(!dir||!out)throw Error('Usage: node missing-operation-details.mjs API_DIRECTORY OUTPUT_JSON');
  const datasets={};
  for(const faction of ['tff','tjo']){
   const files=fs.readdirSync(dir).filter(n=>n.startsWith(faction+'__stations__system-kashyyyk__')&&n.endsWith('.json'));
   if(files.length!==1)throw Error('Expected one '+faction+' station snapshot');
   const data=JSON.parse(fs.readFileSync(path.join(dir,files[0]),'utf8'));
   if(!Array.isArray(data.stations))throw Error('Missing stations array');
   datasets[faction]=data.stations;
  }
  const report=buildRetryManifest(datasets);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({requests:report.requests.length,coverage:report.coverage.status}));
 }catch(e){console.error(e.stack);process.exitCode=1}
}
