#!/usr/bin/env python3
"""Lightweight source/resource checks; DOES NOT compile Swift or contact services."""
from __future__ import annotations

import hashlib
import json
import pathlib
import plistlib
import re
import struct
import subprocess
import xml.etree.ElementTree as ET

IOS = pathlib.Path(__file__).resolve().parents[1]
REPO = IOS.parent
errors: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


config = (IOS / "Config/App.xcconfig").read_text()
project = (IOS / "project.yml").read_text()
check(bool(re.search(r"^SHOLAM_BILLING_ENABLED\s*=\s*NO\s*$", config, re.M)), "Billing must be NO by default")
check(bool(re.search(r"^SHOLAM_PRODUCT_IDS\s*=\s*$", config, re.M)), "No real product ids may be enabled")
check("ShalomBillingEnabled: false" in project, "Generated Info.plist must hard-disable billing")
info = plistlib.loads((IOS / "App/Info.plist").read_bytes())
check(info.get("ShalomBillingEnabled") is False, "Generated app billing must remain disabled")
check(info.get("ITSAppUsesNonExemptEncryption") is False, "Keep the reviewed exempt-encryption declaration")
check("exactVersion: 2.55.6" in project, "Pin the reviewed Supabase Swift version")
check('iOS: "17.0"' in project, "Keep the documented iOS deployment target")
check("CODE_SIGNING_ALLOWED: NO" in project, "Keep unsigned Debug/simulator defaults")
check("ShalomUITests" in project, "Keep the authored native UI test target")

canonical: list[dict] = []
for file in ("data/flashcards.seed.json", "data/faithmap.cards.json"):
    content = json.loads((REPO / file).read_text())
    if "seed" in file:
        for card in content:
            card.setdefault("kind", "fact")
    canonical.extend(content)

bundled = json.loads((IOS / "App/Resources/BundledDeck.json").read_text())
check(bundled.get("cards") == canonical, "Bundled deck drifted from the canonical teaching content")
provenance = json.loads((IOS / "App/Resources/DeckProvenance.json").read_text())
for file, checksum in provenance.get("sources", {}).items():
    check(hashlib.sha256((REPO / file).read_bytes()).hexdigest() == checksum, f"Provenance checksum mismatch: {file}")
check(len({card["id"] for card in canonical}) == len(canonical), "Card ids must be unique")

notice_bytes = (IOS / "App/Resources/ThirdPartyNotices.txt").read_bytes()
notice_sources = json.loads((IOS / "App/Resources/ThirdPartyNotices.sources.json").read_text())
resolved_bytes = (IOS / "Shalom.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved").read_bytes()
resolved_pins = json.loads(resolved_bytes)["pins"]
check(hashlib.sha256(notice_bytes).hexdigest() == notice_sources["documentSHA256"], "Dependency notice text hash mismatch")
check(hashlib.sha256(resolved_bytes).hexdigest() == notice_sources["resolvedSHA256"], "Regenerate notices after changing resolved dependencies")
check({p["identity"] for p in notice_sources["packages"]} == {p["identity"] for p in resolved_pins}, "Missing dependency licence notices")

with (IOS / "App/Resources/PrivacyInfo.xcprivacy").open("rb") as source:
    privacy = plistlib.load(source)
check(privacy.get("NSPrivacyTracking") is False, "Tracking must remain off")
check(privacy.get("NSPrivacyTrackingDomains") == [], "No tracking domains")
reasons = {item["NSPrivacyAccessedAPIType"]: item["NSPrivacyAccessedAPITypeReasons"]
           for item in privacy.get("NSPrivacyAccessedAPITypes", [])}
check("CA92.1" in reasons.get("NSPrivacyAccessedAPICategoryUserDefaults", []), "Declare app-owned UserDefaults use")
check("C617.1" in reasons.get("NSPrivacyAccessedAPICategoryFileTimestamp", []), "Declare app-owned cache timestamp use")
launch = ET.parse(IOS / "App/Resources/LaunchScreen.storyboard").getroot()
check(launch.attrib.get("launchScreen") == "YES", "Use an actual native launch screen")
check((IOS / "App/Resources/Assets.xcassets/ShalomMark.imageset/ShalomMark.svg").read_bytes()
      == (REPO / "public/brand/sholam-mark-white.svg").read_bytes(), "Native launch mark must match the canonical cross-cloud")

