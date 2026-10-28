export function isValidSnapshot(snapshot) {
 return snapshot?.schemaVersion === 1 && Array.isArray(snapshot.stations) && snapshot.stations.every(s => typeof s.uid === 'string' && s.uid.length > 0);
}
