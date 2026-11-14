const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

export function stationFields(detail: unknown, station: unknown, tooledTo: unknown) {
  const d = record(detail), a = record(d.attributes), s = record(station);
  const location = d.location ?? a.location ?? s.location ?? null;
  return {
    stationName: d.name ?? a.name ?? s.name ?? null,
    stationLocation: location,
    stationCoordinates: record(location).coordinates ?? d.coordinates ?? a.coordinates ?? s.coordinates ?? null,
    tooledTo: tooledTo ?? null,
    tooledToValue: typeof tooledTo === 'string' || typeof tooledTo === 'number'
      ? tooledTo : record(tooledTo).value ?? record(record(tooledTo).attributes).value ?? null,
  };
}
