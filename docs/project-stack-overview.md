# PMCS 프로젝트 기술 스택 & 서비스 가이드

> 작성일: 2026-04-01
> 대상: PMCS 개발팀 (프로젝트에 새로 합류하는 동료용)

---

## 전체 구조 한눈에 보기

```
[HMI 장비]                     [사용자 브라우저]
    │                                │
    │ POST /receiver                 │ HTTPS + WebSocket
    │ (x-api-key 인증)               │
    ▼                                ▼
┌──────────────────────────────────────────┐
│           Railway (클라우드 서버)           │
│  ┌─────────────────────────────────────┐ │
│  │  Fastify Backend (Node.js)          │ │
│  │  ┌───────────────────────────────┐  │ │
│  │  │  Prisma ORM                   │  │ │
│  │  │  (DB 접근 코드 자동 생성)       │  │ │
│  │  └──────────────┬────────────────┘  │ │
│  └─────────────────┼───────────────────┘ │
└────────────────────┼─────────────────────┘
                     │ PostgreSQL 프로토콜
                     ▼
            ┌─────────────────┐
            │   Neon (클라우드 DB)  │
            │   PostgreSQL 16      │
            └─────────────────┘

[개발자 PC]
    │
    ├── Docker → 로컬 PostgreSQL (개발용)
    └── Prisma CLI → migration 생성/적용
```

---

## 각 서비스별 역할

### 1. Neon — 운영 데이터베이스

| 항목 | 내용 |
|------|------|
| **뭐하는 거?** | 운영 환경의 PostgreSQL 데이터베이스 |
| **왜 필요해?** | Site, Device, 텔레메트리 등 모든 실제 데이터가 여기에 저장됨 |
| **어디서 확인?** | Neon 대시보드 (neon.tech) |

- Railway에서 돌아가는 백엔드가 `DATABASE_URL`로 Neon DB에 접속
- 로컬에서 `npx prisma migrate deploy`로 운영 DB 스키마를 업데이트할 때도 Neon에 연결됨
- **로컬 개발 시에는 사용하지 않음** — 로컬은 Docker PostgreSQL 사용

### 2. Railway — 백엔드 서버 호스팅

| 항목 | 내용 |
|------|------|
| **뭐하는 거?** | Fastify 백엔드 서버를 클라우드에서 실행 |
| **왜 필요해?** | 24시간 서버가 켜져 있어야 HMI 장비가 텔레메트리를 보낼 수 있고, 사용자가 API에 접근 가능 |
| **어디서 확인?** | Railway 대시보드 (railway.app) |

- `main` 브랜치에 push하면 **자동으로 빌드 & 배포**
- Dockerfile을 기반으로 빌드: `yarn install` → `prisma generate` → `tsc` 컴파일
- 환경변수 (DATABASE_URL, JWT_SECRET 등)는 Railway Variables에서 관리

### 3. Prisma — ORM (코드 ↔ DB 연결 도구)

| 항목 | 내용 |
|------|------|
| **뭐하는 거?** | TypeScript 코드에서 DB를 쉽게 다룰 수 있게 해주는 ORM |
| **왜 필요해?** | SQL을 직접 안 쓰고 `prisma.device.findMany()` 같은 코드로 DB 조회/수정 가능 |
| **설정 파일** | `apps/backend/prisma/schema.prisma` |

Prisma가 하는 일 3가지:

```
1. schema.prisma 파일   →  DB 테이블 구조 정의 (설계도)
2. prisma migrate       →  설계도를 실제 DB에 반영 (SQL 생성 & 실행)
3. prisma generate      →  설계도 기반으로 TypeScript 타입 & 쿼리 코드 자동 생성
```

> **Neon과의 관계**: Prisma는 "도구"이고 Neon은 "저장소"입니다.
> Prisma가 SQL을 만들어서 Neon(또는 로컬 Docker DB)에 보내는 구조입니다.

### 4. Netlify — 프론트엔드 호스팅

| 항목 | 내용 |
|------|------|
| **뭐하는 거?** | Next.js 프론트엔드를 클라우드에서 서빙 |
| **왜 필요해?** | 사용자가 브라우저로 접속하는 웹 화면을 제공 |
| **어디서 확인?** | Netlify 대시보드 (app.netlify.com) |

- `main` 브랜치에 push하면 자동 빌드 & 배포
- `NEXT_PUBLIC_API_BASE` 환경변수로 Railway 백엔드 URL을 가리킴

### 5. Docker — 로컬 개발용 DB

| 항목 | 내용 |
|------|------|
| **뭐하는 거?** | 로컬 PC에서 PostgreSQL 컨테이너를 실행 |
| **왜 필요해?** | 개발할 때 Neon 운영 DB를 건드리지 않고 독립적으로 테스트 |
| **설정 파일** | `docker-compose.yml` |

```bash
docker compose up -d    # 로컬 DB 시작
docker compose down -v  # 로컬 DB 초기화 (데이터 삭제)
```

---

## 흔히 헷갈리는 것들

### Q: Prisma랑 Neon이 같은 거 아니야?

**아닙니다.** 완전히 다른 레이어입니다.

| | Prisma | Neon |
|---|---|---|
| 종류 | ORM (라이브러리/도구) | 클라우드 DB (서비스) |
| 비유 | 엑셀 프로그램 | 엑셀 파일이 저장된 클라우드 드라이브 |
| 없으면? | SQL을 직접 작성해야 함 | 데이터를 저장할 곳이 없음 |

### Q: Railway는 왜 필요해? 그냥 내 PC에서 서버 돌리면 안 돼?

가능은 하지만:
- PC를 끄면 서버도 꺼짐 → HMI 장비가 데이터를 보내도 받을 수 없음
- 외부에서 접근하려면 포트포워딩, 고정 IP 등이 필요
- Railway는 HTTPS, 자동 배포, 로그 확인을 다 제공

### Q: Docker DB랑 Neon DB는 뭐가 달라?

| | Docker (로컬) | Neon (운영) |
|---|---|---|
| 위치 | 내 PC | 클라우드 (싱가포르 리전) |
| 용도 | 개발/테스트 | 실제 서비스 |
| 데이터 | 테스트 데이터 | 실제 현장 데이터 |
| 접근 | `localhost:5432` | `DATABASE_URL` (Neon 연결 문자열) |

---

## 환경변수 & 인증키 정리

| 환경변수 | 어디서 쓰임 | 용도 |
|----------|------------|------|
| `DATABASE_URL` | Backend → Neon/Docker | DB 연결 문자열 |
| `JWT_SECRET` | Backend | 사용자 로그인 토큰 서명 |
| `RECEIVER_API_KEY` | Backend (`POST /receiver`) | HMI 장비가 텔레메트리를 보낼 때 인증하는 API 키. 요청 헤더 `x-api-key`에 이 값을 넣어야 데이터 수신이 허용됨 |
| `FRONTEND_ORIGIN` | Backend (CORS) | 프론트엔드 도메인 허용 |
| `NEXT_PUBLIC_API_BASE` | Frontend | 백엔드 API URL |

---

## 개발 → 배포 전체 흐름 요약

```
[개발자 PC에서 코드 수정]
        │
        ▼
    git push origin main
        │
        ├──→ Netlify: Frontend 자동 빌드 & 배포
        │
        └──→ Railway: Backend 자동 빌드 & 배포
                │
                │  (schema 변경이 있었다면)
                ▼
        개발자가 수동으로 실행:
        DATABASE_URL="<Neon URL>" npx prisma migrate deploy
                │
                ▼
        Neon 운영 DB에 스키마 반영 완료
```
