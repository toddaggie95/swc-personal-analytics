import {record,uid,unwrap,fieldPaths,validatePage} from './capability-pilot.mjs';
export async function checkAccess(request,save){
 const report={schemaVersion:1,mode:'expanded_grant_check',resources:[],observedFrom:new Date().toISOString()};
 const read=async(label,endpoint,query={})=>{
  const r=await request(endpoint,query);const e={label,status:r.status,fields:[]};report.resources.push(e);
  if(r.status!==200)return null;
  const data=unwrap(r.body);e.fields=fieldPaths(data);return data;
 };
 try{
  const me=await read('character','character/');if(!me||!/^1:\d+$/.test(uid(me)))throw Error('identity');
  const matches=(me.factions??[]).filter(f=>f.value==='The Faerytail Family');
  const faction=uid(matches[0]);if(matches.length!==1||!/^20:\d+$/.test(faction))throw Error('faction');
  await read('granted_permissions','character/'+uid(me)+'/permissions');
  const query={start_index:1,item_count:1,'filter_type[0]':'planet','filter_value[0]':'8:999','filter_inclusion[0]':'includes'};
  const control=await read('existing_facility_access','inventory/'+faction+'/facilities/owner',query);
  if(!control)throw Error('existing-access');validatePage(control,'8:999',faction,'4');
  const cities=await read('expanded_city_list','inventory/'+faction+'/cities/owner',query);
  let city;
  if(cities){const p=validatePage(cities,'8:999',faction,'7');city=uid(p.rows[0]);report.cityCount=p.total;}
  await read('expanded_faction_planet_list','inventory/'+faction+'/planets/owner',{start_index:1,item_count:200});
  await read('expanded_personal_administered_planets','inventory/'+uid(me)+'/planets/pilot',{start_index:1,item_count:200});
  if(city){const detail=await read('expanded_city_detail','inventory/cities/'+city);if(detail&&uid(detail)!==city)throw Error('city-identity');}
  report.status='completed';
 }catch{report.status='stopped';throw Error('Expanded grant check stopped.');}
 finally{report.observedTo=new Date().toISOString();await save(report);}
 return report;
}
