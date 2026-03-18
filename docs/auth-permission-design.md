# 권한 기반 서비스 레이어 설계 리포트

> 작성일: 2026-03-18
> 대상 시스템: Power Monitoring & Control System (PMCS)
> 작성 목적: 구현 전 설계 검토

---

## 1. 현황 분석

### 현재 데이터 모델 (요약)

```
Site
 └─ id, name, client (건설사 식별자), region, address
     └─ Installation[]
          └─ Device (최신 텔레메트리)
          └─ TelemetryRecord[] (시계열 이력)
```

- `Site.client` 필드: 건설사 구분의 핵심 키 (e.g. `"lotte"`, `"hillstate"`, `"thesharp"`)
- `Site.id`: 특정 현장 구분의 핵심 키 (e.g. `"lotte-haeundae-xi"`)
- **현재 인증/인가 레이어 없음**: 모든 API 엔드포인트가 완전 오픈 상태

---

## 2. 사용자 역할(Role) 정의

| Role | 대상 | 접근 범위 |
|------|------|----------|
| `ADMIN` | 프라임솔루션 관리자 | 전체 Site, Installation, Device, Telemetry 조회 |
| `CLIENT` | 건설사 관리자 (더샵, 힐스테이트, 롯데캐슬 등) | 자사 `client` 키에 해당하는 Site들만 조회 |
| `SITE` | 현장 관리자 (해운대 롯데캐슬, 대전 힐스테이트 등) | 자신이 배정된 특정 Site 1개만 조회 |

### 역할별 권한 매트릭스

| 기능 | ADMIN | CLIENT | SITE |
|------|:-----:|:------:|:----:|
| 전체 Site 목록 | ✅ | ❌ (자사만) | ❌ (자기 현장만) |
| Site 상세 조회 | ✅ | ✅ (자사만) | ✅ (자기 현장만) |
| Device 목록 | ✅ | ✅ (자사 site 소속만) | ✅ (자기 site 소속만) |
| Device 상세 | ✅ | ✅ (자사 site 소속만) | ✅ (자기 site 소속만) |
| 텔레메트리 이력 | ✅ | ✅ (자사 site 소속만) | ✅ (자기 site 소속만) |
| 계정 관리 (CRUD) | ✅ | ❌ | ❌ |
| 회원가입 | ❌ (없음) | ❌ (없음) | ❌ (없음) |

---

## 3. 스키마 설계 (Prisma)

### 추가할 모델

```prisma
enum UserRole {
  ADMIN
  CLIENT
  SITE
}

model User {
  id           String   @id @default(cuid())
  username     String   @unique           // 로그인 ID (이메일 or 단순 ID)
  passwordHash String                     // bcrypt hash
  role         UserRole

  // CLIENT 역할: 어느 건설사인지 (Site.client 값과 매칭)
  // e.g. "lotte", "hillstate", "thesharp"
  clientKey    String?

  // SITE 역할: 어느 현장인지 (Site.id와 매칭)
  siteId       String?
  site         Site?    @relation(fields: [siteId], references: [id])

  isActive     Boolean  @default(true)
  lastLoginAt  DateTime?

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([username])
}
```

### 역할별 필드 사용 규칙

```
ADMIN  → clientKey: null, siteId: null  (모든 데이터 접근)
CLIENT → clientKey: "lotte",  siteId: null
SITE   → clientKey: null,  siteId: "lotte-haeundae-xi"
```

> 비고: SITE 유저는 clientKey 없이 siteId만으로 특정 현장에 귀속됨.
> Site.client는 자동으로 siteId를 통해 도출 가능하므로 중복 저장 불필요.

---

## 4. 인증 설계 (Authentication)

### 방식: JWT (Access Token)

- **로그인**: `POST /auth/login` → `{ username, password }` → `{ accessToken, user }`
- **토큰 방식**: JWT, 만료 8시간 (현장/건설사 업무 시간 기준)
- **페이로드 구조**:
  ```json
  {
    "sub": "user_cuid",
    "role": "CLIENT",
    "clientKey": "lotte",
    "siteId": null,
    "iat": 1234567890,
    "exp": 1234596690
  }
  ```

### 토큰 갱신 전략 (선택)

- **Option A (심플)**: 만료 시 재로그인 강제 → 초기 MVP에 적합
- **Option B (Refresh Token)**: 별도 Refresh Token 발급 → 자동 갱신 가능

→ **권장**: Option A로 시작, 향후 필요 시 Option B 전환

---

## 5. 인가 설계 (Authorization)

### 구현 방식: Fastify Prehandler Hook

각 라우트에 역할/범위 검사를 수행하는 `preHandler`를 연결합니다.

```
Request
  → JWT 파싱 (preHandler: authenticate)
  → 역할 검사 (preHandler: requireRole)
  → 리소스 범위 검사 (Service Layer 내부)
  → 응답
```

### Permission Context 패턴

서비스 레이어에 `UserContext`를 전달하여 데이터 필터링:

```typescript
type UserContext =
  | { role: "ADMIN" }
  | { role: "CLIENT"; clientKey: string }
  | { role: "SITE"; siteId: string }
```

서비스 메서드 예시:

