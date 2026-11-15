import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectWorkbook} from './prepare-sync-preview.mjs';
test('preview projects validated changes without mutating the live snapshot',()=>{
 const snapshot={rowsBySystem:{Test:[[],['0,0','Old','1',''],['Quantum','0']]}};
 const started={changes:[{system:'Test',row:1,column:1,previous:'Old',proposed:'New'},{system:'Test',row:1,column:2,previous:'1',proposed:'48'},{system:'Test',row:1,column:3,previous:'',proposed:'Yes'}]};
 const ledger={cells:[{sheet:'Test',rowIndex:1,columnIndex:1,quantity:100}]};
 const projected=projectWorkbook(snapshot,ledger,started);
 assert.deepEqual(projected.rowsBySystem.Test[1],['0,0','New','48','Yes']);
 assert.equal(projected.rowsBySystem.Test[2][1],'100');
 assert.deepEqual(snapshot.rowsBySystem.Test[1],['0,0','Old','1','']);
 assert.equal(snapshot.rowsBySystem.Test[2][1],'0');
 assert.throws(()=>projectWorkbook(snapshot,ledger,{changes:[{...started.changes[0],previous:'Wrong'}]}),/precondition/);
});
