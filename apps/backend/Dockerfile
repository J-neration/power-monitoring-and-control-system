# Build context = apps/backend (Railway Root Directory = apps/backend 인 경우)
# 루트(/)를 Root Directory로 쓰는 경우는 저장소 루트의 Dockerfile을 사용한다.
FROM node:22.14.0-slim

WORKDIR /app

# 플랫폼이 NODE_ENV=production을 주입해도 devDependencies(typescript/tsx)를 설치
ENV NODE_ENV=development

COPY package.json ./

# postinstall(`prisma generate`)이 install 중에 돌기 때문에
# schema/config가 install 이전에 있어야 한다.
COPY prisma.config.ts ./
COPY prisma/ ./prisma/

# 이 컨텍스트에는 yarn.lock이 없다(모노레포 루트에만 존재) → lockfile 없이 설치
RUN yarn install --production=false --non-interactive

COPY . .

RUN yarn build

ENV NODE_ENV=production

CMD ["sh", "-c", "echo '[boot] prisma migrate deploy…' && (npx prisma migrate deploy && echo '[boot] migrate ok') || echo '[boot] MIGRATE FAILED' && echo '[boot] starting API…' && node dist/src/index.js"]
