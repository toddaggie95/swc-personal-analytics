// Human-readable summary for an accepted production comparison.
export function formatProductionChanges(report) {
 if (!report || !Array.isArray(report.changes)) throw Error('Invalid change report');
 const lines = ['SWC Production Changes', '', 'Previous: '+(report.previousBatch??'none'), 'Current: '+(report.currentBatch??'unknown'), ''];
 if (report.status==='baseline_created') return [...lines,'Initial station baseline recorded. No change notification needed.',''].join('\n');
 lines.push('Stations: '+report.previousCount+' -> '+report.currentCount);
 if (!report.changes.length) return [...lines,'No changes detected.',''].join('\n');
 const groups = new Map();
 for (const change of report.changes) {
  const key = change.system ?? change.after?.system ?? change.before?.system ?? 'Unknown system';
  if (!groups.has(key)) groups.set(key,[]);
  groups.get(key).push(change);
 }
 lines.push('Changes: '+report.changes.length,'');
 for (const system of [...groups.keys()].sort()) {
  lines.push('['+system+']');
  for (const change of groups.get(system)) {
   const from = typeof change.before==='object' ? JSON.stringify(change.before) : String(change.before);
   const to = typeof change.after==='object' ? JSON.stringify(change.after) : String(change.after);
   lines.push('  '+change.uid+' | '+change.type+' | '+from+' -> '+to);
  }
  lines.push('');
 }
 return lines.join('\n');
}
