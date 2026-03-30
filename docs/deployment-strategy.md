# 배포 전략 리포트

> 작성일: 2026-03-18
> 대상 시스템: Power Monitoring & Control System (PMCS)
> 작성 목적: 실제 웹 배포를 위한 플랫폼 선정 및 설정 가이드

---

## 1. 현황 분석

### 배포 대상 구성 요소

| 구성 요소 | 기술 스택 | 현재 실행 환경 |
|-----------|-----------|----------------|
| **Frontend** | Next.js 14.1.0 (App Router, TypeScript) | `localhost:3000` |
| **Backend** | Fastify 4.26.2 (Node.js, TypeScript) | `localhost:4000` |
| **Database** | PostgreSQL (Prisma ORM) | Neon 클라우드 (이미 배포됨) |

### 배포 시 고려해야 할 기술적 요구사항

- **WebSocket 지원**: 실시간 텔레메트리 업데이트 (`@fastify/websocket`)
- **CORS 설정**: Frontend Origin → Backend 허용 필요
- **JWT 쿠키 인증**: `httpOnly` 쿠키 기반 → HTTPS 환경에서 `secure: true` 필요
- **환경변수 분리**: `JWT_SECRET`, `RECEIVER_API_KEY`, `DATABASE_URL` 등 민감 정보
- **Monorepo 구조**: Yarn workspaces (`apps/frontend`, `apps/backend`)

---

## 2. 플랫폼 비교

### 2-1. Frontend — Next.js 호스팅

| 플랫폼 | 무료 플랜 | 커스텀 도메인 | Next.js 최적화 | 장점 | 단점 |
|--------|-----------|---------------|----------------|------|------|
| **Vercel** ★추천 | 무료 (개인 프로젝트 무제한) | ✅ 무료 | ✅ 최고 수준 (개발사 동일) | ISR, Edge, 자동 배포 | 팀 플랜부터 유료 |
| Netlify | 무료 (월 100GB 대역폭) | ✅ 무료 | ✅ 양호 | 배포 간편, 폼 기능 포함 | Next.js 일부 기능 제한 |
| Cloudflare Pages | 무료 (무제한 대역폭) | ✅ 무료 | ⚠️ 부분 지원 | CDN 최고 성능 | Next.js 서버 기능 제한 |

### 2-2. Backend — Fastify Node.js 서버 호스팅

| 플랫폼 | 무료 플랜 | WebSocket | 커스텀 도메인 | 장점 | 단점 |
|--------|-----------|-----------|---------------|------|------|
| **Railway** ★추천 | $5/월 크레딧 제공 | ✅ | ✅ | GitHub 자동 배포, 항상 ON, 직관적 UI | 무료 크레딧 소진 시 과금 |
| Render | 무료 (Sleep 있음) | ✅ | ✅ (무료) | 진짜 무료, Docker 지원 | 15분 비활성 시 서버 Sleep (콜드스타트 ~50초) |
| Fly.io | 무료 (3 VM 제공) | ✅ | ✅ | Docker 기반, 글로벌 배포 | 초기 설정 복잡, CLI 필수 |
| Heroku | ❌ (유료만) | ✅ | ✅ | 안정성 높음 | 무료 플랜 폐지됨 |

### 2-3. Database — 현재 Neon 사용 중

| 플랫폼 | 무료 플랜 | 현재 상태 |
|--------|-----------|-----------|
| **Neon** ★현재 사용 중 | 무료 (0.5 GB 스토리지, 100시간 컴퓨트) | 이미 설정 완료, 변경 불필요 |

---

## 3. 최종 추천 조합

```
[사용자 브라우저]
        │
        ▼
[Vercel] — Next.js Frontend (HTTPS, 커스텀 도메인)
        │
        │ HTTPS API 호출 + WebSocket
        ▼
[Railway] — Fastify Backend (HTTPS, 커스텀 도메인)
        │
        │ SSL/TLS PostgreSQL
        ▼
[Neon] — PostgreSQL Database (이미 운영 중)
```

### 선택 이유

**Vercel (Frontend)**
- Next.js를 만든 Vercel에서 운영 → App Router, ISR, Edge 기능 완벽 지원
- GitHub push 시 자동 배포 (PR별 Preview URL 포함)
- 무료 플랜에서 커스텀 도메인 사용 가능
- 배포 후 도메인 연결이 가장 간단

**Railway (Backend)**
- Node.js 서버를 그대로 배포 가능 (Dockerfile 불필요)
- WebSocket 완벽 지원
- 매월 $5 무료 크레딧 → 소규모 서버는 무료 범위 내 운영 가능
- 환경변수 UI 관리 간편
- 커스텀 도메인 연결 지원

