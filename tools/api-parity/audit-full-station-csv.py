#!/usr/bin/env python3
"""Read-only UID-level comparison of complete API station audit vs current web CSV exports."""
import csv, json, pathlib, collections, sys
csvroot, apiroot, output = map(pathlib.Path, sys.argv[1:4])
rows = {}
issues = []
api_anomalies = []
counts = {}
for faction in ('tff','tjo'):
    with (csvroot / f'{faction}-stations.csv').open(encoding='utf-8-sig',newline='') as f:
        data=list(csv.DictReader(f))
    ids=[str(r['uid']).strip() for r in data]
    if len(ids)!=len(set(ids)) or not all(ids): raise ValueError(f'{faction} CSV duplicate/blank UID')
    rows[faction]={uid:r for uid,r in zip(ids,data)}
    counts[faction]={'csv':len(data),'api':0,'matched':0,'csvOnly':0,'apiOnly':0,'fieldDiscrepancies':0}
files=list(apiroot.rglob('station-audit-*.json'))
api={f:{} for f in rows}
for path in files:
    doc=json.loads(path.read_text())
    faction=doc['faction']
    if faction not in api: raise ValueError('Unknown API faction')
    if doc.get('errors'): raise ValueError('API collection read errors')
    for row in doc['rows']:
        uid=str(row['uid']).strip()
        if uid in api[faction]: raise ValueError('Duplicate API UID '+faction+'/'+uid)
        if row.get('detailRead')!='ok': raise ValueError('Failed API read '+faction+'/'+uid)
        api[faction][uid]=row
        if row.get('anomalies'):
            api_anomalies.append({'faction':faction,'uid':uid,'anomalies':row['anomalies'],'classification':row.get('classification')})
for faction in rows:
    web,actual=rows[faction],api[faction]
    counts[faction]['api']=len(actual)
    counts[faction]['matched']=len(web.keys() & actual.keys())
    for uid in sorted(web.keys()-actual.keys()):
        counts[faction]['csvOnly']+=1
        issues.append({'faction':faction,'uid':uid,'field':'csvOnly','csv':web[uid].get('name',''),'api':''})
    for uid in sorted(actual.keys()-web.keys()):
        counts[faction]['apiOnly']+=1
        issues.append({'faction':faction,'uid':uid,'field':'apiOnly','csv':'','api':actual[uid].get('classification','')})
    for uid in sorted(web.keys() & actual.keys()):
        w,a=web[uid],actual[uid]
        # Only compare information the current API audit actually recorded.
        # CSV fields must not be guessed; blank and unrecognized values remain unclassified.
        tooled=str(w.get('tooled-to','')).strip()
        csv_tooled=bool(tooled and tooled.lower() not in ('none','no','not tooled','n/a','0'))
        if csv_tooled!=bool(a.get('toolingPresent')):
            issues.append({'faction':faction,'uid':uid,'field':'toolingPresence','csv':tooled,'api':a.get('toolingPresent')})
            counts[faction]['fieldDiscrepancies']+=1
        # Classification is retained as an API-only snapshot; web CSV does not expose equivalent action/queue evidence.
report={'apiRunId':42162627899,'source':'current Drive station CSVs','apiBatchFiles':len(files),'factions':counts,'totalApi':sum(x['api'] for x in counts.values()),'totalCsv':sum(x['csv'] for x in counts.values()),'issues':issues,'apiAnomalies':api_anomalies,'apiAnomalyCount':len(api_anomalies),'issueCounts':dict(collections.Counter(x['field'] for x in issues)),'limitations':['Current API detail artifact omits name, location, station type and exact tooled-to ship; these cannot be field-compared without enriched API capture','Production classification derived from actions/queue is not directly equivalent to CSV production fields','Snapshot times differ; field differences are not automatically defects']}
if report['totalApi']!=2375 or len(files)!=48: raise ValueError('Incomplete API batch artifact set')
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(report,indent=2)+'\n')
print('FULL_CSV_PARITY '+json.dumps({k:v for k,v in report.items() if k not in ('issues','apiAnomalies')}))
