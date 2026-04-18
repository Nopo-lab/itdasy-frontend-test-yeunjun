# 잇데이 스튜디오 — 공동작업 가이드

> 원영 & 연준의 공동작업공간

## 레포지토리 구조

| 레포지토리 | 용도 | 공개 | 자동 배포 |
|---|---|---|---|
| [`itdasy-frontend`](https://github.com/Nopo-lab/itdasy-frontend) | 프론트엔드 (운영) | public | GitHub Pages |
| [`itdasy_backend`](https://github.com/Nopo-lab/itdasy_backend) | 백엔드 (운영) | private | Railway |
| [`itdasy-frontend-test`](https://github.com/Nopo-lab/itdasy-frontend-test) | 프론트엔드 테스트 | public | GitHub Pages |

## 테스트 링크

| 항목 | URL |
|---|---|
| **프론트엔드 (운영)** | https://nopo-lab.github.io/itdasy-frontend |
| **프론트엔드 (테스트-원영)** | https://nopo-lab.github.io/itdasy-frontend-test |
| **프론트엔드 (테스트-연준, 이 레포)** | https://nopo-lab.github.io/itdasy-frontend-test-yeunjun |
| **운영 백엔드 API** | https://itdasy260417-production.up.railway.app |
| **스테이징 백엔드 API (이 레포가 연결됨)** | https://itdasy260417-staging-production.up.railway.app |
| **스테이징 API 문서 (Swagger)** | https://itdasy260417-staging-production.up.railway.app/docs |
| **스테이징 헬스체크** | https://itdasy260417-staging-production.up.railway.app/health |

## 테스트 계정

| 이메일 | 비밀번호 |
|---|---|
| cbt1@itdasy.com | Itdasy2026! |
| cbt2@itdasy.com | Itdasy2026! |
| cbt3@itdasy.com | Itdasy2026! |
| cbt4@itdasy.com | Itdasy2026! |

---

## 작업 규칙

### 1. 백업

- 작업 전, 수정할 레포지토리의 모든 파일을 백업 레포지토리에 묶어서 저장
- 백업 레포지토리명 형식: `frontend_backup_YYMMDD_HHmmss` (예: `frontend_backup_260418_010219`)
- **각자 그 날의 첫 작업 시에만 백업** (수정할 때마다 X)

### 2. 수정 → 푸시

- 수정이 완료되면 깃허브에 push 후 **변경사항을 커밋 메시지에 기록**
- Frontend 수정 → `itdasy-frontend` 레포에 push
- Backend 수정 → `itdasy_backend` 레포에 push
- push하면 자동으로 서버에 배포됨

### 3. 프론트엔드 테스트 흐름

연준이가 프론트엔드만 수정할 때:

1. `itdasy-frontend-test` 레포에서 수정 후 push
2. https://nopo-lab.github.io/itdasy-frontend-test 에서 테스트
3. 에러 없는 거 확인되면 `itdasy-frontend` 운영 레포로 push

### 4. 백엔드 구조

```
itdasy_backend/
├── .github/workflows/   ← Railway 자동 배포
├── backend/             ← FastAPI 앱 (Railway가 여기만 빌드)
│   ├── main.py
│   ├── models.py
│   ├── database.py
│   ├── routers/
│   ├── services/
│   ├── utils/
│   ├── requirements.txt
│   └── .env
└── DB_manage/           ← 클라우드 스토리지 모듈
```

### 5. 주의사항

- `itdasy_backend`는 **private 유지** (API 키 포함)
- `itdasy-frontend`, `itdasy-frontend-test`는 **public** — 비밀 정보 절대 포함 금지
- 프론트엔드 `app-core.js`의 `PROD_API`는 Railway 주소로 고정

---

## 인프라 정보

| 항목 | 서비스 | 비고 |
|---|---|---|
| 백엔드 서버 | Railway (24시간 상시) | US East |
| 프론트엔드 호스팅 | GitHub Pages | 자동 배포 |
| 데이터베이스 | Supabase Postgres | 클라우드 |
| 누끼 (배경제거) | Remove.bg API | 서버 우선, 클라이언트 폴백 |
| AI 분석 | Gemini 2.5 Flash | 인스타 말투 분석 |
