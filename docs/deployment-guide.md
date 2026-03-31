# 배포 운영 가이드

> 작성일: 2026-03-31
> 대상: PMCS 개발/운영팀

---

## 1. 현재 배포 구성

| 구성 요소 | 플랫폼 | URL |
|-----------|--------|-----|
| **Frontend** | Netlify | `https://<your-site>.netlify.app` |
| **Backend** | Railway | `https://pmcsbackend-production.up.railway.app` |
| **Database** | Neon | PostgreSQL (ap-southeast-1) |

---

## 2. 자동 배포 (기본)

**GitHub `main` 브랜치에 push하면 자동으로 배포됩니다.**

```bash
# 코드 수정 후
git add <변경된 파일>
git commit -m "변경 내용 설명"
git push origin main
```

- Frontend 변경 (`apps/frontend/` 내 파일) → **Netlify** 자동 빌드 & 배포
- Backend 변경 (`apps/backend/` 내 파일) → **Railway** 자동 빌드 & 배포
- 둘 다 변경 → 양쪽 모두 자동 배포

> 빌드 시간: Frontend ~1분, Backend ~1분

---

## 3. 수동 재배포

### Frontend (Netlify)

1. [app.netlify.com](https://app.netlify.com) 로그인
2. 사이트 선택 → **Deploys** 탭
3. **"Trigger deploy"** → **"Deploy site"**

### Backend (Railway)

1. [railway.app](https://railway.app) 로그인
2. PMACS 프로젝트 → `@pmcs/backend` 서비스
3. **Deployments** 탭 → 최근 배포 **⋯** → **"Redeploy"**

---

## 4. 환경변수 변경

### Frontend 환경변수 (Netlify)

1. Netlify → 사이트 → **Site configuration** → **Environment variables**
2. 변수 수정 후 **재배포 필요** (Deploys → Trigger deploy)

| 변수 | 용도 |
|------|------|
| `NEXT_PUBLIC_API_BASE` | Backend API URL |

### Backend 환경변수 (Railway)

1. Railway → PMACS → `@pmcs/backend` → **Variables** 탭
2. 변수 수정 → 자동 재배포

| 변수 | 용도 |
|------|------|
| `PORT` | 서버 포트 (4000) |
| `HOST` | 바인드 주소 (0.0.0.0) |
| `DATABASE_URL` | Neon PostgreSQL 연결 문자열 |
| `JWT_SECRET` | JWT 토큰 서명 키 |
| `RECEIVER_API_KEY` | 텔레메트리 수신 API 인증 키 |
| `FRONTEND_ORIGIN` | CORS 허용 오리진 (Netlify URL) |
| `LOG_LEVEL` | 로그 레벨 (info) |

---

## 5. DB 스키마 변경 시

Prisma 마이그레이션이 필요한 경우:

```bash
# 1. 로컬에서 마이그레이션 생성
cd apps/backend
npx prisma migrate dev --name 변경_설명

# 2. 커밋 & 푸시 (Railway 자동 배포)
git add prisma/
git commit -m "Add migration: 변경 설명"
git push origin main

# 3. 운영 DB에 마이그레이션 적용 (Railway에서 자동 적용 안 됨)
# 로컬에서 직접 실행 (DATABASE_URL이 Neon을 가리키고 있으므로)
npx prisma migrate deploy
```

---

## 6. 로그 확인

### Frontend 빌드 로그 (Netlify)
- Netlify → 사이트 → **Deploys** → 배포 항목 클릭 → 빌드 로그 확인

### Backend 실시간 로그 (Railway)
- Railway → `@pmcs/backend` → **Deployments** 탭 → 배포 항목 클릭 → **Deploy Logs**

---

## 7. 커스텀 도메인 연결

### Frontend (Netlify)
1. Netlify → **Domain management** → **Add custom domain**
2. 도메인 입력 (예: `pmcs.example.com`)
3. DNS에 CNAME 추가: `pmcs → <site-name>.netlify.app`

### Backend (Railway)
1. Railway → Settings → Networking → **+ Custom Domain**
2. 도메인 입력 (예: `api.pmcs.example.com`)
3. DNS에 CNAME 추가: Railway가 안내하는 값으로 설정

### CORS 업데이트 (중요!)
도메인 변경 후 Railway **Variables**에서 `FRONTEND_ORIGIN`을 새 Frontend 도메인으로 수정:
```
FRONTEND_ORIGIN=https://pmcs.example.com
```

---

## 8. 문제 해결

### "서버에 연결할 수 없습니다" 에러
1. Railway 대시보드에서 Backend 서비스가 **Active** 상태인지 확인
2. `NEXT_PUBLIC_API_BASE`가 올바른 Railway URL인지 확인
3. `FRONTEND_ORIGIN`이 Netlify URL과 일치하는지 확인

### 로그인 안 됨
1. Backend 로그에서 에러 메시지 확인
2. `JWT_SECRET`이 설정되어 있는지 확인

### CORS 에러
1. Railway Variables → `FRONTEND_ORIGIN`이 정확한 Netlify URL인지 확인
2. URL 끝에 `/` 가 붙어있지 않은지 확인 (없어야 함)

---

## 9. 비용 모니터링

| 플랫폼 | 무료 한도 | 확인 방법 |
|--------|----------|-----------|
| **Netlify** | 월 100GB 대역폭, 빌드 300분 | Netlify → Team → Usage |
| **Railway** | $5/월 크레딧 (또는 30일) | Railway → Usage |
| **Neon** | 0.5GB 스토리지, 100시간 컴퓨트 | Neon 대시보드 → Usage |
