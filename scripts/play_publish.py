#!/usr/bin/env python3
"""Google Play 스토어 등록정보·그래픽·AAB 를 androidpublisher API 로 밀어넣는다.

콘솔 폼을 손으로 치지 않기 위한 도구. 텍스트 정본은 `store/play/listing.ko-KR.json`,
그래픽은 `store/play/graphics/` 다. 여기 코드에는 문구를 적지 않는다 — 두 벌이 되면 반드시 갈라진다.

━━ 못 하는 것 (API 한계, 콘솔에서 한 번은 해야 함) ━━
  · **앱 생성 자체** — androidpublisher 에 create-app 엔드포인트가 없다. 콘솔에서 앱을 먼저 만들어야
    이 스크립트가 붙을 대상(packageName)이 생긴다.
  · 앱 콘텐츠 설문(데이터 보안·콘텐츠 등급·타겟층·앱 액세스 권한) — API 미제공. 전부 콘솔 수동.
  · 구독 상품 생성 — monetization.subscriptions API 가 있긴 하나 국가별 가격 설정이 콘솔이 훨씬 빠르다.
    한 번 만들고 마는 것이라 자동화 이득이 없어 일부러 뺐다.

━━ 사전 준비 (연준님이 직접 — 전부 계정 설정이라 대신 못 해드림) ━━
  1. Play Console 에서 앱 생성 (패키지명 com.y2do.itdasy)
  2. Play Console → 설정 → API 액세스 → Google Cloud 프로젝트 연결
  3. 서비스 계정 생성 → JSON 키 발급 (Google Cloud Console)
  4. Play Console → 사용자 및 권한 → 그 서비스 계정 초대 →
     권한: "앱 정보 보기"·"스토어 등록정보 관리"·"프로덕션 외 트랙 관리" (릴리스 권한은 필요할 때만)
  5. 발급받은 JSON 경로를 GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_FILE 로 지정
     (백엔드 IAP 검증이 쓰는 GOOGLE_PLAY_SERVICE_ACCOUNT_JSON 은 같은 JSON 의 base64 — 계정 하나로 겸용)
  ⚠️ 권한 부여 직후엔 전파에 몇 분 걸린다. 바로 403 이 나면 잠시 뒤 다시.

━━ 사용법 ━━
  export GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_FILE=~/itdasy-play-sa.json

  python3 scripts/play_publish.py check                 # 인증·권한만 확인 (아무것도 안 바꿈)
  python3 scripts/play_publish.py push --listing        # 드라이런: 뭐가 바뀔지 보여주기만
  python3 scripts/play_publish.py push --listing --commit
  python3 scripts/play_publish.py push --images --commit
  python3 scripts/play_publish.py push --aab app-release.aab --track internal --commit

🔒 **--commit 없으면 절대 반영되지 않는다.** 드라이런이 기본이고, 커밋 안 하면 edit 을 지운다.
   스토어 등록정보는 공개 콘텐츠라 실수로 나가면 되돌리는 데 심사가 붙는다.
"""
import argparse
import json
import os
import pathlib
import sys

PKG = os.getenv("GOOGLE_PLAY_PACKAGE_NAME", "com.y2do.itdasy")
ROOT = pathlib.Path(__file__).resolve().parent.parent
STORE = ROOT / "store" / "play"

# Play 콘솔이 강제하는 길이 한도. 넘으면 API 가 400 을 주는데 메시지가 불친절해서 여기서 먼저 잡는다.
LIMITS = {"title": 30, "shortDescription": 80, "fullDescription": 4000}

# imageType → (하위 폴더, 최소 장수, 최대 장수). Play 가 정한 이름이라 바꾸면 안 된다.
IMAGE_TYPES = {
    "icon": ("icon", 1, 1),
    "featureGraphic": ("feature", 1, 1),
    "phoneScreenshots": ("phone", 2, 8),
    "sevenInchScreenshots": ("tablet7", 0, 8),
    "tenInchScreenshots": ("tablet10", 0, 8),
}


