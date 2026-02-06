# Power Monitoring & Control System (PMCS)

Template for a full-stack HMI monitoring and control application using:

- Frontend: Next.js (React)
- Backend: Fastify (Node.js)
- Database: PostgreSQL
- ORM: Prisma
- Language: TypeScript

## Structure

- `apps/frontend`: Next.js dashboard
- `apps/backend`: Fastify API + WebSocket endpoint
- `docker-compose.yml`: local Postgres

## Getting Started

### 1) Install dependencies

```bash
yarn
```

### 2) Start database

```bash
docker compose up -d
```

### 3) Configure environment

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

### 4) Prisma setup

```bash
npx prisma generate --workspace apps/backend
npx prisma db push --workspace apps/backend
```

### 5) Run dev servers

```bash
npm run dev
```

Frontend: http://localhost:3000  
Backend: http://localhost:4000  
Health check: http://localhost:4000/health

## Notes

- `GET /devices` returns sample device data (in-memory).
- `GET /ws` is a WebSocket endpoint for live events.
- Update `DATABASE_URL` in `apps/backend/.env` to point at your real database when ready.
