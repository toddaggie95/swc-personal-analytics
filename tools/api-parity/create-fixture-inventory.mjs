import fs from 'node:fs';
const output=process.argv[2]||'/tmp/station-inventory.json';
const factions={tff:Array.from({length:1346},(_,i)=>String(100000+i)),tjo:Array.from({length:1029},(_,i)=>String(200000+i))};
fs.writeFileSync(output,JSON.stringify({factions}));
console.log('Fixture inventory: 2375 synthetic station IDs');
