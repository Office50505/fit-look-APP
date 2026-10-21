#!/usr/bin/env python3
"""Verify Lookmefy versions, signatures, ZIP integrity and the Release Hermes UUID."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import re
import subprocess
import tarfile
import tempfile
import zipfile


def run(*args):
    result = subprocess.run([str(a) for a in args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout + result.stderr


def uuids(path):
    result = dict((arch, uuid) for uuid, arch in re.findall(r'UUID: ([A-F0-9-]+) \(([^)]+)\)', run('dwarfdump', '--uuid', path)))
    if not result:
        raise RuntimeError(f'No Mach-O UUID: {path}')
    return result


def identity(app, version, build):
    data = plistlib.loads((app / 'Info.plist').read_bytes())
    expected = ('com.kratikdhote.lookmefy', version, build)
    actual = tuple(data.get(k) for k in ['CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion'])
    if actual != expected:
        raise RuntimeError(f'iOS identity mismatch: {actual} expected {expected}')
    return {k: data.get(k) for k in ['CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion', 'MinimumOSVersion', 'DTSDKName', 'DTXcode', 'NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSMicrophoneUsageDescription']}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--ipa', type=Path)
    parser.add_argument('--version', required=True)
    parser.add_argument('--build', required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    mobile = Path(__file__).resolve().parent.parent
    rn = json.loads((mobile / 'node_modules/react-native/package.json').read_text())['version']
    tarball = mobile / f'ios/Pods/hermes-engine-artifacts/hermes-ios-{rn}-release.tar.gz'
    app = args.archive / 'Products/Applications/Lookmefy.app'
    facts = {'react_native': rn, 'metadata': identity(app, args.version, args.build)}
    with tempfile.TemporaryDirectory(prefix='lookmefy-ios-verify-') as folder:
        temporary = Path(folder)
        expected_binary = temporary / 'expected-hermes'
        with tarfile.open(tarball) as tar:
            member = './destroot/Library/Frameworks/universal/hermes.xcframework/ios-arm64/hermes.framework/hermes'
            with tar.extractfile(member) as source:
                expected_binary.write_bytes(source.read())
        expected = uuids(expected_binary)
        facts['expected_release_hermes_uuid'] = expected
        actual = uuids(app / 'Frameworks/hermes.framework/hermes')
        if actual != expected:
            raise RuntimeError(f'Archive contains wrong Hermes engine: {actual}; expected Release {expected}')
        facts['archive_hermes_uuid'] = actual
        facts['archive_signature'] = run('codesign', '--verify', '--deep', '--strict', '--verbose=2', app)
        facts['archive_signing'] = run('codesign', '-dvv', app)
        if args.ipa:
            with zipfile.ZipFile(args.ipa) as z:
                if z.testzip() is not None:
                    raise RuntimeError('IPA ZIP CRC failure')
                z.extractall(temporary / 'ipa')
            exported = temporary / 'ipa/Payload/Lookmefy.app'
            facts['ipa_metadata'] = identity(exported, args.version, args.build)
            actual = uuids(exported / 'Frameworks/hermes.framework/hermes')
            if actual != expected:
                raise RuntimeError(f'IPA contains wrong Hermes engine: {actual}; expected Release {expected}')
            facts['ipa_hermes_uuid'] = actual
            facts['ipa_signature'] = run('codesign', '--verify', '--deep', '--strict', '--verbose=2', exported)
            facts['ipa_signing'] = run('codesign', '-dvv', exported)
            with args.ipa.open('rb') as stream:
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            facts['artifacts'] = {args.ipa.name: {'bytes': args.ipa.stat().st_size, 'sha256': digest, 'zip_verified': True}}
    if args.output:
        args.output.write_text(json.dumps(facts, indent=2) + '\n')
    print(f'PASS iOS {args.version} ({args.build}): identity, signature and Release Hermes UUID {expected["arm64"]}')
    if args.ipa:
        print(f'PASS IPA ZIP integrity, identity, signing, Hermes configuration; SHA-256 {digest}')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, zipfile.BadZipFile) as error:
        raise SystemExit(f'FAIL: {error}')
