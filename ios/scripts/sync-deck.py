#!/usr/bin/env python3
"""Package the canonical public deck for iOS; never edit teaching content here."""
from __future__ import annotations

import hashlib
import json
import pathlib

repo = pathlib.Path(__file__).resolve().parents[2]
output = repo / "ios/App/Resources"
paths = ["data/flashcards.seed.json", "data/faithmap.cards.json"]
facts = json.loads((repo / paths[0]).read_text())
discover = json.loads((repo / paths[1]).read_text())
for card in facts:
    card.setdefault("kind", "fact")
cards = facts + discover
if len({card["id"] for card in cards}) != len(cards):
    raise SystemExit("Duplicate card ids; fix the canonical source rather than the bundle")
output.mkdir(parents=True, exist_ok=True)
(output / "BundledDeck.json").write_text(
    json.dumps({"cards": cards}, ensure_ascii=False, indent=2) + "\n"
)
(output / "DeckProvenance.json").write_text(json.dumps({
    "generatedFrom": paths,
    "counts": {"fact": len(facts), "discover": len(discover)},
    "sources": {path: hashlib.sha256((repo / path).read_bytes()).hexdigest() for path in paths},
    "content": "Copied from the canonical sources without generating or editing teaching text. See docs/SOURCES.md.",
}, indent=2) + "\n")
print(f"Bundled {len(facts)} fact and {len(discover)} discover cards. Canonical files unchanged.")