def _fail(msg):
    print(f"❌ {msg}", file=sys.stderr)
    sys.exit(1)


def _service():
    key = os.getenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_FILE")
    if not key:
        _fail("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_FILE 이 없다. 위 '사전 준비' 참고.")
    key = pathlib.Path(key).expanduser()
    if not key.is_file():
        _fail(f"서비스 계정 JSON 이 없다: {key}")
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        _fail("의존성 없음 → pip3 install google-api-python-client google-auth")
    creds = service_account.Credentials.from_service_account_file(
        str(key), scopes=["https://www.googleapis.com/auth/androidpublisher"]
    )
    return build("androidpublisher", "v3", credentials=creds, cache_discovery=False)


def _load_listing():
    p = STORE / "listing.ko-KR.json"
    if not p.is_file():
        _fail(f"등록정보 정본이 없다: {p}")
    d = json.loads(p.read_text(encoding="utf-8"))
    over = [
        f"{k} {len(d.get(k, ''))}자 (한도 {n})"
        for k, n in LIMITS.items()
        if len(d.get(k, "")) > n
    ]
    if over:
        _fail("길이 한도 초과 — " + " · ".join(over))
    return d


def _images_on_disk():
    """store/play/graphics/<하위폴더>/*.png 를 imageType 별로 모은다."""
    found = {}
    for itype, (sub, lo, hi) in IMAGE_TYPES.items():
        d = STORE / "graphics" / sub
        files = sorted(d.glob("*.png")) + sorted(d.glob("*.jpg")) if d.is_dir() else []
        if len(files) < lo:
            _fail(f"{itype}: {len(files)}장 — 최소 {lo}장 필요 ({d})")
        if len(files) > hi:
            _fail(f"{itype}: {len(files)}장 — 최대 {hi}장 ({d})")
        if files:
            found[itype] = files
    return found


def cmd_check(args):
    svc = _service()
    print(f"패키지: {PKG}")
    try:
        edit = svc.edits().insert(packageName=PKG, body={}).execute()
    except Exception as e:
        _fail(f"edit 생성 실패 — 앱이 아직 콘솔에 없거나 서비스 계정 권한이 없다.\n   {e}")
    eid = edit["id"]
    try:
        cur = svc.edits().listings().list(packageName=PKG, editId=eid).execute()
        langs = [x["language"] for x in cur.get("listings", [])]
        print(f"✅ 인증·권한 OK. 현재 등록된 언어: {langs or '(없음)'}")
        for l in cur.get("listings", []):
            if l["language"] == "ko-KR":
                print(f"   현재 title: {l.get('title', '')!r}")
                print(f"   현재 short: {l.get('shortDescription', '')[:40]!r}...")
                print(f"   현재 full : {len(l.get('fullDescription', ''))}자")
        tracks = svc.edits().tracks().list(packageName=PKG, editId=eid).execute()
        print(f"   트랙: {[t['track'] for t in tracks.get('tracks', [])] or '(없음)'}")
    finally:
        svc.edits().delete(packageName=PKG, editId=eid).execute()
        print("   (확인용 edit 은 폐기함 — 아무것도 안 바뀜)")

    d = _load_listing()
    print("\n로컬 정본:")
    for k, n in LIMITS.items():
        print(f"   {k}: {len(d[k])}자 / {n}")
    try:
        imgs = _images_on_disk()
        print(f"   그래픽: { {k: len(v) for k, v in imgs.items()} or '(없음)'}")
    except SystemExit:
        print("   그래픽: 아직 준비 안 됨 (push --images 전에 채울 것)")


