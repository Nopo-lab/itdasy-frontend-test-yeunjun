# itdasy-frontend

뷰티샵 AI 마케팅 도우미 — PWA 프론트엔드

## 배포 구조

| 항목 | 내용 |
|---|---|
| **호스팅** | GitHub Pages (자동 배포) |
| **URL** | `https://nopo-lab.github.io/itdasy-frontend` |
| **자동 배포** | 이 레포에 push하면 GitHub Pages 자동 배포 |
| **백엔드 API** | `https://itdasy260417-production.up.railway.app` |

## 백엔드

백엔드는 별도 레포에서 관리:
- **레포**: `Nopo-lab/itdasy_backend` (private)
- **서버**: Railway 24시간 상시 운영
- **배포**: push하면 Railway 자동 재배포

## 수정 → 반영 흐름

1. **프론트엔드 수정**: 이 레포 수정 후 push → GitHub Pages 자동 배포
2. **백엔드 수정**: `itdasy_backend` 레포 `backend/` 폴더 수정 후 push → Railway 자동 재배포
3. **테스트**: `https://nopo-lab.github.io/itdasy-frontend` 에서 동일 링크로 확인

## 주의사항

- `app-core.js`의 API URL(`PROD_API`)은 Railway 주소로 고정
- 이 레포는 **public** — API 키나 비밀 정보 절대 포함 금지
