FROM node:22.14.0-slim

WORKDIR /app

COPY package.json yarn.lock ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/

RUN yarn install --frozen-lockfile

COPY apps/backend/ apps/backend/

# prisma generate needs DATABASE_URL at build time (does not actually connect)
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN yarn workspace @pmcs/backend build

CMD ["yarn", "workspace", "@pmcs/backend", "start"]
