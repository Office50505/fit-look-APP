#!/usr/bin/env node
// Regression: reproduce the bad state from build 26: Debug engine + Release marker.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const version = require('../node_modules/react-native/package.json').version;
const realPods = path.resolve(__dirname, '../ios/Pods');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'lookmefy-hermes-regression-'));
try {
  fs.mkdirSync(path.join(fixture, 'hermes-engine-artifacts'));
  fs.mkdirSync(path.join(fixture, 'hermes-engine'));
  const release = `hermes-ios-${version}-release.tar.gz`;
  fs.symlinkSync(path.join(realPods, 'hermes-engine-artifacts', release), path.join(fixture, 'hermes-engine-artifacts', release));
  execFileSync('/usr/bin/tar', ['-xzf', path.join(realPods, 'hermes-engine-artifacts', `hermes-ios-${version}-debug.tar.gz`), '-C', path.join(fixture, 'hermes-engine')]);
  fs.writeFileSync(path.join(fixture, '.last_build_configuration'), 'Release');
  const run = () => execFileSync(process.execPath, [path.join(__dirname, 'prepare_ios_hermes.cjs'), 'Release', fixture], { encoding: 'utf8' });
  const repaired = run();
  assert.match(repaired, /Repairing mismatched Hermes files/);
  assert.match(repaired, /PASS Hermes/);
  const second = run();
  assert.doesNotMatch(second, /Repairing/);
  assert.match(second, /PASS Hermes/);
  console.log('PASS: stale Release marker with Debug binaries is repaired; repeated verification is idempotent');
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
