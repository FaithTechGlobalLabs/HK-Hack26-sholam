#!/usr/bin/env python3
"""Package verbatim root licence/notice files from resolved Swift dependencies."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re

IOS = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--resolved', type=Path, default=IOS / 'Shalom.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved')
parser.add_argument('--checkouts', type=Path, default=IOS / 'DerivedData/SourcePackages/checkouts')
args = parser.parse_args()
resolved_bytes = args.resolved.read_bytes()
resolved = json.loads(resolved_bytes)
sections = ['Shalom: Third-party notices\n\nLicence and notice text is reproduced verbatim from the resolved Swift dependencies.\n']
packages = []
for pin in sorted(resolved['pins'], key=lambda item: item['identity']):
    identity = pin['identity']
    if not re.fullmatch(r'[a-z0-9][a-z0-9._-]*', identity):
        raise SystemExit(f'Invalid dependency identity: {identity}')
    checkout = args.checkouts / identity
    files = sorted(p for p in checkout.iterdir() if p.is_file() and p.name.upper().startswith(('LICENSE', 'NOTICE')))
    if not any(p.name.upper().startswith('LICENSE') for p in files):
        raise SystemExit(f'Missing licence file for {identity}; resolve its pinned checkout first')
    version = pin['state'].get('version', pin['state']['revision'])
    sections.append(f'\n{"=" * 72}\n{identity} {version}\n{pin["location"]}\nRevision: {pin["state"]["revision"]}\n')
    notices = []
    for source in files:
        raw = source.read_bytes()
        text = raw.decode('utf-8')
        sections.append(f'\n--- {source.name} ---\n\n{text}')
        if not text.endswith('\n'):
            sections.append('\n')
        notices.append({'file': source.name, 'sha256': hashlib.sha256(raw).hexdigest()})
    packages.append({'identity': identity, 'version': version, 'revision': pin['state']['revision'],
                     'repository': pin['location'], 'notices': notices})
content = ''.join(sections).encode('utf-8')
resources = IOS / 'App/Resources'
(resources / 'ThirdPartyNotices.txt').write_bytes(content)
manifest = {'resolvedSHA256': hashlib.sha256(resolved_bytes).hexdigest(),
            'documentSHA256': hashlib.sha256(content).hexdigest(), 'packages': packages}
(resources / 'ThirdPartyNotices.sources.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Packaged verbatim licences/notices for {len(packages)} resolved dependencies ({len(content)} bytes).')
