import fs from 'node:fs';
import path from 'node:path';

export function coverage(stations) {
  const fields=['productionActions','tooledTo','queueItems'];
  const populated=Object.fromEntries(fields.map(k=>[k,0]));
  for(const s of stations){
    const ops=s.operations||{};
    for(const k of fields)if(ops[k]!==null&&ops[k]!==undefined)populated[k]++;
  }
  return {stations:stations.length,populated,unknown:Object.fromEntries(fields.map(k=>[k,stations.length-populated[k]]))};
}
export function assessCoverage(datasets){
  const results={};
  for(const [name,rows] of Object.entries(datasets))results[name]=coverage(rows);
  const incomplete=Object.values(results).some(x=>x.unknown.productionActions>0||x.unknown.tooledTo>0);
  return {status:incomplete?'blocked_incomplete_operations':'complete',results};
}
if(process.argv[1]&&process.argv[1].endsWith('operation-coverage.mjs')){
  try{
    const dir=process.argv[2];
    if(!dir)throw Error('Usage: node operation-coverage.mjs API_DIRECTORY');
    const datasets={};
    for(const faction of ['tff','tjo']){
      const matches=fs.readdirSync(dir).filter(x=>x.startsWith(faction+'__stations__system-kashyyyk__')&&x.endsWith('.json'));
      if(matches.length!==1)throw Error('Expected one '+faction+' station snapshot');
      const doc=JSON.parse(fs.readFileSync(path.join(dir,matches[0]),'utf8'));
      if(!Array.isArray(doc.stations))throw Error('Missing stations array');
      datasets[faction]=doc.stations;
    }
    const result=assessCoverage(datasets);
    console.log(JSON.stringify(result,null,2));
    if(result.status!=='complete')process.exitCode=2;
  }catch(e){console.error(e.message);process.exitCode=1}
}
