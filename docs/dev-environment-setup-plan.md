# Dev 환경 구축 계획서

> 작성일: 2026-04-02
> 목적: Production과 분리된 Dev(테스트) 환경을 구축하여, 개발 중인 코드를 안전하게 검증할 수 있는 배포 파이프라인을 마련

---

## 1. 현재 상태

### 1.1 배포 구성 (Production만 존재)

```
main 브랜치 push
    ├──→ Netlify: Frontend 자동 배포 (Production)
    └──→ Railway: Backend 자동 배포 (Production)
                └──→ Neon main 브랜치 (Production DB)
```

### 1.2 문제점

- main에 push하면 곧바로 Production에 반영되어 테스트 없이 실서비스에 영향을 줌
- 개발 중인 기능을 팀원이 확인하려면 각자 로컬에서 실행해야 함
- Fake dataset으로 테스트할 수 있는 공용 환경이 없음

### 1.3 동료가 이미 준비한 것 (enhancement/deploy-dev 브랜치)

- Neon에 `dev` 브랜치 생성 완료 (Production DB의 copy-on-write 사본)
- Fake dataset 시드 스크립트 작성 (`prisma/seed.ts` + `src/data/deviceRegistry.ts`)
- 환경변수 분리 구조 정립 (`.env.example`, `.env.development.example`, `.env.production.example`)
- `loadEnvFiles.ts`를 통한 NODE_ENV 기반 env 파일 자동 로딩
- 루트 `package.json`에 dev/prod 구분 스크립트 추가

---

## 2. 목표 구성

```
dev 브랜치 push
    ├──→ Netlify: Frontend Dev 배포 (dev--<site>.netlify.app)
    └──→ Railway: Backend Dev 배포 (Dev 환경)
                └──→ Neon dev 브랜치 (Dev DB, fake dataset)

main 브랜치 push
    ├──→ Netlify: Frontend Prod 배포 (<site>.netlify.app)
    └──→ Railway: Backend Prod 배포 (Production 환경)
                └──→ Neon main 브랜치 (Production DB, 실제 현장 데이터)
```

---

## 3. 플랫폼별 설정 방법

### 3.1 Neon — Dev 브랜치 (이미 완료)

| 항목 | Production | Dev |
|------|-----------|-----|
| 브랜치 | main | dev |
| 데이터 | 실제 현장 데이터 | Fake dataset (seed) |
| 연결 문자열 | 별도 (Railway Prod에서 사용) | 별도 (Railway Dev에서 사용) |

Neon의 브랜치는 copy-on-write 방식으로 동작합니다. dev 브랜치를 생성하면 그 시점의 Production 데이터 스냅샷을 기반으로 하되, 변경분만 별도 저장하므로 추가 스토리지 비용이 최소화됩니다.

**Neon Free 플랜 제약:**
- 브랜치 최대 10개 (dev 1개 추가는 문제 없음)
- 스토리지 512MB 전체 브랜치 합산 (copy-on-write이므로 dev 추가 시 미미한 증가)
- 컴퓨트 191.9시간/월 (5분 미활동 시 자동 중지 — dev가 유휴 상태면 비용 거의 없음)

**필요 작업:** 없음 (이미 완료). Neon 콘솔에서 dev 브랜치의 Connection string을 확인하여 Railway Dev 환경에 설정하면 됨.


### 3.2 Railway — Dev 환경 생성

Railway는 **Environments** 기능을 제공합니다. 하나의 프로젝트 안에서 Production / Dev 환경을 분리하여 각각 독립적으로 빌드, 배포, 환경변수를 관리할 수 있습니다.

#### Step 1: Dev 환경 생성

