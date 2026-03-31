FROM node:22.14.0-slim

WORKDIR /app

COPY package.json yarn.lock ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/

RUN yarn install --frozen-lockfile

COPY apps/backend/ apps/backend/

# prisma generate reads .env file for DATABASE_URL (does not actually connect)
RUN echo "DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder" > apps/backend/.env
RUN yarn workspace @pmcs/backend build

CMD ["yarn", "workspace", "@pmcs/backend", "start"]
