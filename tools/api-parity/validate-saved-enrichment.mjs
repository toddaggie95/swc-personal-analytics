import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { stationFields } from './station-fields.ts';

const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(doc.errors, 0);
assert.equal(doc.rows.length, 50);
const counts = { stations: 50, names: 0, locations: 0, nestedCoordinates: 0, toolingObjects: 0, toolingValues: 0 };
for (const row of doc.rows) {
  assert.equal(row.detailRead, 'ok');
  // Prior artifact retained source location/tooling objects, allowing an offline mapping check.
  const mapped = stationFields({name:row.stationName, location:row.stationLocation}, {}, row.tooledTo);
  counts.names += mapped.stationName != null;
  counts.locations += mapped.stationLocation != null;
  counts.nestedCoordinates += mapped.stationCoordinates != null;
  counts.toolingObjects += mapped.tooledTo != null;
  counts.toolingValues += mapped.tooledToValue != null;
  assert.deepEqual(mapped.stationCoordinates, row.stationLocation.coordinates);
  if (row.tooledTo != null) assert.equal(mapped.tooledToValue, row.tooledTo.value);
}
assert.equal(counts.nestedCoordinates, 50);
assert.equal(counts.toolingObjects, 10);
assert.equal(counts.toolingValues, 10);
const report = { sourceRun:42190245065, validation:'offline mapping of retained source objects; no new API capture', counts };
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
