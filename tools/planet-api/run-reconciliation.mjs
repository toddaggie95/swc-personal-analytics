import{readFileSync,writeFileSync,mkdirSync,existsSync}from'node:fs';import{join}from'node:path';
import{reconcilePlanet,reconciliationReport}from'./reconcile-planet.mjs';
try{
 const[snapshotPath,evidencePath,output]=process.argv.slice(2);if(!output)throw Error('arguments');
 const snapshot=JSON.parse(readFileSync(snapshotPath,'utf8')),evidence=evidencePath==='-'?undefined:JSON.parse(readFileSync(evidencePath,'utf8'));
 const result=reconcilePlanet(snapshot,evidence);mkdirSync(output,{recursive:true,mode:0o700});
 const path=join(output,'reconciliation-'+result.contentSha256+'.json');
 const once=(path,text)=>{if(existsSync(path)){if(readFileSync(path,'utf8')!==text)throw Error('immutable-output-conflict');}else writeFileSync(path,text,{mode:0o600,flag:'wx'});};
 once(path,JSON.stringify(result,null,2)+'\n');
 once(join(output,'report-'+result.contentSha256+'.md'),reconciliationReport(result));
 console.log('Offline reconciliation sealed with parent and evidence hashes. Private details are in the output files.');
}catch{console.error('Offline reconciliation stopped; source files remain unchanged.');process.exitCode=1;}
