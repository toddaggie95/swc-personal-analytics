"""Read-only comparison of enriched detail artifacts with web station CSVs."""
import argparse, collections, csv, hashlib, json, pathlib, re


def uid(value):
    value = str(value).strip()
    if not re.fullmatch(r'(?:5:)?[0-9]+', value):
        raise ValueError('Invalid station UID')
    return '5:' + str(int(value.split(':')[-1]))


def text(value):
    return '' if value is None else str(value).strip()


def record(value):
    return value if isinstance(value, dict) else {}


def scalar(value, key):
    obj = record(value)
    return obj.get(key, record(obj.get('attributes')).get(key))


def api_fields(row):
    loc, coords = record(row.get('stationLocation')), record(row.get('stationCoordinates'))
    result = {'name': row.get('stationName'), 'tooled-to': row.get('tooledToValue')}
    for key in ['sector', 'system', 'planet', 'city']:
        value = record(loc.get(key))
        result[key] = value.get('value', value.get('name'))
        result[key + '_uid'] = scalar(value, 'uid')
    for prefix, level in [('gal', 'galaxy'), ('sys', 'system')]:
        for axis in ['x', 'y']:
            result[prefix + axis.upper()] = scalar(coords.get(level), axis)
    return result


def compare(web, api, mode='sample', run_id=None):
    indexed, seen, counts, issues, unknown = {}, set(), {}, [], collections.Counter()
    for faction, rows in web.items():
        indexed[faction] = {}
        for row in rows:
            key = uid(row['uid'])
            if key in seen:
                raise ValueError('Duplicate or cross-faction CSV station UID')
            seen.add(key)
            indexed[faction][key] = row
        counts[faction] = {'csv': len(rows), 'api': 0, 'matched': 0, 'csvOnly': 0, 'apiOnly': 0}
    api_seen, fields = set(), collections.Counter()
    for row in api:
        faction, key = row['faction'], uid(row['uid'])
        if faction not in indexed or key in api_seen:
            raise ValueError('Unknown faction or duplicate API UID')
        api_seen.add(key)
        if row.get('detailRead') != 'ok':
            raise ValueError('Failed API detail read')
        counts[faction]['api'] += 1
        source = indexed[faction].get(key)
        if source is None:
            counts[faction]['apiOnly'] += 1
            issues.append({'faction': faction, 'uid': key, 'field': 'apiOnly'})
            continue
        counts[faction]['matched'] += 1
        for field, actual in api_fields(row).items():
            if field not in source:
                unknown[field] += 1
                continue
            # Missing whole API structures are unknown, not proof of blank values.
            if field == 'name' and actual is None or field.startswith(('gal', 'sys')) and field not in ['system', 'system_uid'] and actual is None:
                unknown[field] += 1
                continue
            fields[field] += 1
            if text(source[field]) != text(actual):
                issues.append({'faction': faction, 'uid': key, 'field': field, 'csv': source[field], 'api': actual})
        classification = row.get('classification')
        if classification in ['producing', 'idle-unassigned', 'idle-assigned-tooled', 'retooling']:
            fields['productionActive'] += 1
            if (text(source.get('productionStatus')).lower() == 'running') != (classification == 'producing'):
                issues.append({'faction': faction, 'uid': key, 'field': 'productionActive', 'csv': source.get('productionStatus'), 'api': classification})
        else:
            unknown['productionActive'] += 1
    for faction, data in indexed.items():
        missing = data.keys() - api_seen
        counts[faction]['csvOnly'] = len(missing)
        if mode == 'full':
            issues.extend({'faction': faction, 'uid': key, 'field': 'csvOnly'} for key in sorted(missing))
    return {'apiRunId': run_id, 'mode': mode, 'factions': counts, 'apiStations': len(api_seen),
            'comparedFields': dict(fields), 'unknownFields': dict(unknown),
            'issueCounts': dict(collections.Counter(x['field'] for x in issues)), 'issues': issues,
            'limitations': ['Snapshots are not simultaneous; differences require review.',
                            'Sample mode excludes uncollected CSV rows from discrepancies.',
                            'Production quantity, timers and material readiness are not compared by this report.']}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('web', type=pathlib.Path)
    parser.add_argument('api', type=pathlib.Path)
    parser.add_argument('output', type=pathlib.Path)
    parser.add_argument('--mode', choices=['sample', 'full'], required=True)
    parser.add_argument('--run-id', required=True)
    args = parser.parse_args()
    web, sources = {}, {}
    for faction in ['tff', 'tjo']:
        path = args.web / (faction + '-stations.csv')
        with path.open(encoding='utf-8-sig', newline='') as stream:
            web[faction] = list(csv.DictReader(stream))
        sources[faction] = {'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    api = []
    paths = sorted(args.api.rglob('station-audit-*.json'))
    for path in paths:
        doc = json.loads(path.read_text())
        if doc.get('errors') or any(row.get('faction') != doc.get('faction') for row in doc['rows']):
            raise ValueError('Invalid or failed API batch')
        api.extend(doc['rows'])
    if not api:
        raise ValueError('No API rows')
    report = compare(web, api, args.mode, args.run_id)
    report.update({'csvSources': sources, 'batchFiles': len(paths)})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'issues'}))


if __name__ == '__main__':
    main()
