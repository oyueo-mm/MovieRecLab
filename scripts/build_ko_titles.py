#!/usr/bin/env python3
"""Rebuild the static Korean movie ID map from exact original-title/year matches."""
import csv
import io
import json
import re
import sys
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOVIELENS = "https://raw.githubusercontent.com/smanihwr/ml-latest-small/ba3cd91761e54faa64483456b619d1a1f4d70971/movies.csv"
KMRD = "https://raw.githubusercontent.com/lovit/kmrd/8ca98b12bbd46a53f8ee89c678e7a0c050e190cf/kmr_dataset/datafile/"

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "MovieRecLab-KoreanTitleBuilder/1.0 (educational research)"})
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read()

def normalize(value):
    value = str(value or "").strip()
    article = re.match(r"^(.*), (The|An|A)$", value, re.I)
    if article:
        value = article.group(2) + " " + article.group(1)
    return re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKC", value).lower())

def source_titles(raw):
    result = defaultdict(set)
    for row in csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), delimiter="\t"):
        korean, english = (row.get("title") or "").strip(), (row.get("title_eng") or "").strip()
        if not re.search("[가-힣]", korean):
            continue
        found = re.match(r"^(.*)\s*,\s*(\d{4})\s*$", english)
        if found:
            result[(normalize(found.group(1)), found.group(2))].add(korean)
    return result

def build(ml_bytes, kmrd_bytes):
    known = source_titles(kmrd_bytes)
    result = {}
    for row in csv.DictReader(io.StringIO(ml_bytes.decode("utf-8-sig"))):
        found = re.match(r"^(.*)\s*\((\d{4})\)\s*$", row["title"])
        if not found:
            continue
        values = known.get((normalize(found.group(1)), found.group(2)), ())
        if len(values) == 1:
            result[str(int(row["movieId"]))] = next(iter(values))
    return result

def main():
    use_small = "--small" in sys.argv
    if use_small:
        kmrd_bytes = fetch(KMRD + "kmrd-small/movies.txt")
    else:
        archive = fetch(KMRD + "kmrd/meta.zip")
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            name = next((x for x in bundle.namelist() if x.endswith("movies.txt")), None)
            if not name:
                raise ValueError("meta.zip does not contain movies.txt")
            kmrd_bytes = bundle.read(name)
    built = build(fetch(MOVIELENS), kmrd_bytes)
    file = ROOT / "ko-titles.js"
    try:
        old = json.loads(file.read_text(encoding="utf-8").split("=", 1)[1].strip().removesuffix(";"))
    except (OSError, ValueError, IndexError):
        old = {}
    if len(built) < 300:
        raise ValueError(f"Unexpected low match count: {len(built)}")
    merged = {**built, **old}
    ordered = dict(sorted(merged.items(), key=lambda x: int(x[0])))
    content = "globalThis.MovieRecKoreanTitles=" + json.dumps(ordered, ensure_ascii=False, separators=(",", ":")) + ";\n"
    file.write_text(content, encoding="utf-8")
    print(f"KMRD {'small' if use_small else 'full'}: exact matches {len(built)}; merged total {len(ordered)}; missed {9742-len(ordered)}")

if __name__ == "__main__":
    main()
