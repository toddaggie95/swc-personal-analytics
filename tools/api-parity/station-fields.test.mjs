import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stationFields } from './station-fields.ts';

test('nested coordinates preserve zero and tooling value preserves structured source', () => {
  const coordinates = { x: 0, y: -5 };
  const tooling = { attributes: { uid: '2:42' }, value: 'Test ship' };
  const fields = stationFields({ location: { coordinates } }, {}, tooling);
  assert.deepEqual(fields.stationCoordinates, coordinates);
  assert.equal(fields.tooledToValue, 'Test ship');
  assert.deepEqual(fields.tooledTo, tooling);
});
test('attribute and inventory fallback, absent tooling and scalar tooling', () => {
  assert.deepEqual(stationFields({}, { location: { coordinates: { x: 0 } } }, null).stationCoordinates, { x: 0 });
  assert.equal(stationFields({ attributes: { name: 'S' } }, {}, null).stationName, 'S');
  assert.equal(stationFields({}, {}, null).tooledToValue, null);
  assert.equal(stationFields({}, {}, 'Ship').tooledToValue, 'Ship');
  assert.equal(stationFields({}, {}, { attributes: { value: 'Ship' } }).tooledToValue, 'Ship');
});
