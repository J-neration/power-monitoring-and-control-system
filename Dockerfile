FROM node:22.14.0-slim

WORKDIR /app

# Ensure devDependencies (typescript etc.) are installed during image build
# even if the platform injects NODE_ENV=production.
ENV NODE_ENV=development

COPY package.json yarn.lock ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/

RUN yarn install --frozen-lockfile --production=false

COPY apps/backend/ apps/backend/

# prisma generate does not need DATABASE_URL (Prisma 7.2.0+ tolerates undefined datasource URL)
RUN yarn workspace @pmcs/backend build

ENV NODE_ENV=production

# migrate first; if it fails, still boot so new routes are live and logs show the migrate error.
# (Settings routes returning 5xx/empty is better than keeping an old image with 404.)
CMD ["sh", "-c", "cd apps/backend && echo '[boot] prisma migrate deploy…' && (npx prisma migrate deploy && echo '[boot] migrate ok') || echo '[boot] MIGRATE FAILED — check DATABASE_URL / Neon schema' && echo '[boot] starting API…' && cd /app && node apps/backend/dist/src/index.js"]
