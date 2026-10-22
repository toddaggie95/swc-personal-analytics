import fs from 'node:fs';
import {csv} from './production-sync.mjs';
import {reconcileDestinations,planHasChanges} from './audited-destinations.mjs';

function optionsFrom(argv) {
 const options={};
 for(let i=0;i<argv.length;i+=2){
  if(!argv[i]?.startsWith('--')||!argv[i+1])throw Error('Expected --flag value pairs');
  options[argv[i].slice(2)]=argv[i+1];
 }
 return options;
}
export function run(argv) {
 const o=optionsFrom(argv);
 for(const k of ['config','tff-materials','tjo-materials','tff-stations','tjo-stations','baseline','out'])
  if(!o[k])throw Error('Missing --'+k);
 const load=k=>csv(fs.readFileSync(o[k],'utf8'));
 const config=JSON.parse(fs.readFileSync(o.config,'utf8'));
 const destinations=Array.isArray(config)?config:config.destinations;
 if(!Array.isArray(destinations))throw Error('Configuration must contain destinations array');
 const report=reconcileDestinations([...load('tff-materials'),...load('tjo-materials')],
  [...load('tff-stations'),...load('tjo-stations')],destinations);
 let changes=[];
 if(report.errors.length===0){
  try {changes=planHasChanges(report,JSON.parse(fs.readFileSync(o.baseline,'utf8')))}
  catch(e){report.errors.push({code:'baseline-validation',message:e.message})}
 }
 const output={...report,changes,writeEnabled:false,source:'audited dry run'};
 fs.writeFileSync(o.out,JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({...report.statistics,proposedHasChanges:changes.length}));
 if(report.errors.length)process.exitCode=2;
}
if(process.argv[1]?.endsWith('audited-run.mjs'))try{run(process.argv.slice(2))}catch(e){console.error(e.message);process.exitCode=1}
