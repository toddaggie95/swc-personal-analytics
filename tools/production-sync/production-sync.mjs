import fs from 'node:fs';
export const MATERIALS='quantum meleenium ardanium rudic ryll duracrete alazhi laboi adegan rockivory tibannagas nova varium varmigio lommite hibridium durelium lowickan vertex berubian bacta'.split(' ');
export function csv(text) {
 const records=[];let row=[],field='',quote=false;text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];
  if(quote){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quote=false;else field+=c;}
  else if(c==='"')quote=true;else if(c===','){row.push(field);field='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(Boolean))records.push(row);row=[];}
  else field+=c;
 }
 if(quote)throw Error('Unclosed CSV quote');
 if(row.length||field){row.push(field);records.push(row)}
 const header=records.shift();if(!header)throw Error('Empty CSV');
 return records.map((r,i)=>{if(r.length!==header.length)throw Error('Bad CSV row '+(i+2));return Object.fromEntries(header.map((h,j)=>[h.trim(),r[j]]))});
}
export function calculate(materials,stations,hubs){
 const unique=new Map(),uniqueStations=new Map(),systemTotals={},unassigned=[],overlaps=[],unknown=[];
 for(const s of stations){const id=s.uid||s.entityType+':'+s.ID;if(uniqueStations.has(id)&&JSON.stringify(uniqueStations.get(id))!==JSON.stringify(s))throw Error('Conflicting station '+id);uniqueStations.set(id,s)}
 const sig=r=>[r.type_name,r.quantity,r.sector,r.system,r.sysX,r.sysY,r.container_type_name,r.container_uid].join('|');
 for(const r of materials){const id=r.uid||r.entityType+':'+r.ID;if(!id||id===':')throw Error('Missing material ID');if(unique.has(id)){if(sig(unique.get(id))!==sig(r))throw Error('Conflicting material '+id);continue}unique.set(id,r)}
 const output=hubs.map(h=>{if(!h.id||!h.system||!h.sector||!Number.isInteger(h.x)||!Number.isInteger(h.y))throw Error('Invalid hub');return {...h,totals:Object.fromEntries(MATERIALS.map(m=>[m,0])),pileIds:[]}});
 for(const [id,r] of unique){const q=Number(r.quantity),m=r.type_name?.toLowerCase();if(!Number.isSafeInteger(q)||q<0)throw Error('Invalid quantity '+id);
  (systemTotals[r.system]??={})[m]=((systemTotals[r.system]||{})[m]||0)+q;
  if(r.container_type_name!=='Stations')continue;
  if(!MATERIALS.includes(m)){unknown.push({id,material:m});continue}
  const x=Number(r.sysX),y=Number(r.sysY);if(!Number.isInteger(x)||!Number.isInteger(y))throw Error('Bad coordinates '+id);
  const hits=output.filter(h=>h.sector===r.sector&&h.system===r.system&&Math.abs(h.x-x)<=1&&Math.abs(h.y-y)<=1);
  if(hits.length>1)overlaps.push({id,hubs:hits.map(h=>h.id)});
  if(!hits.length)unassigned.push({id,system:r.system,sector:r.sector,x,y,material:m,quantity:q,container_uid:r.container_uid,container_name:r.container_name});
  for(const h of hits){h.totals[m]+=q;h.pileIds.push(id)}
 }
 return {schemaVersion:1,materials:MATERIALS,hubs:output,systemTotals,unassigned,overlaps,unknown,statistics:{uniquePiles:unique.size,uniqueStations:uniqueStations.size,hubs:output.length,unassigned:unassigned.length,overlaps:overlaps.length}};
}
export function run(args){
 const opt={};for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--'))throw Error('Expected --flag');opt[args[i].slice(2)]=args[i+1]}
 for(const k of ['tff-materials','tjo-materials','tff-stations','tjo-stations','hubs','out'])if(!opt[k])throw Error('Missing --'+k);
 const load=k=>csv(fs.readFileSync(opt[k],'utf8'));
 const result=calculate([...load('tff-materials'),...load('tjo-materials')],[...load('tff-stations'),...load('tjo-stations')],JSON.parse(fs.readFileSync(opt.hubs,'utf8')));
 fs.writeFileSync(opt.out,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result.statistics));if(result.overlaps.length||result.unknown.length)process.exitCode=2;
}
if(process.argv[1]?.endsWith('production-sync.mjs'))try{run(process.argv.slice(2))}catch(e){console.error(e.message);process.exitCode=1}
