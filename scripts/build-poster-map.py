#!/usr/bin/env python3
"""Build IMDb/TMDb-validated poster paths for MovieLens latest-small; no image files copied."""
import csv
import io
import json
import pathlib
import re
import urllib.request

MOVIELENS = "https://raw.githubusercontent.com/smanihwr/ml-latest-small/ba3cd91761e54faa64483456b619d1a1f4d70971/links.csv"
METADATA = "https://raw.githubusercontent.com/sachinmasti/movie-data-cleaning/8be8af3197fdfbfeca1c25eee76f3e6c8973c701/movies_metadata.csv"
POSTER = re.compile(r"^/[A-Za-z0-9_-]{15,100}\\.(?:jpg|jpeg|png|webp)$", re.I)

def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "MovieRecLab-poster-path-builder/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        data = response.read()
    print("Fetched", len(data), "bytes from", url.split("/")[2])
    return data.decode("utf-8-sig", errors="replace")

def number(value):
    value = str(value or "").strip()
    if value.startswith("tt"):
        value = value[2:]
    if not value.isdigit():
        return None
    return int(value)

def main():
    links = {}
    for row in csv.DictReader(io.StringIO(download(MOVIELENS))):
        mid, tmdb, imdb = number(row.get("movieId")), number(row.get("tmdbId")), number(row.get("imdbId"))
        if None not in (mid, tmdb, imdb):
            links.setdefault((tmdb, imdb), []).append(mid)
    print("MovieLens films with both IDs:", sum(len(v) for v in links.values()))
    raw = download(METADATA)
    csv.field_size_limit(20_000_000)
    mapped, duplicates, candidates = {}, 0, 0
    for row in csv.DictReader(io.StringIO(raw)):
        tmdb, imdb = number(row.get("id")), number(row.get("imdb_id"))
        if tmdb is None or imdb is None:
            continue
        mids = links.get((tmdb, imdb))
        if not mids:
            continue
        path = (row.get("poster_path") or "").strip()
        if not POSTER.fullmatch(path):
            continue
        candidates += 1
        for mid in mids:
            if mid in mapped and mapped[mid] != path:
                duplicates += 1
                continue
            mapped[mid] = path
    if len(mapped) < 2500:
        raise RuntimeError("Poster map coverage unexpectedly low: "+str(len(mapped)))
    output = {str(k): mapped[k] for k in sorted(mapped)}
    target = pathlib.Path("showcase/poster-map.js")
    target.parent.mkdir(exist_ok=True)
    target.write_text("/* Generated from MovieLens IDs and TMDb poster metadata; paths only, no poster assets. */\\nwindow.MovieRecPosterPaths="+json.dumps(output, ensure_ascii=False, separators=(",",":"))+";\\n", encoding="utf-8")
    print("Matched poster paths:", len(mapped), "candidate rows:", candidates, "conflicting paths:", duplicates, "bytes:", target.stat().st_size)

if __name__ == "__main__":
    main()