icon = (IOS / "App/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png").read_bytes()
check(icon[:8] == b"\x89PNG\r\n\x1a\n", "Native app icon must be PNG")
check(struct.unpack("!II", icon[16:24]) == (1024, 1024), "App icon must be 1024 square")
check(icon[25] == 2, "App icon must be opaque RGB, without an alpha channel")

for source in IOS.rglob("*"):
    if not source.is_file() or any(part in {".build", "build", "DerivedData", "xcuserdata"} for part in source.parts):
        continue
    if source.suffix not in {".swift", ".json", ".plist", ".xcconfig", ".yml", ".md"}:
        continue
    text = source.read_text(errors="replace")
    check(not re.search(r"sk-or-v1-[A-Za-z0-9]{20,}", text), f"Provider key pattern in {source.relative_to(IOS)}")
    check(not re.search(r"postgres(?:ql)?://[^\s\"']+:[^\s\"']+@", text), f"Database credential URL in {source.relative_to(IOS)}")
    check("-----BEGIN PRIVATE KEY-----" not in text, f"Private key in {source.relative_to(IOS)}")

# Generated project checks are optional until xcodegen generation, never a build.
pbx = IOS / "Shalom.xcodeproj/project.pbxproj"
if pbx.exists():
    generated = pbx.read_text()
    check("ShalomCore" in generated and "ShalomUITests" in generated, "Generated project is missing its core package or UI tests")
    check("2.55.6" in generated, "Generated project did not pin Supabase")
    metadata = json.loads(subprocess.run(["plutil", "-convert", "json", "-o", "-", str(pbx)],
                                        capture_output=True, text=True, check=True).stdout)
    objects = metadata["objects"]
    targets = {obj["name"]: obj for obj in objects.values() if obj.get("isa") == "PBXNativeTarget"}
    check({"Shalom", "ShalomTests", "ShalomUITests"}.issubset(targets), "Missing native app/unit/UI test targets")
    app_configuration_list = objects.get(targets.get("Shalom", {}).get("buildConfigurationList"), {})
    app_configurations = {
        objects[item]["name"]: objects[item].get("buildSettings", {})
        for item in app_configuration_list.get("buildConfigurations", [])
    }
    release = app_configurations.get("Release", {})
    check(release.get("CODE_SIGNING_ALLOWED") == "YES", "Release app must permit explicit device signing")
    check(release.get("CODE_SIGN_STYLE") == "Manual", "Keep manual provisioning scoped to the Release app target")
    check(release.get("DEVELOPMENT_TEAM") == "3LHSL95J9H", "Release app must use the verified Apple team")
    check(release.get("PROVISIONING_PROFILE_SPECIFIER") == "Shalom AppStore", "Release app must use its own provisioning profile")
    def files_in(target: str, kind: str) -> set[str]:
        files: set[str] = set()
        for phase_id in targets.get(target, {}).get("buildPhases", []):
            phase = objects[phase_id]
            if phase.get("isa") != kind:
                continue
            for file_id in phase.get("files", []):
                reference = objects.get(objects[file_id].get("fileRef"), {})
                files.add(reference.get("path", reference.get("name", "")))
        return files
    app_sources = files_in("Shalom", "PBXSourcesBuildPhase")
    expected_sources = {source.name for source in (IOS / "App").rglob("*.swift")}
    check(expected_sources.issubset(app_sources), "Regenerate the project: some native app source files are missing")
    check(not any("Tests.swift" in name for name in app_sources), "Do not ship tests in the app target")
    resources = files_in("Shalom", "PBXResourcesBuildPhase")
    check({"Assets.xcassets", "BundledDeck.json", "DeckProvenance.json", "PrivacyInfo.xcprivacy", "LaunchScreen.storyboard", "ThirdPartyNotices.txt", "ThirdPartyNotices.sources.json"}.issubset(resources), "Missing native app resources")

if errors:
    for error in errors:
        print(f"FAIL: {error}")
    raise SystemExit(1)
print(f"Source/resource checks passed: {len(canonical)} canonical cards, icon, privacy, free configuration and credential-pattern scan.")
print("This source-only check does not exercise Swift compilation, native tests/rendering, auth callbacks or StoreKit. See ios/README.md for recorded native runs.")
