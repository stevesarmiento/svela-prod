#!/usr/bin/env python3
"""Copy the web's custom glyphs into tintable, vector-preserving iOS image sets.

Run from any directory with Python 3. Only static SVG path elements are supported;
unexpected JSX or SVG elements fail rather than silently generating a broken icon.
"""
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

IOS = Path(__file__).resolve().parents[1]
WEB = IOS.parent / "app/src/components"
ASSETS = IOS / "AggrWatch/Resources/Assets.xcassets"
ICONS = [
    ("ActionAnalyze", "icon-analyze.tsx", "IconAnalyze", 24),
    ("ActionWatchlists", "watchlist-icons.tsx", "WatchlistsIcon", 24),
    ("ActionCreateWatchlist", "watchlist-icons.tsx", "CreateWatchlistIcon", 24),
    ("ActionAddToken", "watchlist-icons.tsx", "AddTokenIcon", 24),
    ("ActionCollapseWatchlists", "watchlist-icons.tsx", "CompressWatchlistsIcon", 24),
    ("ActionExpandWatchlists", "watchlist-icons.tsx", "ExpandWatchlistsIcon", 24),
    ("NavigationSearch", "navigation/search-icon.tsx", "SearchIcon", 32),
]


def sync(name, source, component, size):
    text = (WEB / source).read_text()
    start = text.index(f"export function {component}(")
    svg = re.search(r"<svg\b(?P<attributes>.*?)>(?P<body>.*?)</svg>", text[start:], re.S)
    if svg is None:
        raise ValueError(f"No SVG in {component}")
    view_box = re.search(r'viewBox="([^"]+)"', svg["attributes"])
    fill = re.search(r'\bfill="([^"]+)"', svg["attributes"])
    body = svg["body"].strip()
    if not view_box or "{" in body or re.search(r"<(?!path\b)", body):
        raise ValueError(f"Unsupported SVG in {component}")
    for jsx, xml in [("fillRule", "fill-rule"), ("clipRule", "clip-rule"),
                     ("strokeWidth", "stroke-width"), ("strokeLinecap", "stroke-linecap"),
                     ("strokeLinejoin", "stroke-linejoin")]:
        body = body.replace(jsx, xml)
    body = body.replace("currentColor", "#000000")
    result = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
              f'viewBox="{view_box[1]}" fill="{fill[1] if fill else "#000000"}">\n'
              f'{body}\n</svg>\n')
    ET.fromstring(result)
    folder = ASSETS / f"{name}.imageset"
    folder.mkdir(exist_ok=True)
    (folder / f"{name}.svg").write_text(result)
    manifest = {
        "images": [{"filename": f"{name}.svg", "idiom": "universal"}],
        "info": {"author": "xcode", "version": 1},
        "properties": {"preserves-vector-representation": True,
                       "template-rendering-intent": "template"},
    }
    (folder / "Contents.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{component} → {name}")


if __name__ == "__main__":
    for icon in ICONS:
        sync(*icon)
