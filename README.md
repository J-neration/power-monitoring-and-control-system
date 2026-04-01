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

---

## Receiver Command Downlink (Module ON/OFF)

STM32 + Quectel LTE 장비의 다운링크 명령 제어는 아래 4개 API로 동작합니다.

### Command Lifecycle

1. 웹 UI/관리자가 `POST /receiver/commands/create`로 명령 생성 (`pending`)
2. 장비가 5초 주기로 `GET /receiver/commands?installationId=...` 폴링
3. 서버는 가장 오래된 `pending` 1건을 반환하고 `sent`로 전환
4. 장비가 `POST /receiver/commands/ack` 전송
   - `ok=true` -> `acked`
   - `ok=false` -> `failed`
5. 히스토리는 `GET /receiver/commands/history`로 조회

정책:
- 한 설치/모듈에 대해 `pending|sent` 활성 명령은 1개만 허용
- TTL(기본 120초) 지난 `pending|sent`는 `expired`로 정리
- ACK 중복 수신은 idempotent 처리 (기존 상태 그대로 응답)

### Device Authentication

아래 장비 엔드포인트는 `x-api-key: <RECEIVER_API_KEY>` 필수:
- `POST /receiver`
- `GET /receiver/commands`
- `POST /receiver/commands/ack`

### No-Command Contract

장비 폴링 시 대기 명령이 없으면 아래 payload를 반환:

```json
{ "id": "", "module": -1, "power": "" }
```

### cURL Examples

명령 생성 (관리자 전용, ADMIN JWT 필요):

```bash
curl -X POST "http://localhost:4000/receiver/commands/create" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "installationId":"PSVG-RNDTEST5",
    "module":2,
    "power":"off",
    "requestedBy":"admin@company.com"
  }'
```

장비 폴링:

```bash
curl "http://localhost:4000/receiver/commands?installationId=PSVG-RNDTEST5" \
  -H "x-api-key: receiver-dev-key"
```

장비 ACK:

```bash
curl -X POST "http://localhost:4000/receiver/commands/ack" \
  -H "x-api-key: receiver-dev-key" \
  -H "Content-Type: application/json" \
  -d '{
    "id":"cmd_20260331_0001",
    "ok":true,
    "message":"queued"
  }'
```

히스토리 조회 (관리자 전용, ADMIN JWT 필요):

```bash
curl "http://localhost:4000/receiver/commands/history?installationId=PSVG-RNDTEST5&limit=50" \
  -H "Authorization: Bearer <JWT_TOKEN>"
```
