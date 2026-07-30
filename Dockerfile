FROM node:22.14.0-slim

WORKDIR /app

COPY package.json yarn.lock ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/

RUN yarn install --frozen-lockfile

COPY apps/backend/ apps/backend/

# prisma generate does not need DATABASE_URL (Prisma 7.2.0+ tolerates undefined datasource URL)
RUN yarn workspace @pmcs/backend build

# Surface migrate errors clearly in Railway deploy logs.
CMD ["sh", "-c", "cd apps/backend && echo '[boot] prisma migrate deploy…' && npx prisma migrate deploy && echo '[boot] starting API…' && cd /app && node apps/backend/dist/src/index.js"]
