"""Compare captured sheet Started/tooling cells with complete station API records."""
import argparse, csv, json, pathlib
import importlib.util

spec = importlib.util.spec_from_file_location('enriched', pathlib.Path(__file__).with_name('enriched-station-parity.py'))
enriched = importlib.util.module_from_spec(spec)
spec.loader.exec_module(enriched)


def compare(snapshot, stations, api):
    # Identity comes from the audited manifest plus CSV location, never a row-order join.
    source = {enriched.uid(s['uid']): s for s in stations}
    actual = {}
    for a in api:
        key = enriched.uid(a['uid'])
        if key in actual: raise ValueError('Duplicate API station UID')
        actual[key] = a
    issues, checked, running, unknown = [], 0, 0, 0
    for dest in snapshot['manifest']['destinations']:
        rows = snapshot['rowsBySystem'][dest['system']]
        members = []
        if dest['kind'] == 'hub':
            col = dest['target']['hasColumn'] - 2
            header = dest['target']['materialStartRow'] - 11
            if '('+str(dest['center']['x'])+','+str(dest['center']['y'])+')' not in rows[header][col]:
                raise ValueError('Hub heading drift')
            positions = {}
            for index in range(header+1,header+10):
                row = rows[index]
                xy = str(row[col] if col<len(row) else '').replace(' ','').strip('()')
                if xy:
                    if xy in positions: raise ValueError('Duplicate hub coordinate')
                    positions[xy] = index
            for key in dest['memberStationUids']:
                s = source[key]
                xy = s['sysX']+','+s['sysY']
                members.append((key,positions.get(xy),col))
        elif dest['kind'] == 'oneoff-group':
            for one in dest.get('oneoffs',[]):
                members.append((one['stationUid'],one['row']+(0 if dest['system']=='Tholatin' else 1),0))
        else: raise ValueError('Unknown destination kind')
        for key,index,col in members:
            s = source[key]
            if 'shipyard' not in s['type_name'].lower(): continue
            if index is None: raise ValueError('Unmapped tracked shipyard')
            if key not in actual: raise ValueError('Tracked shipyard missing from API')
            a = actual[key]
            if a.get('detailRead') != 'ok': raise ValueError('Failed API detail read')
            fields = enriched.api_fields(a)
            if enriched.text(fields['system']) != dest['system'] or any(enriched.text(fields[c])!=s[c] for c in ['sysX','sysY']):
                raise ValueError('API station location drift; review identity mapping')
            row = rows[index]
            cell = lambda c: enriched.text(row[c] if c<len(row) else '')
            classification = a.get('classification')
            if classification not in ['producing','idle-assigned-tooled','idle-unassigned','retooling']:
                unknown += 1
                continue
            checked += 1
            active = classification == 'producing'
            running += active
            if (cell(col+3).lower() == 'yes') != active:
                issues.append({'uid':key,'system':dest['system'],'row':index,'field':'started','sheet':cell(col+3),'api':classification})
            # Idle assignments are plans; only a producing station must match current tooling.
            if active and cell(col+1) != enriched.text(a.get('tooledToValue')):
                issues.append({'uid':key,'system':dest['system'],'row':index,'field':'runningShip','sheet':cell(col+1),'api':a.get('tooledToValue')})
    return {'checkedShipyards':checked,'running':running,'unknown':unknown,'issues':issues,
            'limitations':['API production quantity was not retained by this collector; quantities are checked only between the web exports and sheet.',
                            'Idle planned ship assignments are not equivalent to current tooling.']}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('snapshot',type=pathlib.Path);parser.add_argument('web',type=pathlib.Path)
    parser.add_argument('api',type=pathlib.Path);parser.add_argument('output',type=pathlib.Path)
    args=parser.parse_args();stations=[];api=[]
    for faction in ['tff','tjo']:
        with (args.web/(faction+'-stations.csv')).open(encoding='utf-8-sig',newline='') as stream:
            stations.extend(csv.DictReader(stream))
    for path in args.api.rglob('station-audit-*.json'):api.extend(json.loads(path.read_text())['rows'])
    report=compare(json.loads(args.snapshot.read_text(encoding='utf8')),stations,api)
    args.output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='issues'}), 'issueCount='+str(len(report['issues'])))


if __name__=='__main__':main()
