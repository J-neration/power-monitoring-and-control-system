# 환경 변수

로컬은 **파일 2개**만 씁니다. 운영은 **대시보드**만 씁니다. example 템플릿은 없습니다.

## 로컬 (gitignore)

| 파일 | 누가 읽나 | 넣는 값 |
|------|-----------|---------|
| `apps/backend/.env.development` | `yarn dev` 백엔드 | Neon **dev** `DATABASE_URL`, `NEON_BRANCH=dev`, 개발용 JWT/API 키 |
| `apps/frontend/.env.local` | Next.js | `NEXT_PUBLIC_API_BASE`, `COMMAND_API_BASE` |

선택: `apps/backend/.env.local` 은 `yarn db:pull-prod` 용 `PROD_DATABASE_URL` 전용입니다.

`yarn dev`는 `NODE_ENV=development`라서 `.env.development`를 읽습니다. 운영 Neon URL을 이 파일에 넣지 마세요.

## 운영 (파일 없음)

| 플랫폼 | 변수 |
|--------|------|
| Railway (백엔드) | `NODE_ENV=production`, `DATABASE_URL`, `NEON_BRANCH=main`, `JWT_SECRET`, `RECEIVER_API_KEY`, `FRONTEND_ORIGIN`, `LOG_LEVEL` |
| Netlify (프론트) | `NEXT_PUBLIC_API_BASE`, `COMMAND_API_BASE` |

## AWS 전환용 (Railway·Netlify 에는 넣지 않음)

아래 변수는 모두 **미설정이면 기존 동작 그대로**입니다. AWS ECS 작업 정의에서만 설정합니다.

| 위치 | 변수 | 값 (AWS) | 효과 |
|------|------|----------|------|
| 백엔드 | `TRUST_PROXY_HOPS` | `1` | ALB 가 붙인 `X-Forwarded-For` 로 실제 접속 IP 기록 |
| 백엔드 | `WS_PING_INTERVAL_MS` | `30000` | ALB idle timeout 에 WebSocket 이 끊기지 않게 ping |
| 백엔드 | `WS_REQUIRE_AUTH` | `true` | `/ws` 연결에 로그인 쿠키(JWT) 요구 (프론트와 같은 출처일 때만) |
| 백엔드 | `DATABASE_SSL_CA_FILE` | `/app/apps/backend/certs/rds-global-bundle.pem` | RDS 인증서 검증. 이때 `DATABASE_URL` 에 `sslmode` 를 넣지 않음 |
| 백엔드 | `DATABASE_POOL_MAX` | (선택) | DB 커넥션 풀 크기. 기본 10 |
| 프론트 (런타임) | `API_BASE_INTERNAL` | VPC 내부 백엔드 주소 | 서버 코드가 공개 api 도메인을 거치지 않고 백엔드 호출 |
| 프론트 (런타임) | `AUTH_JWT_SECRET` | 백엔드 `JWT_SECRET` 과 같은 값 | middleware 가 쿠키의 서명·만료까지 확인 |
| 프론트 (런타임) | `TRUSTED_PROXY_HOPS` | `1` | 로그인 IP 제한에 ALB 가 붙인 IP 만 사용 |
| 프론트 (빌드) | `NEXT_OUTPUT`, `NEXT_PUBLIC_WS_URL`, `NEXT_CSP_ENFORCE` | `apps/frontend/Dockerfile` 이 설정 | 컨테이너 출력, 같은 출처 `/ws`, CSP (기본 보고 전용) |

## 하지 말 것

- 운영 DB에 `yarn db:seed`
- `apps/backend/.env.development`에 Neon **main** URL 넣기
- 환경 변수 파일을 git에 커밋
