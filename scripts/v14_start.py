#!/usr/bin/env python3
"""Fetch exact approved aggregate serving bundle and official input inside host only."""
import os,pathlib,subprocess,sys,hashlib
import v14_common as c
from v14_serve import ARCHIVE_SHA
root=pathlib.Path(os.environ.get("V14_INPUT_DIR","/tmp/v14-input"))
root.mkdir(parents=True,exist_ok=True)
if not pathlib.Path("v14-models/manifest.json").is_file():
    run=os.environ.get("V14_ARTIFACT_RUN_ID")
    if not run or not os.environ.get("GH_TOKEN"):raise RuntimeError("V14_ARTIFACT_RUN_ID and GH_TOKEN are required to retrieve verified derived weights")
    subprocess.run(["gh","run","download",run,"--repo","oyueo-mm/MovieRecLab","--name","v14-serving-bundle","--dir","."],check=True)
p=root/"ml-25m.zip"
if not p.is_file():c.download_archive(str(p))
with p.open("rb") as f:
    if hashlib.file_digest(f,"sha256").hexdigest()!=ARCHIVE_SHA:raise RuntimeError("Official archive checksum mismatch")
small=root/"small";small.mkdir(exist_ok=True)
for name in ("movies.csv","ratings.csv","tags.csv","links.csv"):
    target=small/name
    if not target.is_file():target.write_bytes(c.small_source(name))
os.environ.update(V14_DATASET=str(p),V14_SMALL_DIR=str(small))
# Avoid retaining a GitHub credential in the inference process environment.
os.environ.pop("GH_TOKEN",None)
os.execv(sys.executable,[sys.executable,"-u","scripts/v14_serve.py"])
