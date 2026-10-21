#!/usr/bin/env node
// Verify the engine bytes, not just React Native's configuration-only cache marker.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');

async function digestFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function digestMember(archive, member) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/tar', ['-xOf', archive, `./${member}`]);
    const hash = crypto.createHash('sha256');
    let error = '';
    child.stdout.on('data', chunk => hash.update(chunk));
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(hash.digest('hex')) : reject(new Error(error || `tar exited ${code}`)));
  });
}
async function main() {
  const configuration = process.argv[2];
  if (!['Debug', 'Release'].includes(configuration)) throw new Error('Expected Debug or Release configuration');
  const pods = path.resolve(process.argv[3] || path.join(__dirname, '../ios/Pods'));
  const version = require('../node_modules/react-native/package.json').version;
  const archive = path.join(pods, 'hermes-engine-artifacts', `hermes-ios-${version}-${configuration.toLowerCase()}.tar.gz`);
  const members = [
    'destroot/Library/Frameworks/universal/hermes.xcframework/ios-arm64/hermes.framework/hermes',
    'destroot/Library/Frameworks/universal/hermes.xcframework/ios-arm64_x86_64-simulator/hermes.framework/hermes',
    'destroot/include/hermes/hermes.h',
    'destroot/include/jsi/jsi.h'
  ];
  const expected = await Promise.all(members.map(member => digestMember(archive, member)));
  const matches = async () => {
    for (let n = 0; n < members.length; n++) {
      const file = path.join(pods, 'hermes-engine', members[n]);
      if (!fs.existsSync(file) || await digestFile(file) !== expected[n]) return false;
    }
    return true;
  };
  if (!await matches()) {
    console.log(`Repairing mismatched Hermes files: React Native ${version}, ${configuration}`);
    const destination = path.join(pods, 'hermes-engine');
    fs.mkdirSync(destination, { recursive: true });
    execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', destination], { stdio: 'inherit' });
    if (!await matches()) throw new Error('Hermes artifacts still mismatch after extraction');
  }
  fs.writeFileSync(path.join(pods, '.last_build_configuration'), configuration);
  console.log(`PASS Hermes ${version} ${configuration}: device/simulator binaries and headers match the pinned artifact`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
