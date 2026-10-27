// Pure, fail-closed parser for Ships tab material specifications.
// Rows use the existing Ships master columns: A ship name, AF raw materials.
import {MATERIALS} from './production-sync.mjs';
export function parseMaterialBill(text) {
 if(typeof text!=='string'||!text.trim())throw Error('Missing raw materials');
 const bill={};
 for(const part of text.split(';')){
  const match=part.trim().match(/^([^:]+):\s*([\d,]+)$/);
  if(!match)throw Error('Malformed raw material '+part);
  const material=match[1].trim().toLowerCase(),q=Number(match[2].replaceAll(',',''));
  if(!MATERIALS.includes(material)||!Number.isSafeInteger(q)||q<0||material in bill)throw Error('Unknown, duplicate or invalid raw material '+part);
  bill[material]=q;
 }
 return bill;
}
export function shipBillsFromRows(rows,{nameIndex=0,materialsIndex=31}={}) {
 const result=new Map();
 for(const row of rows){
  const name=String(row[nameIndex]??'').trim(),raw=String(row[materialsIndex]??'').trim();
  // The workbook contains a separate Ship type header row, and raw material cells
  // are in column AF (index 31); index 30 is the manufacturing affiliation.
  if(!name || name==='Ship type' || !raw)continue;
  if(result.has(name))throw Error('Duplicate ship design '+name);
  result.set(name,parseMaterialBill(raw));
 }
 return result;
}
