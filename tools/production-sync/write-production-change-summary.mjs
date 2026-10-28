import fs from 'node:fs';
import {formatProductionChanges} from './production-change-format.mjs';
if(process.argv.length!==4)throw Error('Usage: node write-production-change-summary.mjs report.json output.txt');
const report=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
fs.writeFileSync(process.argv[3],formatProductionChanges(report)+'\n');
console.log('Formatted production changes:',report.changes.length);
