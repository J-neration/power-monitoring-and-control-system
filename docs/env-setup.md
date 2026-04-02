# 환경 분리 가이드 (Dev / Prod)

## 원칙

| 항목 | Development (로컬) | Production |
|------|-------------------|------------|
| **DB** | Docker Postgres (`localhost:5432`) | Neon PostgreSQL (Railway 환경변수) |
| **Backend** | `http://localhost:4000` | Railway (`*.up.railway.app`) |
| **Frontend** | `http://localhost:3000` | Vercel (`*.vercel.app`) |
| **환경변수 위치** | `.env` / `.env.local` 파일 | 플랫폼 대시보드 (Railway / Vercel) |
| **Git 커밋** | ❌ 절대 커밋 금지 | ❌ 파일 없음, 대시보드에서만 관리 |

---

## 로컬 개발 시작하기

### 1. 환경변수 파일 준비

```bash
# 백엔드
cp apps/backend/.env.example apps/backend/.env

# 프론트엔드
cp apps/frontend/.env.example apps/frontend/.env.local
```

### 2. 로컬 DB 시작

```bash
yarn db:start        # Docker Postgres 컨테이너 실행
yarn db:migrate:dev  # 마이그레이션 적용
yarn db:seed         # (선택) 초기 데이터 삽입
```

### 3. 개발 서버 실행

```bash
yarn dev             # 프론트엔드 + 백엔드 동시 실행
# 또는 개별 실행:
yarn dev:backend
yarn dev:frontend
```

---

## 프로덕션 배포

### Railway (백엔드) 환경변수 설정

Railway 프로젝트 → **Variables** 탭에서 아래 값들을 설정합니다.  
템플릿: `apps/backend/.env.production.example`

| 변수 | 값 |
|------|----|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon 콘솔에서 복사 |
| `JWT_SECRET` | `openssl rand -base64 48` 결과 |
| `RECEIVER_API_KEY` | `openssl rand -hex 24` 결과 |
| `FRONTEND_ORIGIN` | Vercel 배포 URL |

### Vercel (프론트엔드) 환경변수 설정

Vercel 프로젝트 → **Settings → Environment Variables → Production**에서 설정합니다.  
템플릿: `apps/frontend/.env.production.example`

| 변수 | 값 |
|------|----|
| `NEXT_PUBLIC_API_BASE` | Railway 백엔드 URL |
| `COMMAND_API_BASE` | Railway 백엔드 URL |

---

## 프로덕션 DB 마이그레이션

로컬에서 prod DB에 직접 마이그레이션을 실행할 때는 **반드시** 임시로 env를 교체합니다.

```bash
# Railway CLI를 통한 안전한 방법 (권장)
railway run yarn db:migrate:deploy

# 또는 env를 일시적으로 교체하는 방법
DATABASE_URL="<prod_neon_url>" yarn db:migrate:deploy
```

> ⚠️ 절대로 `apps/backend/.env`에 prod DB URL을 넣지 마세요.

---

## 파일 구조 요약

```
apps/
├── backend/
│   ├── .env                      ← 로컬 dev 전용 (gitignored)
│   ├── .env.example              ← dev 템플릿 (커밋 가능)
│   └── .env.production.example   ← prod 템플릿 (커밋 가능, 실제값 없음)
└── frontend/
    ├── .env.local                ← 로컬 dev 전용 (gitignored)
    ├── .env.example              ← dev 템플릿 (커밋 가능)
    └── .env.production.example   ← prod 템플릿 (커밋 가능, 실제값 없음)
```

---

## 체크리스트 (배포 전)

- [ ] `apps/backend/.env`에 prod DB URL이 없는지 확인
- [ ] `apps/frontend/.env.local`의 API 주소가 localhost인지 확인
- [ ] Railway Variables에 모든 prod 환경변수 설정 완료
- [ ] Vercel Environment Variables에 prod 설정 완료
- [ ] `git status`에서 `.env` 파일이 staged에 없는지 확인
