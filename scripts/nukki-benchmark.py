#!/usr/bin/env python3
"""누끼(배경 제거) 경로별 속도·성공률·원가·결과물 비교.

같은 사진 묶음을 아래 경로에 똑같이 보내서 비교한다. 키가 없는 경로는 건너뛴다.

  replicate-rembg    Replicate cjwbw/rembg                 (현재 1순위)      REPLICATE_API_TOKEN
  replicate-851      Replicate 851-labs/background-remover (더 싼 후보)      REPLICATE_API_TOKEN
  fal-birefnet       fal BiRefNet v2                       (현재 2순위)      FAL_KEY
  server             우리 서버 POST /image/remove-bg        (실제 앱 경로)    ITDASY_API + ITDASY_TEST_EMAIL + ITDASY_TEST_PASSWORD

쓰는 법
  python3 scripts/nukki-benchmark.py --images <사진폴더> --runs 3 --out /tmp/nukki-bench
  → 표준출력에 경로별 요약 표, --out 에 결과 PNG 와 비교용 index.html(체크무늬 배경).

주의
  - 실제 손님 사진을 넣지 말 것. 외부 업체로 전송된다. 합성·동의받은 샘플만.
  - 서버 경로는 원장 쿼터를 쓴다(테스트 계정으로). 운영 서버에 돌리지 말고 테스트 서버에.
  - 원가: Replicate 는 응답의 predict_time × 하드웨어 초당 단가, 모르면 공개 1회 단가로 추정.
    fal 은 초당 $0.0008 × 추론 시간. 표의 "원/장" 은 추정치이지 청구서가 아니다.
"""
from __future__ import annotations

import argparse
import base64
import html
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

USD_KRW = float(os.environ.get("USD_KRW", "1380"))
# 공개 1회 단가(2026-09-30 확인) — predict_time 을 못 받을 때만 쓴다
PUBLIC_PER_RUN_USD = {"replicate-rembg": 0.0036, "replicate-851": 0.00041}
FAL_PER_SEC_USD = 0.0008
T4_PER_SEC_USD = 0.000225  # Replicate T4 GPU 초당(공개 요금)


def _req(url, *, data=None, headers=None, method=None, timeout=60):
    body = json.dumps(data).encode() if isinstance(data, (dict, list)) else data
    r = urllib.request.Request(url, data=body, headers=headers or {}, method=method or ("POST" if body else "GET"))
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return resp.status, resp.read(), dict(resp.headers)


def _data_uri(p: Path) -> str:
    mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()


def run_replicate(model: str, img: Path):
    tok = os.environ["REPLICATE_API_TOKEN"]
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json", "Prefer": "wait=30"}
    t0 = time.monotonic()
    _, raw, _ = _req(f"https://api.replicate.com/v1/models/{model}/predictions",
                     data={"input": {"image": _data_uri(img)}}, headers=h, timeout=60)
    pred = json.loads(raw)
    while pred.get("status") not in ("succeeded", "failed", "canceled"):
        time.sleep(1)
        _, raw, _ = _req(pred["urls"]["get"], headers={"Authorization": f"Bearer {tok}"})
        pred = json.loads(raw)
    if pred["status"] != "succeeded":
        raise RuntimeError(f"replicate {pred['status']}: {str(pred.get('error'))[:120]}")
    out = pred["output"]
    url = out[0] if isinstance(out, list) else (out.get("image") if isinstance(out, dict) else out)
    _, png, _ = _req(url, timeout=60)
    wall = time.monotonic() - t0
    pt = (pred.get("metrics") or {}).get("predict_time")
    return png, wall, pt


def run_fal(img: Path):
    h = {"Authorization": f"Key {os.environ['FAL_KEY']}", "Content-Type": "application/json"}
    t0 = time.monotonic()
    _, raw, _ = _req("https://fal.run/fal-ai/birefnet/v2",
                     data={"image_url": _data_uri(img), "output_format": "png"}, headers=h, timeout=60)
    out = json.loads(raw)
    _, png, _ = _req(out["image"]["url"], timeout=60)
    wall = time.monotonic() - t0
    inf = (out.get("timings") or {}).get("inference")
    return png, wall, inf


_TOKEN = None


