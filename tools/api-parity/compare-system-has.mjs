// Read-only System HAS parity: includes station and facility material, not ship cargo.
import fs from 'node:fs';
import path from 'node:path';
import {csv} from '../production-sync/production-sync.mjs';
import {systemInventory} from '../production-sync/system-has-audit.mjs';
import {loadApi,normalizeMaterial,normalizeStation} from './compare-production-has.mjs';
const [webDir,apiDir,manifestPath,out]=process.argv.slice(2);
if(!out)throw Error('Usage: node compare-system-has.mjs WEB_DIR API_DIR MANIFEST OUT');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const systems=[...new Set(manifest.destinations.map(d=>d.system))];
const webS=[],webM=[],apiS=[],apiM=[];
for(const f of ['tff','tjo']){
  webS.push(...csv(fs.readFileSync(path.join(webDir,f+'-stations.csv'),'utf8')));
  webM.push(...csv(fs.readFileSync(path.join(webDir,f+'-materials.csv'),'utf8')));
  apiS.push(...loadApi(apiDir,f,'stations','all',systems).map(normalizeStation));
  apiM.push(...loadApi(apiDir,f,'materials','all',systems).map(normalizeMaterial));
}
const web=systemInventory(webS,webM,manifest),api=systemInventory(apiS,apiM,manifest);
const differences=[];
for(const sys of web.systems)for(const mat of web.materials){
  const w=web.systemTotals[sys][mat],a=api.systemTotals[sys]?.[mat];
  if(w!==a)differences.push({system:sys,material:mat,web:w,api:a,delta:a-w});
}
const report={mode:'read_only',status:differences.length?'differences':'matched',
  statistics:{systems:web.systems.length,cells:web.systems.length*web.materials.length,
    differences:differences.length,webPiles:web.statistics.uniquePiles,apiPiles:api.statistics.uniquePiles,
    webErrors:web.errors.length,apiErrors:api.errors.length,
    webInvariants:web.discrepancies.length,apiInvariants:api.discrepancies.length,
    webExcluded:web.excluded,apiExcluded:api.excluded},
  differences};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(web.errors.length||api.errors.length||web.discrepancies.length||api.discrepancies.length)process.exitCode=1;
