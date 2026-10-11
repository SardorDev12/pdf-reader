// Read-only: prints the signing-certificate fingerprint of recent finished Android builds of this Expo project
// (it downloads each build artifact and reads its certificate). It does NOT start any build.
//   node scripts/signing-info.mjs [expected-sha1] [how-many-builds]
// Needs: eas-cli + EXPO_TOKEN, openssl, unzip; for .apk files, apksigner (present on GitHub's ubuntu runners).
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const expected = (process.argv[2] || '').toUpperCase().replace(/[^0-9A-F]/g, '');
const limit = process.argv[3] || '20';
const colon = (hex) => hex.toUpperCase().replace(/[^0-9A-F]/g, '').match(/.{2}/g)?.join(':') ?? hex;
const lines = [];
const say = (s = '') => { console.log(s); lines.push(s); };

// -- 1. finished android builds of this project
const raw = execFileSync('eas', ['build:list', '--platform', 'android', '--status', 'finished', '--limit', limit, '--json', '--non-interactive'], { encoding: 'utf8', maxBuffer: 100e6 });
const builds = JSON.parse(raw.slice(raw.indexOf('[')));
say(`Found ${builds.length} finished Android build(s).`);

const work = mkdtempSync(join(tmpdir(), 'signing-'));
const sh = (cmd, args, input) => spawnSync(cmd, args, { input, encoding: 'buffer', maxBuffer: 100e6 });
const rows = [], pems = new Map();

for (const b of builds) {
  const url = b.artifacts?.buildUrl || b.artifacts?.applicationArchiveUrl;
  const base = { id: b.id, profile: b.buildProfile, pkg: b.appIdentifier, version: b.appBuildVersion, created: (b.createdAt || '').slice(0, 16) };
  if (!url) { rows.push({ ...base, type: '-', sha1: '(no artifact)' }); continue; }
  const type = /\.aab(\?|$)/.test(url) ? 'aab' : 'apk';
  const file = join(work, `${b.id}.${type}`);
  const res = await fetch(url);
  if (!res.ok) { rows.push({ ...base, type, sha1: `(download failed: ${res.status})` }); continue; }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));

  let sha1 = '(could not read certificate)';
  if (type === 'aab') {
    // bundles are jar-signed: the certificate is in META-INF/*.RSA|DSA|EC (PKCS#7)
    const sig = sh('unzip', ['-p', file, 'META-INF/*.RSA', 'META-INF/*.DSA', 'META-INF/*.EC']);
    // (unzip exits non-zero when one of the three patterns matches nothing, so only the output matters)
    if (sig.stdout.length) {
      const pem = sh('openssl', ['pkcs7', '-inform', 'DER', '-print_certs'], sig.stdout);
      const first = pem.stdout.toString().match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)?.[0];
      if (first) {
        const fp = sh('openssl', ['x509', '-noout', '-fingerprint', '-sha1'], Buffer.from(first)).stdout.toString();
        sha1 = colon(fp.split('=')[1] || '');
        pems.set(sha1, first);
      }
    }
  } else {
    // apks are signed with v2/v3 blocks: ask apksigner
    const find = sh('bash', ['-c', 'ls ${ANDROID_HOME:-/usr/local/lib/android/sdk}/build-tools/*/apksigner 2>/dev/null | tail -1']).stdout.toString().trim();
    if (find) {
      const out = sh(find, ['verify', '--print-certs', file]).stdout.toString();
      const m = out.match(/certificate SHA-1 digest:\s*([0-9a-f]+)/i);
      if (m) sha1 = colon(m[1]);
    }
  }
  rows.push({ ...base, type, sha1 });
}

say();
say('| build | type | profile | package | versionCode | created | signing certificate SHA-1 |');
say('| --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) say(`| ${r.id.slice(0, 8)} | ${r.type} | ${r.profile} | ${r.pkg} | ${r.version ?? ''} | ${r.created} | ${r.sha1}${expected && r.sha1.replace(/:/g, '') === expected ? '  <-- MATCHES the key Play expects' : ''} |`);
say();
const hit = rows.find((r) => expected && r.sha1.replace(/:/g, '') === expected);
if (expected) say(hit ? `Play's expected key (${colon(expected)}) WAS used by build ${hit.id} (${hit.profile}, ${hit.pkg}).` : `Play's expected key (${colon(expected)}) was NOT used by any build in this project.`);
if (pems.size) {
  say();
  say('Certificates found in the bundles (public information; Play\'s "upload key reset" asks for a certificate like this):');
  for (const [fp, pem] of pems) { say(`\n${fp}\n\`\`\`\n${pem}\n\`\`\``); }
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