**Neon (Database)**
- 이미 연결되어 있으므로 추가 작업 없음
- 무료 플랜으로 현재 데이터 규모 충분히 커버

---

## 4. 비용 분석

### 무료 플랜 운영 시 예상 비용

| 항목 | 플랫폼 | 월 비용 |
|------|--------|---------|
| Frontend | Vercel Free | $0 |
| Backend | Railway Free ($5 크레딧) | $0 (소규모 트래픽 기준) |
| Database | Neon Free | $0 |
| **합계** | | **$0/월** |

### 도메인 구입 후 비용 (추후)

| 항목 | 예상 비용 |
|------|-----------|
| `.com` 도메인 | $10~15/년 (Cloudflare Registrar 최저가) |
| `.co.kr` 도메인 | 약 ₩22,000/년 |
| 서버 비용 | $0 (무료 플랜 유지 시) |
| **합계** | **$10~15/년** |

### 트래픽 증가 시 유료 전환 옵션

| 항목 | 플랫폼 | 유료 시작 비용 |
|------|--------|----------------|
| Frontend | Vercel Pro | $20/월/팀 |
| Backend | Railway Starter | $5/월 + 사용량 |
| Database | Neon Launch | $19/월 |

---

## 5. 배포 설정 가이드

### 5-1. 환경변수 설정 (배포 전 필수)

#### Frontend (Vercel에서 설정)

```env
NEXT_PUBLIC_API_BASE=https://<your-backend>.railway.app
```

#### Backend (Railway에서 설정)

```env
PORT=4000
HOST=0.0.0.0
DATABASE_URL=<현재 Neon URL 그대로>
JWT_SECRET=<최소 32자 이상의 랜덤 문자열 — 운영용으로 새로 생성>
RECEIVER_API_KEY=<안전한 랜덤 키>
FRONTEND_ORIGIN=https://<your-app>.vercel.app
LOG_LEVEL=info
```

> **주의**: `JWT_SECRET`은 반드시 운영용으로 새로 생성해야 합니다.
> 생성 방법: `openssl rand -base64 48`

### 5-2. Vercel 배포 — Frontend

