import fs from 'node:fs';
import {productionNotification} from './production-change-notification.mjs';
const report=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const result=productionNotification(report);
if (!result.notify) {
 console.log('No notification: '+result.reason);
 process.exit(0);
}
console.log(result.subject);
console.log('Changed fields: '+result.count);
