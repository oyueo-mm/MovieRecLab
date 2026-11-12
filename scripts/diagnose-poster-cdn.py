#!/usr/bin/env python3
"""One-shot production image health diagnostic. Reads up to 1 KiB per candidate; never stores images."""
import concurrent.futures
import csv
import io
import json
import pathlib
import re
import time
import urllib.error
import urllib.request
from collections import Counter

BASE="https://raw.githubusercontent.com/smanihwr/ml-latest-small/ba3cd91761e54faa64483456b619d1a1f4d70971/"
MAP=pathlib.Path("showcase/poster-map.js")
PICKS=["Forrest Gump","Star Wars: Episode V","Logan (2017)","Edge of Tomorrow","Avengers: Infinity War","The Blind Side","Easy A","Singin' in the Rain","Man Bites Dog","Un Chien Andalou","The Green Mile","Shawshank Redemption","Interstellar","Harry Potter and the Order","Butch Cassidy and"]
def fetch(url,timeout=16):
    request=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36","Accept":"image/avif,image/webp,image/apng,image/*,*/*;q=0.8","Range":"bytes=0-1023"})
    start=time.monotonic()
    try:
        with urllib.request.urlopen(request,timeout=timeout) as response:
            data=response.read(1024)
            return str(response.status),response.headers.get("Content-Type",""),len(data),round(time.monotonic()-start,2)
    except urllib.error.HTTPError as e: return str(e.code),e.headers.get("Content-Type",""),0,round(time.monotonic()-start,2)
    except Exception as e: return type(e).__name__+":"+str(e)[:42],"",0,round(time.monotonic()-start,2)
def main():
    contents=MAP.read_text()
    poster_map=json.loads(contents[contents.index("{"):contents.rindex("}")+1])
    req=urllib.request.Request(BASE+"movies.csv",headers={"User-Agent":"MovieRecLab diagnostic"})
    with urllib.request.urlopen(req,timeout=30) as r:movies=list(csv.DictReader(io.StringIO(r.read().decode("utf-8-sig"))))
    req=urllib.request.Request(BASE+"links.csv",headers={"User-Agent":"MovieRecLab diagnostic"})
    with urllib.request.urlopen(req,timeout=30) as r:links={x["movieId"]:x for x in csv.DictReader(io.StringIO(r.read().decode("utf-8-sig")))}
    selected={}
    for label in PICKS:
        for movie in movies:
            if label.casefold() in movie["title"].casefold() and movie["movieId"] in poster_map:
                selected[label]=movie;break
    selected["random 20"]=None
    ids=list(poster_map)
    selected.update({"random-"+str(i):{"movieId":ids[(i*431+93)%len(ids)],"title":"sample "+str(i)} for i in range(20)})
    checks=[]
    for label,m in selected.items():
        if m is None:continue
        id=m["movieId"];path=poster_map.get(id)
        if not path:continue
        checks.append((label,id,m["title"],"TMDb w342","https://image.tmdb.org/t/p/w342"+path))
        if label in ["Forrest Gump","Logan (2017)","Avengers: Infinity War"]:
            checks.append((label,id,m["title"],"TMDb w500","https://image.tmdb.org/t/p/w500"+path))
            imdb=links.get(id,{}).get("imdbId")
            if imdb: checks.append((label,id,m["title"],"MetaHub medium","https://images.metahub.space/poster/medium/tt"+imdb.zfill(7)+"/img"))
    print("PROBE_COUNT",len(checks),"catalog",len(poster_map),flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        vals=list(pool.map(lambda e:fetch(e[-1]),checks))
    summary=Counter()
    for (label,id,title,origin,url),(status,mime,bytes_,seconds) in zip(checks,vals):
        summary[(origin,status)]+=1
        print("PROBE",label,"id",id,repr(title),"via",origin,"status",status,"type",mime,"bytes",bytes_,"s",seconds,flush=True)
    print("SUMMARY",json.dumps([{"source":a,"status":b,"count":n} for (a,b),n in sorted(summary.items())]),flush=True)
if __name__=="__main__":main()
