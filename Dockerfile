FROM node:22.14.0-slim

WORKDIR /app

COPY package.json yarn.lock ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/

RUN yarn install --frozen-lockfile

COPY apps/backend/ apps/backend/

# prisma generate does not need DATABASE_URL (Prisma 7.2.0+ tolerates undefined datasource URL)
RUN yarn workspace @pmcs/backend build

CMD ["yarn", "workspace", "@pmcs/backend", "start"]
