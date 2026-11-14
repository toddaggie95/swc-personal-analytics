import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const script = resolve('tools/api-parity/persist-swc-token.sh').replaceAll('\\', '/');
test('persistence skips unchanged credentials, saves changes, propagates writer failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'swc-persist-fixture-'));
  try {
    const bin = join(root,'bin'); mkdirSync(bin);
    const marker = join(root,'writes');
    writeFileSync(join(bin,'gh'), '#!/usr/bin/env bash\ncat > "$SWC_FIXTURE_MARKER"\nexit "${SWC_FIXTURE_EXIT:-0}"\n', {mode:0o700});
    const token = {accessToken:'fixture',refreshToken:'fixture-refresh',expiresAt:123};
    const save = (name,value) => writeFileSync(join(root,name), JSON.stringify(value));
    save('tokens.json',token); save('initial-tokens.json',token);
    const env = {...process.env, SWC_PRIVATE_DIR:root.replaceAll('\\','/'), GITHUB_REPOSITORY:'fixture/repo',
      SWC_SECRET_WRITER_TOKEN:'fixture-writer', SWC_FIXTURE_MARKER:marker.replaceAll('\\','/')};
    const run = (extra={}) => spawnSync(bash, ['-c', 'export PATH="$SWC_FIXTURE_BIN:$PATH"; bash "$SWC_FIXTURE_SCRIPT"'],
      {env:{...env, SWC_FIXTURE_BIN:bin.replaceAll('\\','/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase()), SWC_FIXTURE_SCRIPT:script,...extra},encoding:'utf8'});
    let result=run(); assert.equal(result.status,0,result.stderr); assert.equal(existsSync(marker),false);
    const rotated={...token,accessToken:'fixture-new'};save('tokens.json',rotated);
    result=run(); assert.equal(result.status,0,result.stderr); assert.deepEqual(JSON.parse(readFileSync(marker)),rotated);
    result=run({SWC_FIXTURE_EXIT:'1'}); assert.equal(result.status,1);
    save('persisted-tokens.json',rotated);rmSync(marker);
    result=run();assert.equal(result.status,0,result.stderr);assert.equal(existsSync(marker),false);
    rmSync(join(root,'persisted-tokens.json'));rmSync(join(root,'initial-tokens.json'));
    result=run();assert.equal(result.status,1);assert.equal(existsSync(marker),false);
    assert.ok(!result.stdout.includes('fixture-refresh'));
  } finally { rmSync(root,{recursive:true,force:true}); }
});
