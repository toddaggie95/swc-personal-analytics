/** Serial, shared-budget pacing. No independent budget per endpoint or worker. */
export interface RateWindow {limit:number|null;remaining:number|null;resetAtMs:number|null}
const integer=(v:string|null):number|null=>v!==null&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))?Number(v):null;
export function parseRateWindow(headers:Headers,now:number):RateWindow {
 const limit=integer(headers.get('x-ratelimit-limit')),remaining=integer(headers.get('x-ratelimit-remaining'));
 const epoch=integer(headers.get('x-ratelimit-reset'));
 const date=Date.parse(headers.get('x-ratelimit-resettime')??'');
 const reset=epoch!==null?epoch*1000:Number.isFinite(date)?date:null;
 return {limit,remaining:remaining!==null&&(limit===null||remaining<=limit)?remaining:null,resetAtMs:reset!==null&&reset>=now?reset:null};
}
export class ReadPacer {
 private next=0;
 private window:RateWindow={limit:null,remaining:null,resetAtMs:null};
 private waits=0;
 constructor(private sleep:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms)),private now:()=>number=Date.now,
  private fallbackDelayMs=6500,private maxWaitMs=3_660_000,private minGapMs=1000){}
 async beforeRequest(_resource:string):Promise<void>{
  const now=this.now(),w=this.window;
  let next=this.next;
  if(w.remaining!==null&&w.remaining<=5){
   if(w.resetAtMs===null)throw Error('Quota reserve reached without reset');
   next=Math.max(next,w.resetAtMs+1000);
  }
  const delay=Math.max(0,next-now);
  if(delay>this.maxWaitMs)throw Error('Quota wait exceeds collection bound');
  if(delay){this.waits+=delay;if(delay>60_000)console.log('PRODUCTION_API_QUOTA_WAIT '+JSON.stringify({waitSeconds:Math.ceil(delay/1000)}));await this.sleep(delay);}
  if(w.resetAtMs!==null&&this.now()>w.resetAtMs)this.window={limit:null,remaining:null,resetAtMs:null};
  this.next=this.now()+this.fallbackDelayMs;
 }
 afterResponse(_resource:string,headers:Headers):RateWindow{
  const now=this.now(),observed=parseRateWindow(headers,now);
  const reliable=observed.limit!==null&&observed.remaining!==null&&observed.resetAtMs!==null;
  if(reliable){
   // Different endpoint headers cannot replenish an already observed shared window.
   if(this.window.resetAtMs!==null&&now<=this.window.resetAtMs&&this.window.remaining!==null){
    this.window={limit:Math.min(this.window.limit??observed.limit!,observed.limit!),remaining:Math.max(0,Math.min(this.window.remaining-1,observed.remaining!)),resetAtMs:Math.max(this.window.resetAtMs,observed.resetAtMs!)};
   }else this.window=observed;
   this.next=now+this.minGapMs;
  }else{
   // Missing headers do not restore consumed quota or erase a known reserve.
   if(this.window.remaining!==null)this.window.remaining=Math.max(0,this.window.remaining-1);
   if(observed.remaining!==null&&(this.window.remaining===null||observed.remaining<this.window.remaining))this.window={...observed};
   this.next=now+this.fallbackDelayMs;
  }
  return observed;
 }
 summary(){return {pacingWaitMs:this.waits,quota:this.window};}
}
