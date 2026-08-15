# 잇데이 앱 아이콘 — 스토어 제출 세트

생성기: [`scripts/gen_app_icons.py`](../../scripts/gen_app_icons.py)
컨셉 고른 뒤 색·형태를 바꾸려면 그 파일만 고치고 다시 돌리면 **전 사이즈가 한 번에** 다시 나온다.

```bash
python3 scripts/gen_app_icons.py
```

비교용 한 장: `_contact-sheet.png` (큰 것 + 홈화면 실제 크기 동시 확인)

---

## 컨셉 6종

| # | 폴더 | 컨셉 | 성격 |
|---|---|---|---|
| 01 | `01-aperture` | 아이리스 | 카메라 조리개 = 꽃잎. 사진 + 뷰티를 한 마크로 |
| 02 | `02-monogram` | 잇 모노그램 | 한글 '잇'. 국내 브랜드 각인이 제일 세다 |
| 03 | `03-ribbon` | 리본 | 지금 플레이스홀더(🎀)의 유일한 계승안. 밝은 바탕 |
| 04 | `04-shutter-heart` | 셔터하트 | 인스타 프레임 문법 그대로, 렌즈만 하트로 |
| 05 | `05-spark-frame` | 스파크 프레임 | 사진 + AI. 제일 담백하고 안 질린다 |
| 06 | `06-bloom` | 블룸 솔리드 | 면으로 채운 꽃. 작게 줄여도 형태가 안 무너진다 |

색은 전부 `css/tokens.css` 의 `--brand #D58A95` / `--brand-strong #BC6675` 계열.

---

## 어느 파일을 어디에 올리나

| 파일 | 올리는 곳 | 규격 근거 |
|---|---|---|
| `appstore-1024.png` | App Store Connect → 앱 정보 → 앱 아이콘<br>+ `ios/App/App/Assets.xcassets/AppIcon.appiconset/` | 1024×1024, **알파 채널 없음**(있으면 반려), 모서리 둥글리기 금지 |
| `play-512.png` | Play Console → 스토어 등록정보 → 앱 아이콘 | 512×512 32-bit PNG, 1MB 이하 |
| `android-adaptive-fg-432.png`<br>`android-adaptive-bg-432.png` | `android/app/src/main/res/mipmap-*/`<br>(adaptive icon foreground / background) | 108dp 중 안전영역 66dp — 마크를 61%로 축소 배치해 둠 |
| `icon-180 / 167 / 152 / 120 / 87 / 80 / 76 / 60 / 58 / 40` | iOS `AppIcon.appiconset` | |
| `icon-512 / 384 / 192 / 144 / 128 / 96 / 72` | PWA `icons/` + `manifest.json` | |
| `preview-rounded-512.png` | 미리보기 전용 | **제출 금지** — 모서리가 미리 깎여 있다 |

> 두 스토어 다 자기 마스크를 씌우므로 **제출본은 모서리를 깎지 않은 정사각 풀블리드**다.
> `preview-rounded-*` 만 눈으로 보라고 깎아 둔 것.

---

## 고른 뒤 앱에 반영할 것 (아직 안 했음)

현재 앱은 `icon.svg` = 다크브라운 배경 + 🎀 이모지 **플레이스홀더**다. 컨셉 확정되면:

1. `icons/icon-*.png` 교체 (`manifest.json` 목록 그대로)
2. `icon.svg` 교체 — PWA 벡터 아이콘
3. `ios/App/App/Assets.xcassets/AppIcon.appiconset/` + `docs/submission/AppIcon.appiconset/`
4. `android/app/src/main/res/mipmap-*/`
5. `store/play/graphics/icon/` (현재 비어 있음)
6. ⚠️ 캐시 — `manifest.json` 과 `icon.svg` 는 `?v=` 자동 범프 대상이 아니다. 배포 후 확인.
