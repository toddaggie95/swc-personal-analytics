// Classify significant changes without changing production data.
export function productionNotification(report) {
 if (!report || !Array.isArray(report.changes)) throw Error('Invalid production change report');
 if (report.status !== 'compared') return {notify:false,reason:'baseline'};
 const changes=report.changes;
 if (!changes.length) return {notify:false,reason:'no_changes'};
 const count=(type)=>changes.filter(c=>c.type===type).length;
 const started=changes.filter(c=>c.field==='started'&&c.before===false&&c.after===true).length;
 const stopped=changes.filter(c=>c.field==='started'&&c.before===true&&c.after===false).length;
 const ready=changes.filter(c=>c.field==='readiness'&&['ready_now','transfer'].includes(c.after)&&!['ready_now','transfer'].includes(c.before)).length;
 const parts=[];
 if(started)parts.push(started+' started');
 if(stopped)parts.push(stopped+' stopped');
 if(ready)parts.push(ready+' newly ready');
 const remaining=changes.length-started-stopped-ready;
 if(remaining>0)parts.push(remaining+' other changes');
 return {notify:true,reason:'changes',subject:'SWC production: '+parts.join(', '),count:changes.length,started,stopped,newlyReady:ready};
}
