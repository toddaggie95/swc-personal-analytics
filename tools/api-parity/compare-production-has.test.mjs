import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMaterial,normalizeStation,compareLedgers} from './compare-production-has.mjs';

const location={sector:{uid:'25:267',name:'Mytaranor'},system:{uid:'9:104',name:'Kashyyyk'},container:{uid:'5:100',type:'station'}};
const coordinates={system:{x:8,y:5}};
test('API material adapter retains UID, quantity, ownership and station container',()=>{
  const m=normalizeMaterial({uid:'16:1',name:'pile',typeName:'meleenium',quantity:100,ownerUid:'20:1838',location,coordinates});
  assert.equal(m.container_type_name,'Stations');
  assert.equal(m.quantity,'100');
  assert.equal(m.owner_uid,'20:1838');
});
test('unknown API station production is not interpreted as stopped',()=>{
  const s=normalizeStation({uid:'5:100',name:'station',typeName:'Shipyard',ownerUid:'20:1838',location,coordinates,operations:{productionActions:null,tooledTo:null}});
  assert.equal(s.productionStatus,null);
  assert.equal(s['tooled-to'],null);
});
test('missing material location fails closed',()=>{
  assert.throws(()=>normalizeMaterial({uid:'16:2',typeName:'quantum',quantity:1,location:{}}),/Missing API material/);
});
test('existing ledger computes identical cells for normalized inputs',()=>{
  const manifest={destinations:[{id:'k',system:'Kashyyyk',target:{sheet:'Kashyyyk',hasColumn:2,materialStartRow:10},memberStationUids:['5:100']}]};
  const station={uid:'5:100',system:'Kashyyyk',sysX:'8',sysY:'5'};
  const pile={uid:'16:1',type_name:'meleenium',quantity:'100',container_uid:'5:100',container_type_name:'Stations',system:'Kashyyyk'};
  const result=compareLedgers(manifest,[station],[pile],[station],[pile]);
  assert.equal(result.status,'matched');
  assert.equal(result.statistics.webCells,result.statistics.apiCells);
});
