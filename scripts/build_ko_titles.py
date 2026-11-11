#!/usr/bin/env python3
"""Rebuild the static Korean movie ID map from exact original-title/year matches."""
import csv
import io
import json
import re
import sys
import time
import urllib.parse
from urllib.error import HTTPError
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOVIELENS = "https://raw.githubusercontent.com/smanihwr/ml-latest-small/ba3cd91761e54faa64483456b619d1a1f4d70971/movies.csv"
KMRD = "https://raw.githubusercontent.com/lovit/kmrd/8ca98b12bbd46a53f8ee89c678e7a0c050e190cf/kmr_dataset/datafile/"
MOVIELENS_LINKS = "https://raw.githubusercontent.com/smanihwr/ml-latest-small/ba3cd91761e54faa64483456b619d1a1f4d70971/links.csv"

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


def fetch_wikidata_labels(pending):
    """Use public Wikidata TMDb IDs (P4947) and Korean item labels; optional best-effort source."""
    candidate = defaultdict(set)
    for row in csv.DictReader(io.StringIO(fetch(MOVIELENS_LINKS).decode("utf-8-sig"))):
        movie_id = (row.get("movieId") or "").strip()
        tmdb_id = (row.get("tmdbId") or "").strip()
        if movie_id in pending and tmdb_id.isdigit():
            candidate[tmdb_id].add(movie_id)
    ids = sorted(candidate, key=int)
    labels = defaultdict(set)
    print(f"Wikidata candidates with TMDb IDs: {len(ids)}", flush=True)
    for start in range(0, len(ids), 65):
        batch = ids[start:start + 65]
        values = " ".join('"' + x + '"' for x in batch)
        query = 'PREFIX wdt: <http://www.wikidata.org/prop/direct/>\nPREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\nSELECT ?tmdb ?ko WHERE { VALUES ?tmdb { ' + values + ' } ?item wdt:P4947 ?tmdb; rdfs:label ?ko. FILTER(LANG(?ko) = "ko") }'
        url = "https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(query)
        result = None
        for attempt in range(3):
            try:
                request = urllib.request.Request(url, headers={"Accept": "application/sparql-results+json", "User-Agent": "MovieRecLab/1.0 (academic Korean movie metadata; https://github.com/oyueo-mm/MovieRecLab)"})
                with urllib.request.urlopen(request, timeout=45) as response:
                    result = json.load(response)
                break
            except HTTPError as error:
                if error.code not in (429, 502, 503, 504) or attempt == 2:
                    print(f"Wikidata batch {start}: HTTP {error.code}, skipped", flush=True)
                    break
                wait = min(25, int(error.headers.get("Retry-After") or 4) + 2 * attempt)
                time.sleep(wait)
            except (OSError, ValueError) as error:
                print(f"Wikidata batch {start} unavailable: {error}", flush=True)
                break
        if result:
            for binding in result.get("results", {}).get("bindings", []):
                tmdb = binding.get("tmdb", {}).get("value", "")
                label = binding.get("ko", {}).get("value", "").strip()
                if tmdb in candidate and 1 <= len(label) <= 90 and re.search("[가-힣]", label):
                    labels[tmdb].add(label)
        time.sleep(0.35)
        if start and start % 650 == 0:
            print(f"Wikidata progress {min(start + 65, len(ids))}/{len(ids)}", flush=True)
    translated = {}
    for tmdb, names in labels.items():
        if len(names) == 1:
            for movie_id in candidate[tmdb]:
                translated[movie_id] = next(iter(names))
    print(f"Wikidata unambiguous Korean labels: {len(translated)}", flush=True)
    return translated

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
    wikipedia = {}
    if not use_small and "--no-wikidata" not in sys.argv:
        try:
            wikipedia = fetch_wikidata_labels(set(
                row["movieId"] for row in csv.DictReader(io.StringIO(fetch(MOVIELENS).decode("utf-8-sig")))
                if row["movieId"] not in built and row["movieId"] not in old
            ))
        except Exception as error:
            print(f"Wikidata source unavailable, using KMRD only: {error}", flush=True)
    merged = {**wikipedia, **built, **old}
    ordered = dict(sorted(merged.items(), key=lambda x: int(x[0])))
    content = "globalThis.MovieRecKoreanTitles=" + json.dumps(ordered, ensure_ascii=False, separators=(",", ":")) + ";\n"
    file.write_text(content, encoding="utf-8")
    print(f"KMRD {'small' if use_small else 'full'}: exact matches {len(built)}; Wikidata additional {len(wikipedia)}; merged total {len(ordered)}; missed {9742-len(ordered)}")

if __name__ == "__main__":
    main()
