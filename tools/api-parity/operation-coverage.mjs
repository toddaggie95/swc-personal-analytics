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
export function assessCoverage(datasets,{productionOnly=true}={}){
  const results={};
  for(const [name,rows] of Object.entries(datasets)){
    const scoped=productionOnly?rows.filter(s=>/shipyard/i.test(String(s.typeName??''))):rows;
    results[name]={...coverage(scoped),excludedNonShipyards:rows.length-scoped.length};
  }
  const incomplete=Object.values(results).some(x=>x.unknown.productionActions>0||x.unknown.tooledTo>0);
  return {status:incomplete?'blocked_incomplete_operations':'complete',results};
}
export function compareIdleSemantics(webStations,apiStations){
  const web=new Map(),api=new Map();
  for(const row of webStations){const uid=String(row.uid??'');if(!uid||web.has(uid))throw Error('Duplicate/missing web station UID '+uid);web.set(uid,row)}
  for(const row of apiStations){const uid=String(row.uid??'');if(!uid||api.has(uid))throw Error('Duplicate/missing API station UID '+uid);api.set(uid,row)}
  const differences=[];let running=0,blank=0;
  for(const uid of [...new Set([...web.keys(),...api.keys()])].sort()){
    const w=web.get(uid),a=api.get(uid);
    if(!w||!a){differences.push({uid,reason:'missing station in '+(!w?'web':'api')});continue}
    if(!/shipyard/i.test(String(a.typeName??'')))continue;
    const status=String(w.productionStatus??'').trim().toLowerCase();
    const actions=a.operations?.productionActions;
    if(status==='running'){
      running++;
      if(!Array.isArray(actions)||!actions.some(x=>x?.value?.status==='running'))differences.push({uid,reason:'web running without API running action'});
    }else if(status===''){
      blank++;
      if(actions!==null && !(Array.isArray(actions)&&actions.length===0))differences.push({uid,reason:'web blank but API has production actions'});
    }else differences.push({uid,reason:'unrecognized web status '+status});
  }
  return {status:differences.length?'differences':'matched',shipyardsRunning:running,shipyardsWebBlank:blank,differences,
    interpretation:'Matching blank web status and null API actions is observational parity, not proof of idle without an external Started flag.'};
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
