// Read-only orchestration. The caller supplies snapshots of live sheet rows.
// No Google credentials, network calls, or spreadsheet writes are performed here.
import {buildReadinessPools} from './readiness-pools.mjs';
import {shipBillsFromRows} from './ship-bills.mjs';
import {mapProductionOrders} from './readiness-orders.mjs';
import {auditOrderCoverage} from './order-coverage.mjs';
import {liveProductionOrders} from './live-orders.mjs';
import {allocateReadiness} from './production-readiness.mjs';
export function calculateOverviewSnapshot({manifest,stations,materials,auditedOrders,rowsBySystem,shipRows}) {
 const currentOrders=liveProductionOrders({manifest,stations,rowsBySystem});
 const coverage={status:'complete',checkedOrders:currentOrders.length,source:'live_spreadsheet'};
 /* Cached order assignments are intentionally not consulted. */
 const {pools,statistics}=buildReadinessPools(manifest,stations,materials);
 const bills=shipBillsFromRows(shipRows);
 const orders=mapProductionOrders({auditedOrders:currentOrders,manifest,stations,rowsBySystem,shipBills:bills,liveOrders:true});
 const priority=o=>/behemoth|endurance/i.test(o.ship)?0:1;
 const allocation=allocateReadiness({pools,orders,priority});
 const bySystem={};
 for(const o of allocation.orders){
  const totals=bySystem[o.system]??={building:0,unassigned:0,ready_now:0,transfer:0,blocked:0};
  if(!(o.status in totals))throw Error('Unknown readiness status '+o.status);
  totals[o.status]++;
 }
 const counted=Object.values(bySystem).reduce((n,s)=>n+Object.values(s).reduce((a,b)=>a+b,0),0);
 if(counted!==orders.length)throw Error('Order reconciliation failed');
 return {schemaVersion:1,mode:'read_only',statistics:{...statistics,liveOrders:orders.length,orderSource:'live_spreadsheet'},systems:bySystem,orders:allocation.orders,reservations:allocation.reservations};
}
