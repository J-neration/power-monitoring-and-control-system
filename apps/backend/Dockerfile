# Build context = apps/backend (Railway Root Directory)
FROM node:22.14.0-slim

WORKDIR /app

ENV NODE_ENV=development

COPY package.json ./
# Prefer lockfile from monorepo if present; otherwise install from package.json only.
COPY yarn.lock* ./

RUN yarn install --production=false || npm install --include=dev

COPY . .

RUN yarn build

ENV NODE_ENV=production

CMD ["sh", "-c", "echo '[boot] prisma migrate deploy…' && (npx prisma migrate deploy && echo '[boot] migrate ok') || echo '[boot] MIGRATE FAILED' && echo '[boot] starting API…' && node dist/src/index.js"]
