# AWS ECS 용 백엔드 이미지. Railway 배포(저장소 루트 Dockerfile)와는 무관하다.
# 빌드 컨텍스트는 저장소 루트 (같은 폴더의 Dockerfile.dockerignore 가 적용됨):
#   docker build --platform linux/arm64 -f apps/backend/Dockerfile .
#
# 루트 Dockerfile(Railway)과 다른 점:
#   - 실행 이미지에는 운영 의존성만 둔다. 개발 도구·프론트엔드 의존성·yarn 캐시가 빠져
#     약 5GB → 수백 MB 로 준다 (ECR 보관 비용, Fargate 기동 시간).
#   - 부팅 시 마이그레이션을 하지 않는다. 배포 때 별도 ECS 태스크(api-migrate)가 실행한다.
#   - root 가 아닌 node 사용자로 실행한다.
# 환경별 값과 시크릿은 이미지에 굽지 않고 ECS 작업 정의에서 넣는다.

# ── 1. 빌드: 루트 Dockerfile 과 같은 방식으로 설치·컴파일 ─────────────────
FROM node:22.14.0-slim AS build
WORKDIR /app

COPY package.json yarn.lock ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
# @pmcs/backend 의 postinstall(prisma generate)이 schema·config 를 찾는다.
COPY apps/backend/prisma.config.ts apps/backend/
COPY apps/backend/prisma/ apps/backend/prisma/
RUN yarn install --frozen-lockfile --production=false

COPY apps/backend/ apps/backend/
RUN yarn workspace @pmcs/backend build

# ── 2. 운영 의존성: 백엔드 package.json 만으로 설치 (lockfile 버전 그대로) ───
FROM node:22.14.0-slim AS deps
WORKDIR /app/apps/backend

COPY yarn.lock ./
COPY apps/backend/package.json apps/backend/prisma.config.ts ./
COPY apps/backend/prisma/schema.prisma prisma/schema.prisma
# 설치 스크립트는 켠다 — Prisma 마이그레이션 엔진(schema-engine)이 이때 내려받아진다.
RUN yarn install --production --frozen-lockfile && yarn cache clean

# ── 3. 실행 이미지 ──────────────────────────────────────────────────────
FROM node:22.14.0-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/apps/backend/node_modules apps/backend/node_modules
COPY --from=build /app/apps/backend/dist apps/backend/dist
COPY apps/backend/package.json apps/backend/prisma.config.ts apps/backend/
COPY apps/backend/prisma/schema.prisma apps/backend/prisma/schema.prisma
COPY apps/backend/prisma/migrations/ apps/backend/prisma/migrations/
# RDS TLS 검증용 CA 번들 (DATABASE_SSL_CA_FILE)
COPY apps/backend/certs/ apps/backend/certs/

USER node
EXPOSE 4000
# ECS 작업 정의도 같은 명령을 지정한다. 마이그레이션 태스크는
#   sh -c "cd apps/backend && npx prisma migrate deploy"
CMD ["node", "apps/backend/dist/src/index.js"]
