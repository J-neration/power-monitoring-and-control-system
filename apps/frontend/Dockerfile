# AWS ECS 용 프론트엔드 이미지. Netlify 배포와는 무관하다.
# 빌드 컨텍스트는 저장소 루트 (같은 폴더의 Dockerfile.dockerignore 가 적용됨):
#   docker build -f apps/frontend/Dockerfile .
#
# 환경별 값은 이미지에 굽지 않는다 — 같은 이미지를 dev·prod 에 그대로 쓰고,
# API_BASE_INTERNAL · AUTH_JWT_SECRET · TRUSTED_PROXY_HOPS 는 ECS 작업 정의에서 넣는다.

FROM node:22.14.0-slim AS build
WORKDIR /app

COPY package.json yarn.lock ./
COPY apps/frontend/package.json apps/frontend/
COPY apps/backend/package.json apps/backend/

# 백엔드 postinstall(prisma generate)은 프론트 빌드에 필요 없으므로 스크립트를 건너뛴다.
RUN yarn install --frozen-lockfile --ignore-scripts

COPY apps/frontend/ apps/frontend/

ENV NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_WS_URL=/ws
ARG NEXT_CSP_ENFORCE=false
ENV NEXT_CSP_ENFORCE=$NEXT_CSP_ENFORCE

RUN yarn workspace @pmcs/frontend build

FROM node:22.14.0-slim
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/apps/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build --chown=node:node /app/apps/frontend/public ./apps/frontend/public

USER node
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
