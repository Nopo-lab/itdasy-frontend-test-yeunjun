#!/usr/bin/env python3
"""
border-radius 비표준 px 값 → 토큰 값 일괄 변환
Usage:
  python3 scripts/radius-cleanup.sh --dry-run
  python3 scripts/radius-cleanup.sh --apply
"""
import re
import sys
import os
from pathlib import Path

# ── 매핑 ──────────────────────────────────────────────────
def map_px(n: int):
    if   2   <= n <= 7:              return 8
    elif 9   <= n <= 13:             return 14
    elif 15  <= n <= 24 and n != 20: return 20
    elif 25  <= n <= 32 and n != 28: return 28
    elif n   >= 100     and n != 999:return 999
    return None  # 이미 토큰값이거나 변환 범위 외 (0,1,8,14,20,28,33-99,999)

# 'border-radius:' 뒤에 오는 정수+px 를 모두 치환
PATTERN = re.compile(r'(border-radius:\s*)(\d+)(px)', re.IGNORECASE)

def transform_line(line: str) -> tuple[str, list[str]]:
    changes = []
    def replacer(m):
        n = int(m.group(2))
        t = map_px(n)
        if t is None:
            return m.group(0)
        changes.append(f"{n}px → {t}px")
        return f"{m.group(1)}{t}{m.group(3)}"
    new_line = PATTERN.sub(replacer, line)
    return new_line, changes

# ── 파일 수집 ───────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
EXCLUDE_DIRS  = {"node_modules", ".git", "android", "ios"}
EXCLUDE_FILES = {"tokens.css"}
EXTS = {".css", ".js", ".html"}

def collect_files():
    result = []
    for root, dirs, files in os.walk(REPO_ROOT):
        dirs[:] = [d for d in sorted(dirs) if d not in EXCLUDE_DIRS]
        for f in sorted(files):
            p = Path(root) / f
            if p.suffix in EXTS and p.name not in EXCLUDE_FILES:
                result.append(p)
    return result

# ── 메인 ───────────────────────────────────────────────────
def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("--dry-run", "--apply"):
        print("Usage: python3 scripts/radius-cleanup.sh --dry-run | --apply")
        sys.exit(1)
    dry = sys.argv[1] == "--dry-run"

    total_lines = 0
    total_files = 0
    file_summary = []

    for path in collect_files():
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue

        lines = text.splitlines(keepends=True)
        new_lines = []
        file_changes = []

        for i, line in enumerate(lines, 1):
            new_line, changes = transform_line(line)
            new_lines.append(new_line)
            for c in changes:
                file_changes.append((i, line.rstrip(), c))

        if file_changes:
            rel = path.relative_to(REPO_ROOT)
            count = len(file_changes)
            file_summary.append((rel, count, file_changes))
            total_lines += count
            total_files += 1

            if not dry:
                path.write_text("".join(new_lines), encoding="utf-8")

    # ── 출력 ─────────────────────────────────────────────────
    if dry:
        for rel, count, changes in file_summary:
            print(f"\n[DRY RUN] {rel}  ({count}건)")
            for lineno, orig, change in changes[:5]:
                orig_short = orig.strip()[:80]
                print(f"  L{lineno}: {orig_short}")
                print(f"         └─ {change}")
            if len(changes) > 5:
                print(f"  ... 외 {len(changes)-5}건")
    else:
        for rel, count, _ in file_summary:
            print(f"  수정: {rel}  ({count}건)")

    print()
    print("=" * 50)
    print(f"총 변환 대상: {total_lines}건 / {total_files}개 파일")
    if dry:
        print("(드라이런 — 실제 파일 변경 없음)")
    else:
        print("변환 완료.")
    print("=" * 50)

if __name__ == "__main__":
    main()
