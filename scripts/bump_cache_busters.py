#!/usr/bin/env python3
"""배포 시 모든 ?v= 캐시 버스터를 빌드 버전 하나로 통일한다. (2026-07-23)

왜 만들었나
-----------
`?v=` 를 사람이 손으로 올리는 규칙이었는데, **반드시 빠뜨린다.**
특히 치명적인 건 `index.html` 의 `js/load-groups.js?v=` 다. 이걸 안 올리면
브라우저가 옛 load-groups.js 를 그대로 쓰고, 그 안에 적힌 **옛 ?v= 로 파일을 불러온다** —
즉 load-groups 안의 버전을 아무리 올려도 통째로 무효가 된다.

2026-07-23 실측: caption-text.js 를 고치고 load-groups 의 ?v= 도 올렸는데 화면이 그대로였다.
로드된 script 태그가 `caption-text.js?v=20260714-fix-batch1`(9일 전)이었다.
그래서 "고쳤는데 안 보인다" 가 반복됐다.

무엇을 하나
-----------
`index.html` 과 `js/load-groups.js` 안에서 **이미 ?v= 가 붙어 있는 로컬 js/css** 를 찾아
전부 같은 값으로 바꾼다. CI 산출물만 바뀌고 레포 파일은 커밋하지 않는다(배포 워크플로 안에서만 실행).

일부러 안 하는 것
-----------------
- `//` 가 들어간 절대 URL(외부 CDN)은 건드리지 않는다.
- `style.css` 의 `@import` 는 TARGETS 밖이라 **자동 갱신되지 않는다** — 손으로 올려야 한다.

⚠️ 옛 설명 정정 (2026-09-12)
---------------------------
이 자리에 원래 "`?v=` 가 없는 항목엔 새로 붙이지 않는다 · 새 파일은 사람이 한 번 손으로
붙여야 한다" 고 적혀 있었다. **2026-08-02 (c32683d) 에 아래 NO_VER 가 추가되면서 그건
거짓이 됐는데 설명만 그대로 남아** 자기 코드와 정면으로 모순됐다. 실제로 그 문장을 믿고
"이 파일들은 영영 캐시버스팅이 안 된다" 고 오진하는 일이 있었다(2026-09-12).
지금은 `?v=` 가 없는 로컬 js/css 에도 **자동으로 붙인다.**

로컬에서 확인:  python3 scripts/bump_cache_busters.py test-1234
"""
from __future__ import annotations

import io
import re
import sys

TARGETS = ("index.html", "js/load-groups.js")

# 따옴표 안의 (상대경로) *.js / *.css 뒤에 붙은 ?v=... 만 교체.
#   앞의 [\"'] 로 시작을 고정 → 주석·본문 텍스트를 잘못 건드리지 않는다.
#   경로에 `//` 가 있으면(=절대 URL) [\w./-]+ 가 `:` 를 못 먹어 자연히 제외된다.
PATTERN = re.compile(r"""(?P<q>["'])(?P<path>(?:\.{0,2}/)?[\w./-]+\.(?:js|css))\?v=[^"'?&]*""")

# [출시감사 2026-08-02] **?v= 가 아직 안 붙은 로컬 js/css 에도 자동으로 붙인다.**
#   예전엔 '이미 붙어 있는 것만' 갱신했다. 그래서 새 파일은 사람이 한 번 손으로 붙여야 했고,
#   실측 결과 index.html 27개 · load-groups.js 7개, **총 34개가 버스터 없이** 로드되고 있었다.
#   (사람이 기억해야 하는 절차는 반드시 빠진다 — 실제로 빠져 있었다.)
#
#   안전장치 — 아래는 절대 건드리지 않는다:
#     · 절대 URL(http/https//, //cdn…)  → 경로 문자셋에 ':' 가 없어 자연히 제외되지만 명시적으로도 막는다
#     · 이미 쿼리스트링이 붙은 것(?foo=)  → 뒤에 ?v= 를 또 붙이면 깨진다
#     · srcset/integrity 등 값이 아닌 위치 → 따옴표 시작 고정으로 회피
NO_VER = re.compile(
    r"""(?P<q>["'])(?P<path>(?!https?:)(?!//)(?:\.{0,2}/)?[\w./-]+\.(?:js|css))(?P<end>["'])"""
)


def bump(version: str) -> int:
    total = 0
    for path in TARGETS:
        try:
            src = io.open(path, encoding="utf-8").read()
        except FileNotFoundError:
            print(f"  skip {path} (없음)")
            continue
        new_src, n = PATTERN.subn(
            lambda m: f"{m.group('q')}{m.group('path')}?v={version}", src
        )
        # 아직 ?v= 가 없는 로컬 js/css 에 새로 부여 (신규 파일 자동 커버)
        new_src, added = NO_VER.subn(
            lambda m: f"{m.group('q')}{m.group('path')}?v={version}{m.group('end')}", new_src
        )
        if n or added:
            io.open(path, "w", encoding="utf-8").write(new_src)
        print(f"  {path}: 갱신 {n}건 · 신규부여 {added}건")
        total += n + added
    return total


def main() -> int:
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print("사용법: bump_cache_busters.py <버전>", file=sys.stderr)
        return 2
    version = sys.argv[1].strip()
    print(f"🔄 ?v= 일괄 갱신 → {version}")
    total = bump(version)
    print(f"총 {total}건")
    if total == 0:
        # 패턴이 깨졌는데 조용히 통과하면 '캐시 안 도는 배포'가 나간다 — 그건 이 스크립트가
        # 막으려던 바로 그 사고다. 배포를 세운다.
        print("❌ ?v= 를 하나도 못 바꿨다 — 정규식이나 파일 구조가 바뀌었다", file=sys.stderr)
        return 1
    # load-groups 자신의 버전이 안 바뀌면 나머지 갱신이 전부 무효 → 반드시 확인한다.
    idx = io.open("index.html", encoding="utf-8").read()
    if f"js/load-groups.js?v={version}" not in idx:
        print("❌ index.html 의 js/load-groups.js?v= 가 안 바뀌었다 — 이게 안 되면 나머지도 무효",
              file=sys.stderr)
        return 1
    print("✅ load-groups.js 자체 버전까지 확인")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