def cmd_push(args):
    if not (args.listing or args.images or args.aab):
        _fail("--listing / --images / --aab 중 하나는 줘야 한다.")

    listing = _load_listing() if args.listing else None
    images = _images_on_disk() if args.images else None
    aab = pathlib.Path(args.aab).expanduser() if args.aab else None
    if aab and not aab.is_file():
        _fail(f"AAB 가 없다: {aab}")

    if not args.commit:
        print("🔎 드라이런 (--commit 없으면 반영되지 않는다)\n")
        if listing:
            print(f"  등록정보 ko-KR → title={listing['title']!r} · "
                  f"short {len(listing['shortDescription'])}자 · full {len(listing['fullDescription'])}자")
        if images:
            for k, v in images.items():
                print(f"  이미지 {k}: 기존 전부 삭제 후 {len(v)}장 업로드")
                for f in v:
                    print(f"      {f.name}")
        if aab:
            print(f"  AAB {aab.name} → {args.track} 트랙 (status={args.status})")
        print("\n실제로 반영하려면 같은 명령에 --commit 을 붙인다.")
        return

    from googleapiclient.http import MediaFileUpload

    svc = _service()
    eid = svc.edits().insert(packageName=PKG, body={}).execute()["id"]
    print(f"edit {eid} 시작")
    try:
        if listing:
            body = {k: listing[k] for k in ("title", "shortDescription", "fullDescription")}
            if listing.get("video"):
                body["video"] = listing["video"]
            svc.edits().listings().update(
                packageName=PKG, editId=eid, language=listing["language"], body=body
            ).execute()
            print(f"  ✅ 등록정보 {listing['language']}")

        if images:
            for itype, files in images.items():
                # deleteall 을 먼저 해야 한다. upload 는 '추가'라 안 지우면 옛 스크린샷이 남아 섞인다.
                svc.edits().images().deleteall(
                    packageName=PKG, editId=eid, language="ko-KR", imageType=itype
                ).execute()
                for f in files:
                    svc.edits().images().upload(
                        packageName=PKG, editId=eid, language="ko-KR", imageType=itype,
                        media_body=MediaFileUpload(str(f), mimetype="image/png"),
                    ).execute()
                print(f"  ✅ {itype} {len(files)}장")

        if aab:
            up = svc.edits().bundles().upload(
                packageName=PKG, editId=eid,
                media_body=MediaFileUpload(str(aab), mimetype="application/octet-stream",
                                           resumable=True),
            ).execute()
            vc = up["versionCode"]
            svc.edits().tracks().update(
                packageName=PKG, editId=eid, track=args.track,
                body={"releases": [{"versionCodes": [str(vc)], "status": args.status}]},
            ).execute()
            print(f"  ✅ AAB versionCode={vc} → {args.track} ({args.status})")

        svc.edits().commit(packageName=PKG, editId=eid).execute()
        print("🚀 커밋 완료 — Play Console 에서 확인")
    except Exception:
        # 커밋 전에 터졌으면 edit 을 지운다. 안 지우면 열린 edit 이 쌓여 다음 실행이 충돌한다.
        try:
            svc.edits().delete(packageName=PKG, editId=eid).execute()
            print("edit 롤백함 (반영된 것 없음)", file=sys.stderr)
        except Exception:
            pass
        raise


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("check", help="인증·권한·정본 상태만 확인 (아무것도 안 바꿈)")

    p = sub.add_parser("push", help="등록정보·이미지·AAB 반영")
    p.add_argument("--listing", action="store_true", help="store/play/listing.ko-KR.json 반영")
    p.add_argument("--images", action="store_true", help="store/play/graphics/ 반영")
    p.add_argument("--aab", help="업로드할 .aab 경로")
    p.add_argument("--track", default="internal",
                   choices=["internal", "alpha", "beta", "production"])
    p.add_argument("--status", default="draft",
                   choices=["draft", "completed", "inProgress", "halted"])
    p.add_argument("--commit", action="store_true",
                   help="실제 반영. 없으면 드라이런.")

    args = ap.parse_args()
    {"check": cmd_check, "push": cmd_push}[args.cmd](args)


if __name__ == "__main__":
    main()
