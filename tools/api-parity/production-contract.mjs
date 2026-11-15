const record=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const str=v=>v==null?'':String(v);
export function productionState(detail){
 const actions=record(detail.actions).action??[];
 const queue=record(detail.queueitems).queueitem??[];
 if(!Array.isArray(actions)||!Array.isArray(queue))throw Error('Invalid station operation structure');
 const types=actions.map(a=>record(a.attributes).type);
 const allowed=['EntityProductionAction','CrateProductionAction','RetoolingAction','StationConstructionAction'];
 if(types.some(t=>!allowed.includes(t)))throw Error('Unknown station action');
 const producing=queue.some(q=>q.status==='producing');
 const production=actions.filter(a=>record(a.attributes).type==='EntityProductionAction');
 if(producing&&!production.length)throw Error('Producing queue without entity production action');
 if(producing&&types.includes('RetoolingAction'))throw Error('Retooling conflicts with producing queue');
 const running=production.filter(a=>record(a.value).status==='running');
 if(running.length>1)throw Error('Multiple running production actions');
 if(producing&&!running.length)throw Error('Producing queue without running action');
 if(running.length&&!producing&&!types.includes('RetoolingAction'))throw Error('Running action without producing queue');
 const active=producing&&running.length===1;
 const quantity=active?Number(record(running[0].value).quantity):null;
 const tooling=typeof detail.tooledto==='string'?detail.tooledto:record(detail.tooledto).value;
 if(active&&(!Number.isSafeInteger(quantity)||quantity<=0||typeof tooling!=='string'||!tooling))throw Error('Running production lacks quantity or tooling');
 // User-validated policy: missing actions/queue is idle; tooling is assignment, not activity.
 return {productionStateValidated:true,productionStatus:active?'running':'',productionQuantity:active?String(quantity):'',tooledTo:tooling??'',observedAt:new Date().toISOString()};
}
export function canonicalRow(raw){
 const loc=raw.location??{},coords=raw.coordinates??{},ops=raw.operations;
 const row={uid:raw.uid,name:str(raw.name),type_name:str(raw.typeName),owner_uid:raw.ownerUid};
 for(const k of ['sector','system','planet','city']){row[k]=str(loc[k]?.name);row[k+'_uid']=str(loc[k]?.uid);}
 row.sysX=str(coords.system?.x);row.sysY=str(coords.system?.y);
 row.container_uid=str(loc.container?.uid);
 row.container_type_name=({station:'Stations',facility:'Facilities',ship:'Ships',system:'Systems'})[loc.container?.type]??str(loc.container?.type);
 if(raw.entityType==='materials'||Object.hasOwn(raw,'quantity')){
  if(!Number.isSafeInteger(raw.quantity)||raw.quantity<0)throw Error('Invalid material quantity');
  row.quantity=String(raw.quantity);
 }
 if(raw.entityType==='stations'&&!str(raw.typeName).trim())throw Error('Missing API station type');
 if(ops?.productionStateValidated){
  if(!['','running'].includes(ops.productionStatus))throw Error('Invalid validated production status');
  if(ops.productionStatus==='running'&&(!Number.isSafeInteger(Number(ops.productionQuantity))||Number(ops.productionQuantity)<=0||!str(ops.tooledTo).trim()))throw Error('Invalid validated running quantity/tooling');
  row['tooled-to']=str(ops.tooledTo);row.productionStatus=ops.productionStatus;row.productionQuantity=ops.productionQuantity;
 }else if(ops&&Array.isArray(ops.productionActions)){
  const running=ops.productionActions.filter(a=>record(a.value).status==='running');
  if(running.length>1)throw Error('Multiple running actions');
  row['tooled-to']=str(record(ops.tooledTo).value);row.productionStatus=running.length?'running':'';row.productionQuantity=running.length?str(running[0].value.quantity):'';
 }else{row['tooled-to']='';row.productionStatus=null;row.productionQuantity=null;}
 return row;
}
