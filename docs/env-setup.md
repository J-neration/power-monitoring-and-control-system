# 환경 변수

로컬은 **파일 2개**만 씁니다. dev·운영 값은 **AWS** 에만 둡니다. example 템플릿은 없습니다.

## 로컬 (gitignore)

| 파일 | 누가 읽나 | 넣는 값 |
|------|-----------|---------|
| `apps/backend/.env.development` | `yarn dev` 백엔드 | 로컬 Docker `DATABASE_URL`(`postgresql://pmcs:pmcs@localhost:5432/pmcs`), 개발용 JWT/API 키 |
| `apps/frontend/.env.local` | Next.js | `NEXT_PUBLIC_API_BASE`, `COMMAND_API_BASE` |

`yarn dev`는 `NODE_ENV=development`라서 `.env.development`를 읽습니다. `yarn dev:aws-db` 는 dev 서버 DB 로 가는 터널 주소를
`.env.development.local` 에 넣어 이 값을 덮어씁니다(`scripts/dev-box/README.md`).

## dev·운영 (파일 없음)

| 환경 | 어디에 | 무엇을 |
|------|--------|--------|
| 운영 | Secrets Manager `pmcs-prod/api`·`pmcs-prod/jwt`·`pmcs-prod/alert-mail` → ECS 작업 정의 | `DATABASE_URL`, `RECEIVER_API_KEY`, `JWT_SECRET`, SMTP 등. 나머지 값은 `infra/terraform/envs/prod/app/services.tf` |
| dev  | SSM `/pmcs-dev/box/env` → dev 서버 `/opt/pmcs/.env` | 같은 키들. 나머지는 `infra/dev-box/compose.yml` |

아래 변수는 모두 **미설정이면 로컬 기본 동작**입니다. dev·운영 컨테이너에만 설정합니다.

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
| 프론트 (빌드) | `NEXT_OUTPUT`, `NEXT_PUBLIC_WS_URL`, `NEXT_CSP_ENFORCE` | `apps/frontend/Dockerfile` 이 설정 | 컨테이너 출력, 같은 출처 `/ws`, CSP (기본 차단, `false` 면 보고 전용) |

## 하지 말 것

- 운영 DB에 `yarn db:seed`
- `apps/backend/.env.development`에 운영 DB 주소 넣기
- 환경 변수 파일을 git에 커밋
