#!/usr/bin/env python3
"""Offline regression of recorded station actions against known SWC states."""
import collections,json,pathlib,sys
root=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])
files=list(root.rglob('station-audit-*.json'))
counts=collections.Counter(); changed=[]; unresolved=[]
for file in files:
    doc=json.loads(file.read_text())
    for row in doc['rows']:
        actions=set(row.get('actions') or [])
        queue=set(row.get('queueStatuses') or [])
        before=row.get('classification')
        if actions=={'CrateProductionAction'} and 'producing' in queue:
            after='crate-production'
        elif actions=={'StationConstructionAction'} and not queue:
            after='station-construction'
        else: after=before
        counts[after]+=1
        if after!=before: changed.append({'uid':row['uid'],'faction':row['faction'],'before':before,'after':after})
        elif row.get('anomalies'): unresolved.append({'uid':row['uid'],'anomalies':row['anomalies']})
report={'batchFiles':len(files),'stationCount':sum(counts.values()),'counts':dict(counts),'correctedCount':len(changed),'changes':changed,'unresolved':unresolved}
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(report,indent=2)+'\n')
print('RECLASSIFICATION_SUMMARY',json.dumps({k:v for k,v in report.items() if k!='changes'}))
if len(files)!=48 or report['stationCount']!=2375 or len(changed)!=14 or unresolved:sys.exit(1)
