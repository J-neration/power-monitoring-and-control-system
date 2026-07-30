FROM node:22.14.0-slim

WORKDIR /app

COPY package.json yarn.lock ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/

# Always install build tools (tsc/prisma) even if host sets NODE_ENV=production.
RUN yarn install --frozen-lockfile --production=false

COPY apps/backend/ apps/backend/

RUN yarn workspace @pmcs/backend build

# Soft-fail migrate so a schema hiccup does not keep serving a stale image without Settings routes.
CMD ["sh", "-c", "cd apps/backend && echo '[boot] prisma migrate deploy…' && (npx prisma migrate deploy && echo '[boot] migrate ok') || echo '[boot] MIGRATE FAILED — check Railway DATABASE_URL / logs' && echo '[boot] starting API…' && cd /app && exec node apps/backend/dist/src/index.js"]