```typescript
// siteService.list(ctx)
ADMIN  → prisma.site.findMany()                        // 전체
CLIENT → prisma.site.findMany({ where: { client: ctx.clientKey } })
SITE   → prisma.site.findMany({ where: { id: ctx.siteId } })
```

---

## 6. 파일 구조 (계획)

```
apps/backend/src/
├── modules/
│   └── auth/
│       ├── auth.routes.ts        # POST /auth/login
│       ├── auth.service.ts       # 로그인 로직, JWT 발급
│       ├── auth.schema.ts        # Zod 스키마 (loginBody 등)
│       └── auth.types.ts         # UserContext 타입 정의
├── middleware/
│   ├── authenticate.ts           # JWT 파싱 → request.user 주입
│   └── requireRole.ts            # 역할 기반 접근 제어
├── services/
│   ├── siteService.ts            # (수정) UserContext 파라미터 추가
│   └── deviceService.ts          # (수정) UserContext 파라미터 추가
└── routes/
    ├── sites.ts                  # (수정) authenticate + ctx 전달
    └── devices.ts                # (수정) authenticate + ctx 전달
```

---

## 7. API 엔드포인트 변경 계획

### 신규 엔드포인트

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| `POST` | `/auth/login` | 로그인, JWT 발급 | 없음 |
| `GET` | `/auth/me` | 현재 로그인 사용자 정보 | 필요 |

### 관리자 전용 계정 관리 (ADMIN only)

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/admin/users` | 전체 계정 목록 |
| `POST` | `/admin/users` | 계정 생성 (ADMIN이 직접 생성) |
| `PATCH` | `/admin/users/:id` | 계정 수정 (비밀번호 리셋, 활성화/비활성화) |
| `DELETE` | `/admin/users/:id` | 계정 삭제 |

### 기존 엔드포인트 변경사항

| Endpoint | 변경 사항 |
|----------|----------|
| `GET /sites` | JWT 인증 + UserContext 기반 필터링 추가 |
| `GET /sites/:siteId` | JWT 인증 + 접근 권한 검사 추가 |
| `GET /devices` | JWT 인증 + UserContext 기반 필터링 추가 |
| `GET /devices/:id` | JWT 인증 + 접근 권한 검사 추가 |
| `GET /devices/:id/readings` | JWT 인증 + 접근 권한 검사 추가 |
| `POST /receiver` | 변경 없음 (HMI 수신 엔드포인트, 별도 API Key 검토 가능) |

---

## 8. 보안 고려사항

### 필수

- **비밀번호 해싱**: `bcrypt` (cost factor 12) 사용
- **JWT Secret**: 환경 변수로 관리 (`JWT_SECRET`), 최소 32바이트 랜덤 문자열
- **비활성 계정 차단**: `user.isActive === false` 시 로그인 거부
- **에러 메시지 통일**: 로그인 실패 시 "아이디 또는 비밀번호가 올바르지 않습니다" (사용자 존재 여부 노출 금지)

### 권장

- **HTTPS 강제**: 프로덕션에서 HTTP 비허용
- **Rate Limiting**: 로그인 엔드포인트에 분당 요청 제한 (e.g. `@fastify/rate-limit`)
- **`/receiver` 엔드포인트**: HMI 장비 전용이므로 API Key 또는 IP Allowlist 검토

---

## 9. 의존성 추가 (예상)

```json
{
  "dependencies": {
    "@fastify/jwt": "^8.x",       // JWT 파싱/검증
    "bcryptjs": "^2.x"            // 비밀번호 해싱
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.x"
  }
}
```

---

## 10. 구현 순서 (권장)

1. **Prisma 스키마 수정**: `User` 모델 + `UserRole` enum 추가 → migration
2. **Auth 서비스**: 로그인 로직 + JWT 발급
3. **Middleware**: `authenticate` (JWT 파싱), `requireRole` (역할 체크)
4. **Auth 라우트**: `POST /auth/login`, `GET /auth/me`
5. **서비스 레이어 수정**: `siteService`, `deviceService`에 `UserContext` 적용
6. **라우트 수정**: 기존 라우트에 미들웨어 연결
7. **Admin 계정 관리 라우트**: `GET/POST/PATCH/DELETE /admin/users`
8. **초기 ADMIN 계정 시드**: 첫 실행 시 관리자 계정 자동 생성 스크립트

---

## 11. 열린 질문 (검토 필요)

1. **`/receiver` 보호**: HMI 장비 통신 엔드포인트를 별도 인증 방식(API Key)으로 보호할지?
2. **비밀번호 초기값**: ADMIN이 계정 생성 시 임시 비밀번호 설정 방식 (랜덤 생성 후 전달 vs. 관리자가 직접 입력)?
3. **Refresh Token**: MVP에서 제외하고 추후 추가할지?
4. **다중 현장 CLIENT**: 한 건설사 계정이 특정 Site만 볼 수 있어야 하는 예외 케이스가 존재하는지? (현재 설계는 CLIENT = 전체 자사 Site)
5. **Frontend 연동**: 프론트엔드에서 토큰을 어디에 저장할지? (localStorage vs. httpOnly cookie)