1. [vercel.com](https://vercel.com) → GitHub 계정으로 로그인
2. **New Project** → `power-monitoring-and-control-system` 레포 선택
3. **Framework Preset**: Next.js (자동 감지)
4. **Root Directory**: `apps/frontend`
5. **Environment Variables**: `NEXT_PUBLIC_API_BASE` 추가
6. **Deploy** 클릭

**monorepo 설정** — Vercel은 Yarn workspaces를 자동 감지하지만, 루트가 아닌 하위 앱을 배포할 경우 Root Directory를 명시해야 합니다.

```
Root Directory: apps/frontend
Build Command: yarn build (자동)
Output Directory: .next (자동)
```

### 5-3. Railway 배포 — Backend

1. [railway.app](https://railway.app) → GitHub 계정으로 로그인
2. **New Project** → **Deploy from GitHub repo**
3. 레포 선택 후 **Add Variables** 클릭 → 위 환경변수 입력
4. **Settings** → **Root Directory**: `apps/backend` 지정
5. **Start Command**: `node dist/index.js`
6. **Build Command**: `yarn install && yarn build`

> Railway는 빌드 시 `package.json`의 `scripts.build`를 자동 실행합니다.
> Backend의 `build` 스크립트: `tsc -p tsconfig.json` → `dist/` 생성 후 `node dist/index.js`로 실행.

### 5-4. 커스텀 도메인 연결 (도메인 구입 후)

#### Vercel (Frontend)
1. Vercel 프로젝트 → **Settings** → **Domains**
2. 도메인 입력 (예: `pmcs.example.com`)
3. 도메인 레지스트라에서 CNAME 레코드 추가:
   ```
   CNAME  pmcs  cname.vercel-dns.com
   ```

#### Railway (Backend)
1. Railway 서비스 → **Settings** → **Networking** → **Custom Domain**
2. 도메인 입력 (예: `api.pmcs.example.com`)
3. 도메인 레지스트라에서 CNAME 레코드 추가:
   ```
   CNAME  api.pmcs  <railway-provided-value>
   ```

---

## 6. 배포 후 확인 체크리스트

### 기본 기능

- [ ] Frontend 접속 (`https://<app>.vercel.app`)
- [ ] 로그인 동작 확인 (ADMIN 계정)
- [ ] 대시보드 데이터 로딩 확인
- [ ] 사이트 목록 / 상세 페이지 확인
- [ ] 디바이스 상세 / 차트 확인

### 인증 & 보안

- [ ] 로그인 후 JWT 쿠키 발급 확인 (브라우저 DevTools → Application → Cookies)
- [ ] 로그아웃 동작 확인
- [ ] 역할별 접근 제한 동작 확인 (CLIENT, SITE 계정)
- [ ] HTTPS 강제 적용 확인 (배포 플랫폼이 자동 처리)

### 실시간 기능

- [ ] WebSocket 연결 확인 (DevTools → Network → WS 탭)
- [ ] 텔레메트��� 수신 엔드포인트 (`POST /receiver`) 동작 확인

### CORS

- [ ] Frontend → Backend API 호출 오류 없는지 확인
- [ ] Backend `FRONTEND_ORIGIN`이 Vercel URL과 일치하는지 확인

---

## 7. 주요 리스크 및 대응

| 리스크 | 내용 | 대응 방안 |
|--------|------|-----------|
| **쿠키 SameSite 문제** | Frontend/Backend 도메인이 다를 경우 쿠키 전송 안 됨 | `SameSite=None; Secure` 설정 필요, 또는 같은 루트 도메인 사용 |
| **Railway 크레딧 소진** | $5 크레딧 소진 시 서버 중단 | 모니터링 알림 설정, 또는 Render 무료 플랜으로 전환 |
| **Neon 컴퓨트 시간** | 무료 플랜 월 100시간 컴퓨트 제한 | 자동 슬립 설정으로 비활성 시 컴퓨트 절약 (기본 활성화됨) |
| **빌드 실패** | monorepo에서 Root Directory 미지정 | Vercel/Railway 모두 `apps/frontend`, `apps/backend` 명시 필수 |

### 쿠키 크로스 도메인 문제 해결 (중요)

현재 쿠키 설정이 `httpOnly`이지만, Frontend와 Backend가 서로 다른 도메인일 경우 (`vercel.app` vs `railway.app`) 쿠키가 전송되지 않을 수 있습니다.

**해결 방법 A — 커스텀 도메인 사용 (권장)**
```
Frontend: pmcs.example.com
Backend:  api.pmcs.example.com
```
같은 루트 도메인(`example.com`)을 사용하면 `SameSite=Lax` 쿠키가 전달됩니다.

**해결 방법 B — SameSite=None 설정 (임시)**

`apps/backend/src/modules/auth/auth.routes.ts` 또는 쿠키 설정 부분에서:
```typescript
// 운영 환경에서만 적용
reply.setCookie('token', accessToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
});
```

---

## 8. 도메인 구입 추천

### 도메인 레지스트라 비교

| 레지스트라 | 특징 | `.com` 연간 비용 |
|------------|------|-----------------|
| **Cloudflare Registrar** ★추천 | 원가 판매 (마크업 없음), DNS 관리 포함 | ~$9/년 |
| Namecheap | 저렴한 신규 등록, UI 직관적 | $9~13/년 |
| Google Domains → Squarespace | UI 간편, Google 연동 | $12/년 |
| GoDaddy | 갱신 비용 높음 | 신규 $1~갱신 $20+ |

> **Cloudflare Registrar 추천 이유**: 원가 판매로 갱신 시에도 가격 변동 없음.
> 도메인 DNS를 Cloudflare에서 관리하면 Vercel/Railway CNAME 설정도 동일 대시보드에서 처리 가능.

---

## 9. 향후 확장 고려사항

### 트래픽 증가 시 업그레이드 경로

```
현재 (개발/테스트)              소규모 운영                  중규모 운영
─────────────────       →     ─────────────────      →     ─────────────────
Vercel Free                   Vercel Pro ($20/월)           Vercel Pro
Railway Free ($5 크레딧)       Railway Starter ($5+)        Railway Team
Neon Free                     Neon Launch ($19/월)          Neon Scale
```

### 모니터링 추가 (무료)

- **Vercel Analytics**: 빌트인 성능 분석 (무료 플랜 기본 포함)
- **Railway Metrics**: 서버 CPU/메모리 모니터링 (빌트인)
- **UptimeRobot**: 서버 가동 상태 모니터링 무료 (5분 간격 체크)

---

## 10. 결론

| 항목 | 선택 | 이유 |
|------|------|------|
| **Frontend 배포** | Vercel | Next.js 최적화, 무료 커스텀 도메인, 자동 배포 |
| **Backend 배포** | Railway | WebSocket 지원, 월 $5 무료 크레딧, 설정 간단 |
| **Database** | Neon (현재 유지) | 이미 설정 완료, 변경 불필요 |
| **도메인 레지스트라** | Cloudflare Registrar | 원가 판매, DNS 통합 관리 |

초기 테스트는 Vercel/Railway 기본 도메인으로 진행하고, 서비스 안정화 후 커스텀 도메인을 연결하는 방식이 비용 효율적입니다. 무료 플랜에서 시작해 소규모 실운영도 가능한 구성이며, 트래픽 증가 시 각 플랫폼 유료 플랜으로 자연스럽게 확장할 수 있습니다.
