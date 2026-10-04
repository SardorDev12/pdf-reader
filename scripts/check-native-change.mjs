// Decides whether the changes since a base commit need a new native build (so an OTA update must NOT be published).
//   node scripts/check-native-change.mjs <base-sha> [head-ref=HEAD]
// Prints a verdict, and when running in GitHub Actions writes `native=true|false` to $GITHUB_OUTPUT.
// "Native" = a changed runtime dependency that ships native code, native app config (app.json minus `version`),
// or icon/splash assets. Needs node_modules installed (to see which packages contain native code).
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';

const base = process.argv[2];
const head = process.argv[3] || 'HEAD';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const reasons = [];

if (base && !/^0+$/.test(base)) {
  let changed = [];
  try {
    changed = git('diff', '--name-only', base, head).split('\n').filter(Boolean);
  } catch {
    reasons.push(`could not diff against ${base.slice(0, 7)} (treating as native to be safe)`);
  }

  for (const f of changed) {
    if (/^assets\/(icon|android-icon|splash|favicon)/.test(f)) reasons.push(`${f} (app icon / splash are part of the build)`);
  }

  if (changed.includes('app.json')) {
    const strip = (j) => { const c = JSON.parse(JSON.stringify(j)); if (c.expo) delete c.expo.version; return JSON.stringify(c); };
    try {
      if (strip(JSON.parse(git('show', `${base}:app.json`))) !== strip(JSON.parse(git('show', `${head}:app.json`)))) {
        reasons.push('app.json (native configuration changed)');
      }
    } catch {
      reasons.push('app.json could not be compared');
    }
  }

  if (changed.includes('package.json')) {
    const before = JSON.parse(git('show', `${base}:package.json`)).dependencies ?? {};
    const after = JSON.parse(git('show', `${head}:package.json`)).dependencies ?? {};
    for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (before[name] === after[name]) continue;
      const dir = `node_modules/${name}`;
      const hasNative = existsSync(dir)
        ? ['android', 'ios', 'expo-module.config.json', 'app.plugin.js'].some((p) => existsSync(`${dir}/${p}`))
        : /^(expo-|@expo\/|react-native|@react-native)/.test(name); // removed package: guess from its name
      if (hasNative) reasons.push(`dependency ${name}: ${before[name] ?? '(none)'} -> ${after[name] ?? '(removed)'} contains native code`);
    }
  }
}

const native = reasons.length > 0;
console.log(native ? 'NATIVE CHANGE - an OTA update cannot deliver this:\n  - ' + reasons.join('\n  - ') : 'JS-only change - safe to publish over the air.');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `native=${native}\n`);
if (process.env.GITHUB_STEP_SUMMARY && native) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### OTA update skipped\nThis push changes native code, so it needs a new build first:\n\n- ${reasons.join('\n- ')}\n\nRun **EAS Build (Android)**, install it, and later JS-only pushes will update over the air again.\n`);
}
