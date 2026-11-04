// Read-only full-registry operation coverage, summarized without private station IDs.
import fs from 'node:fs';
import path from 'node:path';
import {assessCoverage,compareIdleSemantics} from './operation-coverage.mjs';
import {csv} from '../production-sync/production-sync.mjs';
import {normalizeStation} from './compare-production-has.mjs';
const [dir,webDir]=process.argv.slice(2);
if(!dir||!webDir)throw Error('Usage: node audit-all-operation-coverage.mjs API_DIR WEB_DIR');
const byFaction={tff:[],tjo:[]};
for(const name of fs.readdirSync(dir)){
  const match=/^(tff|tjo)__stations__system-.*\.json$/.exec(name);
  if(!match)continue;
  const doc=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
  if(!Array.isArray(doc.stations))throw Error('Invalid station capture '+name);
  byFaction[match[1]].push(...doc.stations.map(normalizeStation));
}
const coverage=assessCoverage(byFaction);
const semantic={};
for(const faction of ['tff','tjo']){
  const web=csv(fs.readFileSync(path.join(webDir,faction+'-stations.csv'),'utf8'));
  const normalized=byFaction[faction];
  // Scope the CSV to API-covered station IDs; reject missing identities separately.
  const apiIds=new Set(normalized.map(s=>s.uid));
  const scopedWeb=web.filter(s=>apiIds.has(s.uid));
  const result=compareIdleSemantics(scopedWeb,normalized);
  semantic[faction]={status:result.status,shipyardsRunning:result.shipyardsRunning,
    shipyardsWebBlank:result.shipyardsWebBlank,differences:result.differences.length};
}
const report={mode:'read_only',status:coverage.status,results:coverage.results,semantics:semantic};
console.log(JSON.stringify(report,null,2));
fs.writeFileSync('/tmp/swc-private/operation-coverage.json',JSON.stringify(report,null,2)+'\n');
