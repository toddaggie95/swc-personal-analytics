import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const {ReadPacer}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(readFileSync(new URL('./production-read-pacer.ts',import.meta.url),'utf8'),{mode:'transform'})).toString('base64'));
const headers=(remaining,reset=3600)=>new Headers({'x-ratelimit-limit':'600','x-ratelimit-remaining':String(remaining),'x-ratelimit-reset':String(reset)});
function fixture(){let now=0;const waits=[];return {waits,pacer:new ReadPacer(async ms=>{waits.push(ms);now+=ms;},()=>now),now:()=>now};}
test('available quota uses minimum serial gap without whole-window smoothing',async()=>{
 const {pacer,waits}=fixture();pacer.afterResponse('details',headers(599));await pacer.beforeRequest('details');assert.deepEqual(waits,[1000]);
});
test('endpoint changes and absent headers cannot replenish shared quota',async()=>{
 const {pacer,waits}=fixture();pacer.afterResponse('details',headers(6));pacer.afterResponse('materials',headers(599));
 pacer.afterResponse('materials',new Headers());await pacer.beforeRequest('details');assert.deepEqual(waits,[3601000]);
});
test('reserve waits for reset; new window can replenish after reset',async()=>{
 const {pacer,waits}=fixture();pacer.afterResponse('details',headers(5));await pacer.beforeRequest('details');
 pacer.afterResponse('details',headers(599,7200));await pacer.beforeRequest('details');assert.deepEqual(waits,[3601000,1000]);
});
test('missing headers keep conservative fallback and untrustworthy reset fails closed',async()=>{
 const {pacer,waits}=fixture();pacer.afterResponse('details',new Headers());await pacer.beforeRequest('details');assert.deepEqual(waits,[6500]);
 pacer.afterResponse('details',new Headers({'x-ratelimit-remaining':'0'}));await assert.rejects(pacer.beforeRequest('details'),/without reset/);
});
test('partial headers preserve a previously observed reliable reset',async()=>{
 const {pacer,waits}=fixture();pacer.afterResponse('details',headers(20));
 pacer.afterResponse('materials',new Headers({'x-ratelimit-remaining':'5'}));
 await pacer.beforeRequest('details');assert.deepEqual(waits,[3601000]);
});
test('collector deadline stops before a long quota wait, leaving time for upload',async()=>{
 const waits=[];const pacer=new ReadPacer(async ms=>waits.push(ms),()=>0,6500,3660000,1000,300000);
 pacer.afterResponse('details',headers(5));await assert.rejects(pacer.beforeRequest('details'),/deadline/);assert.deepEqual(waits,[]);
});
test('response latency fits inside the minimum start-to-start gap',async()=>{
 let now=0;const waits=[],starts=[];
 const pacer=new ReadPacer(async ms=>{waits.push(ms);now+=ms;},()=>now);
 await pacer.beforeRequest('stations');starts.push(now);now+=200;pacer.afterResponse('stations',headers(599));
 await pacer.beforeRequest('materials');starts.push(now);now+=300;pacer.afterResponse('materials',headers(598));
 await pacer.beforeRequest('details');starts.push(now);
 assert.deepEqual(starts,[0,1000,2000]);assert.deepEqual(waits,[800,700]);
});
test('slow responses never add an unnecessary reliable-budget gap',async()=>{
 let now=0;const waits=[];const pacer=new ReadPacer(async ms=>{waits.push(ms);now+=ms;},()=>now);
 await pacer.beforeRequest('details');now=1700;pacer.afterResponse('details',headers(599));
 await pacer.beforeRequest('details');assert.equal(now,1700);assert.deepEqual(waits,[]);
});
test('unknown quotas retain the full conservative fallback after the response',async()=>{
 let now=0;const waits=[];const pacer=new ReadPacer(async ms=>{waits.push(ms);now+=ms;},()=>now);
 await pacer.beforeRequest('details');now=200;pacer.afterResponse('details',new Headers());
 await pacer.beforeRequest('details');assert.equal(now,6700);assert.deepEqual(waits,[6500]);
});
