FROM node:22.14.0-slim

WORKDIR /app

COPY package.json yarn.lock ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/

# @pmcs/backend의 postinstall이 `prisma generate`를 돌리므로,
# yarn install 이전에 schema/config가 이미 있어야 한다.
COPY apps/backend/prisma.config.ts apps/backend/
COPY apps/backend/prisma/ apps/backend/prisma/

# Always install build tools (tsc/prisma) even if host sets NODE_ENV=production.
RUN yarn install --frozen-lockfile --production=false

COPY apps/backend/ apps/backend/

RUN yarn workspace @pmcs/backend build

# Railway는 NODE_ENV를 자동 주입하지 않는다. 비어 있으면 아래 가드가
# NEON_BRANCH=main 을 development로 오인해 process.exit(1) → healthcheck 실패.
# Railway dev 서비스는 Variables에서 NODE_ENV=development 로 덮어쓴다.
ENV NODE_ENV=production

# Soft-fail migrate so a schema hiccup does not keep serving a stale image without Settings routes.
CMD ["sh", "-c", "cd apps/backend && echo '[boot] prisma migrate deploy…' && (npx prisma migrate deploy && echo '[boot] migrate ok') || echo '[boot] MIGRATE FAILED — check Railway DATABASE_URL / logs' && echo '[boot] starting API…' && cd /app && exec node apps/backend/dist/src/index.js"]
