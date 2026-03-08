# Power Monitoring & Control System (PMCS)

Full-stack HMI 모니터링 및 제어 애플리케이션입니다.

- **Frontend**: Next.js (React) — port `3000`
- **Backend**: Fastify (Node.js) — port `4000`
- **Database**: PostgreSQL — Neon (클라우드, 팀 공유)
- **ORM**: Prisma
- **Language**: TypeScript

## 구조

```
apps/
  frontend/    # Next.js 대시보드
  backend/     # Fastify API + WebSocket
docker-compose.yml  # 로컬 개발용 PostgreSQL (선택사항)
```

---

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정 (최초 1회)

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

`apps/backend/.env`의 `DATABASE_URL`을 팀 공유 Neon 연결 문자열로 교체합니다 (팀원에게 문의).

### 3. Prisma 초기화 (최초 1회)

```bash
cd apps/backend && npx prisma migrate deploy && cd ../..
```

### 4. 앱 실행

루트 디렉토리에서 **단 하나의 명령어**로 실행합니다 (Mac / Windows 공통):

```bash
npm run dev
```

터미널에서 `[frontend]` / `[backend]` prefix로 각 서버의 로그가 구분 출력됩니다.

| 서비스       | 주소                         |
|--------------|------------------------------|
| Frontend     | http://localhost:3000        |
| Backend API  | http://localhost:4000        |
| Health Check | http://localhost:4000/health |

---

## 데이터베이스

### 연결 정보

데이터는 **Neon 클라우드 PostgreSQL**에 저장됩니다. 팀원 모두 같은 DB를 바라보며, 장비가 데이터를 전송하면 즉시 모두에게 반영됩니다.

| 항목       | 값                                                |
|------------|---------------------------------------------------|
| 종류       | PostgreSQL (Neon 클라우드)                        |
| Region     | Asia Pacific (Singapore)                          |
| Connection | `apps/backend/.env`의 `DATABASE_URL` 참고         |

> `.env` 파일은 gitignore 처리되어 있습니다. 연결 문자열을 팀 내에서 안전하게 공유하세요 (Slack DM, 1Password 등).

### 데이터 확인 방법

#### 방법 1 — Prisma Studio (GUI 권장)

```bash
cd apps/backend
npx prisma studio
```

브라우저에서 `http://localhost:5555` 으로 접속하면 모든 테이블을 GUI로 확인·편집할 수 있습니다.

#### 방법 2 — Neon 웹 콘솔

Neon 대시보드 → 프로젝트 선택 → **SQL Editor** 탭에서 직접 쿼리 실행 가능합니다.

유용한 쿼리:

```sql
-- 사이트 목록
SELECT * FROM "Site";

-- 설치지점 목록
SELECT * FROM "Installation";

-- 디바이스 최신 텔레메트리
SELECT * FROM "Device";

-- 사이트별 전체 현황
SELECT
  s.name        AS site,
  i.label       AS installation,
  d.status,
  d."lastSeenAt",
  d."lastValue"
FROM "Site" s
JOIN "Installation" i ON i."siteId" = s.id
LEFT JOIN "Device" d ON d."installationId" = i.id;
```

### 데이터 스키마 구조

```
Site (고객사/현장)
  └── Installation (설치지점: 변전실 / 102동 / 전기실 등)
        └── Device (최신 텔레메트리: 전압·전류·역률·THD 등)
```

---

## 환경변수

| 파일                        | 주요 항목                                           |
|-----------------------------|-----------------------------------------------------|
| `apps/backend/.env`         | `PORT`, `HOST`, `DATABASE_URL` (Neon), `LOG_LEVEL` |
| `apps/frontend/.env.local`  | `NEXT_PUBLIC_API_BASE`                              |
