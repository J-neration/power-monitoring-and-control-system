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

## 하지 말 것

- 운영 DB에 `yarn db:seed`
- `apps/backend/.env.development`에 Neon **main** URL 넣기
- 환경 변수 파일을 git에 커밋