1. [railway.app](https://railway.app) 로그인
2. PMCS 프로젝트 클릭하여 대시보드 진입
3. 상단 우측 **Settings** 탭 클릭
4. 좌측 메뉴에서 **Environments** 선택
5. **Create Environment** 버튼 클릭
6. 이름: `dev` 입력 후 생성

생성 직후 대시보드 상단에 환경 전환 드롭다운이 나타납니다:
```
[production ▾]  ←  여기를 클릭하면 dev로 전환 가능
```

#### Step 2: Dev 환경에 Git 브랜치 연결

1. 상단 드롭다운에서 `dev` 환경으로 전환
2. `@pmcs/backend` 서비스 클릭
3. **Settings** 탭 → **Source** 섹션
4. **Branch** 항목을 `dev`로 변경
   - 이렇게 하면 `dev` 브랜치에 push할 때만 Dev 환경에 배포됨
   - Production 환경은 기존대로 `main` 브랜치에 연결된 상태 유지

#### Step 3: Dev 환경 환경변수 설정

1. 상단 드롭다운에서 `dev` 환경인지 확인
2. `@pmcs/backend` 서비스 클릭
3. **Variables** 탭 진입
4. 아래 변수들을 하나씩 추가:

| 변수 | Dev 값 | 비고 |
|------|--------|------|
| `NODE_ENV` | `development` | |
| `PORT` | `4000` | |
| `HOST` | `0.0.0.0` | |
| `DATABASE_URL` | `postgresql://<user>:<pass>@<dev-endpoint>.neon.tech/neondb?sslmode=require` | Neon 콘솔 → dev 브랜치 → Connection string 복사 |
| `NEON_BRANCH` | `dev` | 안전 가드용 |
| `JWT_SECRET` | `dev-jwt-secret-change-me-min-32-chars!!` | Prod와 다른 값 사용 |
| `RECEIVER_API_KEY` | `dev-receiver-api-key` | Prod와 다른 값 사용 |
| `FRONTEND_ORIGIN` | `https://dev--<site-name>.netlify.app` | Netlify dev 브랜치 URL (Step 3.3에서 확인) |
| `LOG_LEVEL` | `debug` | |

> Neon dev 브랜치의 Connection string 확인 방법:
> Neon 콘솔 (console.neon.tech) → 프로젝트 선택 → 좌측 **Branches** → `dev` 선택 → **Connection Details** 에서 복사

#### Step 4: 빌드 설정 확인

1. Dev 환경의 `@pmcs/backend` 서비스 → **Settings** 탭
2. **Build** 섹션 확인:
   - Builder: Dockerfile (기존과 동일)
   - Dockerfile Path: `Dockerfile` (프로젝트 루트)
3. **Deploy** 섹션 확인:
   - Start Command: 비워두면 Dockerfile의 CMD 사용 (기존과 동일)

> Dev 환경은 Production과 동일한 Dockerfile을 사용하므로 별도 빌드 설정이 필요 없습니다.

#### Step 5: Dev 배포 URL 확인

1. Dev 환경에서 서비스가 배포되면 **Settings → Networking** 에서 URL 확인
2. Railway는 환경별로 다른 URL을 자동 부여합니다:
   - Production: `https://pmcsbackend-production.up.railway.app`
   - Dev: `https://pmcsbackend-dev.up.railway.app` (또는 Railway가 자동 생성한 URL)
3. 이 URL을 Netlify Dev 환경의 `NEXT_PUBLIC_API_BASE`에 사용합니다

#### Railway Dev 환경 관리 팁

**배포 확인:**
- 대시보드 상단에서 `dev` 환경 선택 → Deployments 탭에서 빌드/배포 로그 확인

**비용 절감 — 사용하지 않을 때 Sleep:**
- Dev 환경의 서비스 → Settings → 하단 **Remove Service** 대신
- **Deployments** 탭 → 최신 배포의 ⋯ 메뉴 → **Remove** 클릭하면 인스턴스가 내려감
- 다시 필요할 때 `dev` 브랜치에 push하면 자동 재배포

**비용 영향:**
- 환경 생성 자체는 무료
- Dev 환경도 별도 서비스 인스턴스로 실행되므로 리소스 사용량이 약 2배
- Hobby 플랜($5/월) 기준, Dev를 상시 가동하면 월 $5~10 예상
- Dev를 필요할 때만 가동하면 비용 최소화 가능


### 3.3 Netlify — Dev 브랜치 배포

Netlify는 **Branch Deploys** 기능으로 브랜치별 자동 배포를 지원합니다.

#### Step 1: Branch Deploys 활성화

1. [app.netlify.com](https://app.netlify.com) 로그인
2. PMCS 사이트 선택
3. **Site configuration** (좌측 메뉴) → **Build & deploy** → **Continuous deployment**
4. **Branches and deploy contexts** 섹션 찾기 → **Configure** 클릭
5. 설정 변경:
   - **Production branch**: `main` (기존 유지)
   - **Branch deploys**: "Let me add individual branches" 선택 → `dev` 입력 후 추가
6. **Save** 클릭

이제 `dev` 브랜치에 push하면 자동으로 별도 URL에 배포됩니다.

#### Step 2: Dev 브랜치 환경변수 설정 (방법 A — netlify.toml 파일)

프로젝트 루트에 `netlify.toml` 파일을 생성합니다:

```toml
# 공통 빌드 설정
[build]
  base = "apps/frontend"
  command = "yarn build"
  publish = ".next"

# Production 환경변수 (main 브랜치)
[context.production.environment]
  NEXT_PUBLIC_API_BASE = "https://pmcsbackend-production.up.railway.app"
  COMMAND_API_BASE = "https://pmcsbackend-production.up.railway.app"

# Dev 환경변수 (dev 브랜치)
[context.dev.environment]
  NEXT_PUBLIC_API_BASE = "https://<dev-backend-url>.up.railway.app"
  COMMAND_API_BASE = "https://<dev-backend-url>.up.railway.app"
```

> `<dev-backend-url>` 부분은 Railway Dev 환경 배포 후 확인되는 URL로 교체합니다.

#### Step 2 대안: Dev 브랜치 환경변수 설정 (방법 B — Netlify UI)

netlify.toml 대신 Netlify 대시보드에서 직접 설정할 수도 있습니다:

1. **Site configuration** → **Environment variables**
2. 기존 `NEXT_PUBLIC_API_BASE` 변수 클릭 → **Options** → **Edit**
3. **Different value for each deploy context** 활성화
4. 값 설정:
   - **Production**: `https://pmcsbackend-production.up.railway.app` (기존 값)
   - **Branch deploys - dev**: `https://<dev-backend-url>.up.railway.app`
5. `COMMAND_API_BASE`도 동일하게 설정
6. **Save** 클릭

> 방법 A(netlify.toml)와 방법 B(UI)는 둘 중 하나만 사용하면 됩니다.
> netlify.toml은 코드로 관리되어 팀원 간 공유가 쉽고, UI는 별도 커밋 없이 즉시 변경 가능합니다.

#### Step 3: 배포 확인

1. `dev` 브랜치에 push
2. Netlify 대시보드 → **Deploys** 탭에서 빌드 진행 확인
3. 빌드 완료 후 배포 URL 확인:

| 환경 | URL | 연결 대상 |
|------|-----|-----------|
| Production | `https://<site-name>.netlify.app` | Railway Production Backend |
| Dev | `https://dev--<site-name>.netlify.app` | Railway Dev Backend |

> Dev 배포 URL은 `dev--` 접두사가 붙습니다.
> 예: 사이트 이름이 `pmcs-frontend`라면 → `https://dev--pmcs-frontend.netlify.app`

#### Step 4: 빌드 설정 확인

현재 Netlify에 설정된 빌드 설정이 `netlify.toml`과 충돌하지 않는지 확인합니다:

1. **Site configuration** → **Build & deploy** → **Build settings**
2. 확인 항목:
   - **Base directory**: `apps/frontend`
   - **Build command**: `yarn build`
   - **Publish directory**: `apps/frontend/.next`
3. `netlify.toml`을 사용하는 경우, 대시보드 설정보다 `netlify.toml`이 우선합니다

#### Netlify 관리 팁

**브랜치 배포 확인:**
- Deploys 탭에서 `Production` / `Branch: dev` 필터로 구분하여 볼 수 있음

**Dev 배포 삭제 (불필요 시):**
- Site configuration → Build & deploy → Branch deploys에서 `dev` 제거하면 더 이상 배포되지 않음
- 기존 dev 배포는 자동으로 내려가지 않으므로 Deploys → 해당 배포 → Lock/Delete 처리

**비용 영향:**
- Branch deploys는 Free 플랜에 포함 (추가 비용 없음)
- 빌드 시간 300분/월, 대역폭 100GB/월이 모든 브랜치 배포에 공유됨
- 동시 빌드 1개 (Free 플랜) — dev와 main이 동시에 push되면 하나는 큐에서 대기

---

## 4. Git 브랜치 전략

### 4.1 제안하는 브랜치 구조

```
main (Production 배포)
  │
  └── dev (Dev 환경 배포)
        │
        ├── feature/xxx (기능 개발)
        ├── fix/xxx (버그 수정)
        └── enhancement/xxx (개선)
```

### 4.2 워크플로우

```
1. feature/xxx 브랜치에서 개발
        ↓
2. dev 브랜치에 PR → 머지
        ↓
3. Railway Dev + Netlify Dev 자동 배포
        ↓
4. Dev 환경에서 테스트 확인
        ↓
5. dev → main PR → 머지
        ↓
6. Railway Prod + Netlify Prod 자동 배포
        ↓
7. (schema 변경 시) Neon main에 prisma migrate deploy
```

### 4.3 주의사항

- `main` 브랜치에 직접 push 금지 — 반드시 `dev`를 거쳐서 PR로 머지
- GitHub에서 `main` 브랜치 보호 규칙(Branch Protection) 설정 권장:
  - Require pull request reviews
  - Require status checks to pass (빌드 성공 확인)

---

## 5. DB 마이그레이션 (Dev vs Prod)

### 5.1 Dev 환경

```bash
# 로컬에서 migration 생성 후 Neon dev에 적용
DATABASE_URL="<Neon dev 연결 문자열>" npx prisma migrate deploy
```

또는 Railway Dev 환경이 배포될 때 자동으로 migrate deploy를 실행하도록 start 스크립트에 추가하는 방법도 가능:

```json
"start": "prisma migrate deploy && node dist/src/index.js"
```

Dev 환경에서는 데이터 손실 위험이 낮으므로 자동 마이그레이션이 적합합니다.

### 5.2 Production 환경

Production은 기존과 동일하게 수동 실행:

```bash
DATABASE_URL="<Neon main 연결 문자열>" npx prisma migrate deploy
```

---

## 6. 전체 비용 영향 요약

| 플랫폼 | 현재 (Prod만) | Dev 추가 후 | 비고 |
|--------|-------------|------------|------|
| Neon | Free | Free | dev 브랜치 추가, 유휴 시 컴퓨트 자동 중지 |
| Railway | ~$5/월 크레딧 | 약 $5~10/월 | Dev 환경 상시 가동 시 2배, Sleep 활용 시 절감 |
| Netlify | Free | Free | Branch deploy 무료, 빌드 시간 공유 |

---

## 7. 작업 체크리스트

### Phase 1: 인프라 설정

- [ ] Railway: Dev 환경 생성 + `dev` 브랜치 연결
- [ ] Railway: Dev 환경에 환경변수 설정 (Neon dev DB URL 등)
- [ ] Netlify: Branch deploys 활성화 (`dev` 브랜치 추가)
- [ ] Netlify: `netlify.toml` 또는 UI에서 dev 브랜치 환경변수 설정
- [ ] GitHub: `dev` 브랜치 생성 (enhancement/deploy-dev 기반)

### Phase 2: 검증

- [ ] `dev` 브랜치에 push → Railway Dev 자동 배포 확인
- [ ] `dev` 브랜치에 push → Netlify Dev 자동 배포 확인
- [ ] Dev Frontend → Dev Backend → Neon dev DB 연결 확인
- [ ] Dev 환경에서 fake dataset이 정상 표시되는지 확인
- [ ] `main` 브랜치 배포가 기존과 동일하게 Production만 영향받는지 확인

### Phase 3: 프로세스 정립

- [ ] GitHub: `main` 브랜치 보호 규칙 설정
- [ ] 팀 내 브랜치 전략 공유 (feature → dev → main)
- [ ] Dev 환경 URL 팀에 공유