def run_server(img: Path):
    global _TOKEN
    api = os.environ["ITDASY_API"].rstrip("/")
    if _TOKEN is None:
        _, raw, _ = _req(f"{api}/auth/login", data={"email": os.environ["ITDASY_TEST_EMAIL"],
                                                    "password": os.environ["ITDASY_TEST_PASSWORD"]},
                         headers={"Content-Type": "application/json"})
        _TOKEN = json.loads(raw)["access_token"]
    boundary = "----nukkibench"
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{img.name}\"\r\n"
            f"Content-Type: image/jpeg\r\n\r\n").encode() + img.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    t0 = time.monotonic()
    _, png, hdr = _req(f"{api}/image/remove-bg", data=body, timeout=90,
                       headers={"Authorization": f"Bearer {_TOKEN}",
                                "Content-Type": f"multipart/form-data; boundary={boundary}"})
    return png, time.monotonic() - t0, hdr.get("X-Cache")


def cost_krw(name, wall, extra):
    if name == "fal-birefnet":
        sec = extra if isinstance(extra, (int, float)) else wall
        return sec * FAL_PER_SEC_USD * USD_KRW
    if name.startswith("replicate"):
        if isinstance(extra, (int, float)):
            return extra * T4_PER_SEC_USD * USD_KRW
        return PUBLIC_PER_RUN_USD[name] * USD_KRW
    return None  # 서버 경로는 어느 업체를 탔는지에 따라 다르다 — 서버 로그로 본다


PROVIDERS = {
    "replicate-rembg": (lambda p: run_replicate("cjwbw/rembg", p), ["REPLICATE_API_TOKEN"]),
    "replicate-851": (lambda p: run_replicate("851-labs/background-remover", p), ["REPLICATE_API_TOKEN"]),
    "fal-birefnet": (run_fal, ["FAL_KEY"]),
    "server": (run_server, ["ITDASY_API", "ITDASY_TEST_EMAIL", "ITDASY_TEST_PASSWORD"]),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", required=True)
    ap.add_argument("--runs", type=int, default=3, help="사진마다 몇 번 보낼지(속도 분포용)")
    ap.add_argument("--out", default="nukki-bench-out")
    ap.add_argument("--only", default="", help="쉼표로 경로 제한 (예: fal-birefnet,replicate-851)")
    a = ap.parse_args()

    imgs = sorted(p for p in Path(a.images).iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"))
    if not imgs:
        sys.exit("사진이 없다")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    only = {s.strip() for s in a.only.split(",") if s.strip()}

    results = {}
    for name, (fn, envs) in PROVIDERS.items():
        if only and name not in only:
            continue
        missing = [e for e in envs if not os.environ.get(e)]
        if missing:
            print(f"[건너뜀] {name}: {', '.join(missing)} 없음")
            continue
        rows = []
        for img in imgs:
            for i in range(a.runs):
                try:
                    png, wall, extra = fn(img)
                    if i == 0:
                        (out / f"{img.stem}__{name}.png").write_bytes(png)
                    rows.append({"img": img.name, "ok": True, "wall": wall, "extra": extra,
                                 "krw": cost_krw(name, wall, extra)})
                    print(f"{name:16} {img.name:28} {wall:6.2f}s ok")
                except (urllib.error.URLError, RuntimeError, KeyError, ValueError) as e:
                    rows.append({"img": img.name, "ok": False, "err": f"{type(e).__name__}: {str(e)[:100]}"})
                    print(f"{name:16} {img.name:28}  실패 {type(e).__name__}: {str(e)[:80]}")
        results[name] = rows

    print("\n경로              성공률   p50(초)  p95(초)  원/장(추정)")
    for name, rows in results.items():
        ok = [r for r in rows if r["ok"]]
        walls = sorted(r["wall"] for r in ok)
        p50 = statistics.median(walls) if walls else float("nan")
        p95 = walls[min(len(walls) - 1, int(len(walls) * 0.95))] if walls else float("nan")
        costs = [r["krw"] for r in ok if r["krw"] is not None]
        c = f"{statistics.mean(costs):.1f}" if costs else "-"
        print(f"{name:16} {len(ok):3}/{len(rows):<3}  {p50:7.2f}  {p95:7.2f}  {c:>8}")

    (out / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=1))
    cells = "".join(
        "<tr><th>" + html.escape(img.name) + "</th><td><img src='" + html.escape(img.name) + "'></td>"
        + "".join(f"<td><img src='{html.escape(img.stem)}__{n}.png'><br>{n}</td>" for n in results)
        + "</tr>" for img in imgs)
    for img in imgs:
        (out / img.name).write_bytes(img.read_bytes())
    (out / "index.html").write_text(
        "<!doctype html><meta charset=utf-8><title>누끼 비교</title><style>"
        "td{padding:6px;text-align:center;font:12px sans-serif}img{max-width:260px;"
        "background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px}</style>"
        f"<table>{cells}</table>")
    print(f"\n결과물: {out}/index.html")


if __name__ == "__main__":
    main()
