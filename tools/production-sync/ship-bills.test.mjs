import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMaterialBill,shipBillsFromRows} from './ship-bills.mjs';
test('parses actual Ships tab material format',()=>{
 assert.deepEqual(parseMaterialBill('Quantum: 163; Meleenium: 1,032; Ardanium: 471'),{quantum:163,meleenium:1032,ardanium:471});
});
test('rejects unverified and malformed bills',()=>{
 assert.throws(()=>parseMaterialBill('Quantum: ?'),/Malformed/);
 assert.throws(()=>parseMaterialBill('Quantum: 1; Quantum: 2'),/duplicate/i);
 assert.throws(()=>parseMaterialBill('Imaginary: 5'),/Unknown/);
});
test('rejects duplicate ship definitions',()=>{
 const rows=[['Ship type',...Array(30).fill(''),'Raw materials'],['Test',...Array(30).fill(''),'Quantum: 1'],['Test',...Array(30).fill(''),'Quantum: 2']];
 assert.throws(()=>shipBillsFromRows(rows),/Duplicate/);
});
