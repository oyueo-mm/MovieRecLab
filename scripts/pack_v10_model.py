#!/usr/bin/env python3
"""Lossless compact packing of public, aggregate item-to-item coefficients (no training user data)."""
import base64
import json
import pathlib
import struct

SRC=pathlib.Path("showcase/v10-model.js")
def main():
    raw=SRC.read_text(encoding="utf-8")
    marker="window.MovieRecV10Data="
    if marker not in raw:raise RuntimeError("V10 model marker missing")
    data=json.loads(raw.split(marker,1)[1].rsplit(";",1)[0])
    model=data.get("model")
    if not model or model.get("type")!="itemknn" or "packed" in model:
        print("No unpacked ItemKNN graph to pack")
        return
    rows=model["rows"]
    movieids=[row[0] for row in rows]
    assert len(movieids)>8000 and len(set(movieids))==len(movieids)
    width=max(len(row[1]) for row in rows)
    assert 1<=width<=100
    index={mid:i for i,mid in enumerate(movieids)}
    output=bytearray(len(rows)*width*4)
    for i,(_,neighbors) in enumerate(rows):
        for j in range(width):
            if j<len(neighbors):
                mid,weight=neighbors[j]
                k=index.get(mid,65535)
                if k==65535:raise RuntimeError("Unknown neighbor movie ID")
                w=int(weight)
                if not 0<=w<=65535:raise RuntimeError("Out-of-range quantized similarity")
            else:
                k,w=65535,0
            struct.pack_into("<HH",output,(i*width+j)*4,k,w)
    # Round-trip each movie pair with no precision loss, preserving previous browser rankings.
    for i,(_,neighbors) in enumerate(rows):
        restored=[]
        for j in range(width):
            idx,w=struct.unpack_from("<HH",output,(i*width+j)*4)
            if idx!=65535:restored.append([movieids[idx],w])
        assert restored==neighbors,("packing mismatch",i)
    model.pop("rows")
    model.update({"ids":movieids,"width":width,"packed":base64.b64encode(output).decode("ascii")})
    out="/* V10 derived movie-to-movie weights packed losslessly (16-bit IDs + 16-bit scores), no user data. */\nwindow.MovieRecV10Data="+json.dumps(data,separators=(",",":"),ensure_ascii=False)+";\n"
    SRC.write_text(out,encoding="utf-8")
    print("PACKED",len(rows),"movies",width,"maximum neighbors",len(raw.encode("utf-8")),"->",len(out.encode("utf-8")),"bytes")
    assert len(out.encode("utf-8"))<5*1024*1024,"packed artifact should be under 5 MiB"
if __name__=="__main__":main()
