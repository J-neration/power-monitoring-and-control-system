# Backend 개발 가이드

> 작성일: 2026-03-31
> 대상: PMCS 백엔드 개발자

---

## 1. 로컬 개발 환경 준비

### 사전 요구사항

- Node.js 18+
- Docker (PostgreSQL 컨테이너용)
- Yarn (monorepo 패키지 매니저)

### 로컬 DB 실행

```bash
# 프로젝트 루트에서
docker compose up -d
```

PostgreSQL이 `localhost:5432`에서 실행됩니다.

| 항목 | 값 |
|------|---|
| Host | `localhost` |
| Port | `5432` |
| User | `pmcs` |
| Password | `pmcs` |
| Database | `pmcs` |

### 로컬 `.env` 설정

`apps/backend/.env` 파일을 생성합니다:

```env
DATABASE_URL=postgresql://pmcs:pmcs@localhost:5432/pmcs
JWT_SECRET=local-dev-secret-change-in-production
RECEIVER_API_KEY=local-dev-key
FRONTEND_ORIGIN=http://localhost:3000
PORT=4000
HOST=0.0.0.0
LOG_LEVEL=debug
```

### 초기 세팅 (최초 1회)

```bash
cd apps/backend
yarn install
npx prisma migrate dev      # 모든 migration 적용 + Prisma Client 생성
```

### 개발 서버 실행

```bash
cd apps/backend
yarn dev
```

---

## 2. Schema 변경 작업

> **핵심**: `schema.prisma` 수정 → migration 생성 → 커밋 → 푸시

### Step 1: Schema 수정

[apps/backend/prisma/schema.prisma](../apps/backend/prisma/schema.prisma) 파일을 수정합니다.

### Step 2: Migration 생성 & 로컬 DB 적용

```bash
cd apps/backend
npx prisma migrate dev --name <변경_내용_요약>
```

이 명령어가 하는 일:
1. `prisma/migrations/` 폴더에 SQL migration 파일 생성
2. 로컬 PostgreSQL에 migration 적용
3. Prisma Client 재생성 (`prisma generate` 자동 실행)

**migration 이름 예시:**

| 변경 내용 | 이름 |
|-----------|------|
| Device에 status 필드 추가 | `add_device_status` |
| User 테이블에 email 컬럼 추가 | `add_user_email` |
| TelemetryRecord 인덱스 추가 | `add_telemetry_index` |
| Site에서 region 필드 삭제 | `remove_site_region` |

### Step 3: 코드 수정

schema 변경에 맞춰 관련 코드를 수정합니다:
- API 라우트 (요청/응답 타입)
- 서비스 로직 (쿼리, 생성, 업데이트)
- WebSocket 핸들러 (해당 시)

### Step 4: 커밋 & 푸시

```bash
git add apps/backend/prisma/
git add <기타 변경된 파일>
git commit -m "Add migration: 변경 내용 설명"
git push origin <브랜치명>
```

> **중요**: `prisma/migrations/` 폴더는 반드시 git에 커밋해야 합니다. 이 폴더가 없으면 다른 팀원이나 배포 환경에서 DB를 동기화할 수 없습니다.

---

## 3. 다른 팀원의 Schema 변경을 받았을 때

PR 머지 또는 pull 후 migration 파일이 새로 들어왔다면:

```bash
cd apps/backend
npx prisma migrate dev
```

이것만 실행하면 새 migration이 로컬 DB에 적용되고 Prisma Client도 갱신됩니다.

> 만약 로컬 DB 상태가 꼬여서 에러가 나면:
> ```bash
> # 로컬 DB 초기화 (데이터 전부 삭제됨)
> docker compose down -v
> docker compose up -d
> npx prisma migrate dev
> ```

---

## 4. 운영 DB (Neon) 반영

### 자동 배포 흐름

```
schema.prisma 수정
    ↓
npx prisma migrate dev --name <이름>  (로컬)
    ↓
git push origin dev 또는 main
    ↓
Railway 자동 빌드 & 배포
    ↓
prisma migrate deploy 자동 실행 (Dockerfile에서 서버 시작 전 실행)
    ↓
Neon DB에 migration 자동 적용 완료
```

> DB migration은 Railway 배포 시 자동으로 실행됩니다.
> Dockerfile의 CMD에서 서버 시작 전 `prisma migrate deploy`가 실행되어,
> 각 환경의 DATABASE_URL에 연결된 Neon 브랜치 (dev / main)에 migration이 적용됩니다.

### 수동으로 Migration 적용이 필요한 경우

자동 적용이 실패하거나, 배포 없이 DB만 업데이트해야 할 때:

```bash
cd apps/backend

# DATABASE_URL을 Neon 운영 DB로 지정하여 실행
DATABASE_URL="<Neon 운영 DATABASE_URL>" npx prisma migrate deploy
```

> **`migrate dev` vs `migrate deploy`**
>
> | | `migrate dev` | `migrate deploy` |
> |---|---|---|
> | 용도 | 로컬 개발 | 운영 배포 |
> | migration 생성 | O | X |
> | Prisma Client 생성 | O | X |
> | DB 초기화 프롬프트 | O (필요시) | X (실패로 처리) |
> | 안전성 | 개발용 | 운영 안전 |

---

## 5. 자주 쓰는 Prisma 명령어

```bash
# Migration 생성 + 로컬 DB 적용
npx prisma migrate dev --name <이름>

# 운영 DB에 migration 적용 (생성 없이)
npx prisma migrate deploy

# Prisma Client만 재생성 (migration 없이)
npx prisma generate

# 현재 migration 상태 확인
npx prisma migrate status

# DB를 schema.prisma에 맞게 강제 동기화 (migration 파일 없이, 개발용)
npx prisma db push

# Prisma Studio (DB GUI 뷰어)
npx prisma studio
```

---

## 6. 빌드 & 실행

### 로컬 개발

```bash
cd apps/backend
yarn dev                    # tsx watch 모드 (자동 리로드)
```

### 프로덕션 빌드

```bash
cd apps/backend
yarn build                  # prisma generate + tsc 컴파일
yarn start                  # node dist/src/index.js
```

---

## 7. 체크리스트

### Schema 변경 시

- [ ] `schema.prisma` 수정
- [ ] `npx prisma migrate dev --name <이름>` 실행
- [ ] 관련 코드 수정 (라우트, 서비스 등)
- [ ] 로컬에서 테스트
- [ ] `prisma/migrations/` 폴더 포함하여 커밋
- [ ] PR → dev 머지 → Dev 환경 자동 배포 & migration 적용
- [ ] Dev에서 확인 후 dev → main PR 머지 → Production 자동 배포 & migration 적용

### 코드만 변경 시 (schema 변경 없음)

- [ ] 코드 수정
- [ ] 로컬에서 테스트
- [ ] 커밋 & 푸시 → Railway 자동 배포

### Pull 받은 후

- [ ] `yarn install` (의존성 변경 있을 경우)
- [ ] `npx prisma migrate dev` (migration 파일이 새로 추가된 경우)
