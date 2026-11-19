import {writeFileSync} from 'node:fs';

const [uid, output, ...extra] = process.argv.slice(2);

async function main() {
  if (!/^4:\d+$/.test(uid ?? '') || !output || extra.length) {
    throw Error('Usage: node tools/mine-restart/read-facility.mjs 4:UID NEW_OUTPUT.json');
  }
  const token = process.env.SWC_ACCESS_TOKEN?.trim();
  if (!token) throw Error('SWC_ACCESS_TOKEN is required for live reads.');
  const url = new URL(`https://www.swcombine.com/ws/v2.0/inventory/facilities/${uid}/`);
  const response = await fetch(url, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: {Accept: 'application/json', Authorization: `OAuth ${token}`},
  });
  if (!response.ok) throw Error(`Facility detail read returned HTTP ${response.status}.`);
  const body = await response.json();
  const entity = body.swcapi?.entity?.value ?? body.swcapi?.entity;
  if (entity?.uid !== uid || entity.type?.attributes?.uid !== '4:36' ||
      entity.location?.system?.attributes?.uid !== '9:104') {
    throw Error('API response did not identify the requested Kashyyyk mine.');
  }
  writeFileSync(output, JSON.stringify({observedAt: new Date().toISOString(), entity}, null, 2) + '\n',
    {flag: 'wx', mode: 0o600});
  console.log(`Saved private API evidence for ${uid}.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
