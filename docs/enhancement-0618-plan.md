# Enhancement 0618 - 작업 계획서

> 브랜치: `enhancement/0618`
> 피드백 5개 항목. 난이도 순: **4 → 3 → 5 → 1 → 2**
> 작은 항목부터 구현하고 항목별로 커밋한다.

---

## 4. Analytics 탭 — 24시간 기준으로 변경 ⭐ 가장 간단

**현상**: Analytics 탭이 "24시간 이력"이라고 표기하면서 실제로는 **336시간(14일)** 데이터를 조회·표시한다.

**원인**:
- `apps/frontend/src/app/(main)/devices/[id]/page.tsx:20` — `const HISTORY_HOURS = 336;`
- 이 값이 `fetchReadings(id, HISTORY_HOURS)`와 `DeviceDetailTabs`의 `hours` prop으로 전달됨
- `DeviceDetailTabs.tsx:135` 헤더는 "24시간 이력 — 최근 {hours}시간" → "24시간 이력 — 최근 336시간"으로 모순 표기

**수정 방안**:
- `HISTORY_HOURS = 336` → `24`
- `DeviceDetailTabs.tsx:135-138` 헤더 문구 정리: "24시간 이력 — 최근 24시간"의 중복 제거 (예: "최근 24시간 이력")
- `DeviceHistoryCharts`는 전달받은 readings를 그대로 렌더하므로 추가 수정 불필요 (`hours`는 라벨·조회 윈도우용)

**수정 파일**:
| 파일 | 변경 |
|------|------|
| `apps/frontend/src/app/(main)/devices/[id]/page.tsx` | `HISTORY_HOURS` 336 → 24 |
| `apps/frontend/src/components/DeviceDetailTabs.tsx` | Analytics 헤더 문구 정리 |

**검증**: 장비 상세 → Analytics 탭에서 최근 24시간 데이터만 표시되는지, 차트 라벨이 "last 24h"인지 확인.

---

## 3. 계정 정보 변경

**요청 계정**:
| 역할 | username | password | clientKey |
|------|----------|----------|-----------|
| Admin | `admin` | `primernd1!` | — |
| Lotte (CLIENT) | `lotte` | `lttadmin1!` | `lotte` |
| Coupang (CLIENT) | `coupang` | `cpngadmin1!` | `coupang` |

**현황** (`apps/backend/prisma/seed.ts`):
- `admin / abc123` (251~257행)
- `lotte / test1234` (clientKey=`lotte`)
- `datacenteradmin / test1234` (clientKey=`datacenter`)
- **`coupang` 계정·클라이언트는 코드/DB 어디에도 없음** → 신규 생성 필요

**적용 방식**: 시드 파일 수정 + coupang 클라이언트 추가 (코드 기준 관리)

**수정 방안**:
1. `seed.ts` ADMIN 블록: 비밀번호 `abc123` → `primernd1!`
   - 단, 현재 ADMIN은 "이미 존재 시 스킵" 로직 → 비밀번호가 갱신되지 않음. **기존 계정도 비밀번호를 강제 동기화**하도록 수정하거나, 시드 재실행 시 update 처리 추가.
2. `lotte` 비밀번호 `test1234` → `lttadmin1!`
3. `coupang` CLIENT 계정 신규 추가 (clientKey=`coupang`)
4. **coupang용 Site 필요**: clientKey 필터가 `Site.client` 값과 매칭되므로(스키마 `Site.client`), coupang 계정이 볼 현장이 없으면 빈 화면. coupang 소속 Site를 최소 1개 정의(`client = "coupang"`)하거나, 기존 현장 중 하나를 coupang으로 지정할지 **확인 필요**.
5. DEV 계정 동기화 블록(284~293행)이 username 기준으로 항상 동기화하므로, 비밀번호도 동기화 대상에 포함시킬지 검토 (현재는 role·clientKey만 동기화).

**수정 파일**:
| 파일 | 변경 |
|------|------|
| `apps/backend/prisma/seed.ts` | admin/lotte 비밀번호, coupang 계정+clientKey, (필요 시) coupang Site |

**미결정 사항**:
- coupang 계정이 접근할 Site를 어떻게 구성할지 (신규 더미 현장 vs 기존 현장 재지정)
- 운영 DB 반영 여부 (이번엔 시드 기준이므로, 배포 환경에서 `db:seed` 재실행 또는 Admin UI로 별도 반영 필요)

**검증**: `yarn db:seed` 후 3개 계정으로 로그인, 각 권한별 화면(admin 전체 / lotte·coupang 각 clientKey 현장) 확인.

---

## 5. Faults 탭 자동 해제 정책

**현상**: 한 번 발생한 fault가 계속 활성(빨간색)으로 남는다.

**핵심 원인**:
- `DeviceDetailTabs.tsx:77` — `const hasFaults = faults.length > 0;`
- `faultService.getFaults()`는 `FaultEvent`(이력) + `ModuleFaultState`(현재 상태)를 **해제 여부와 무관하게 모두 병합**해 반환 → CLEAR된 것도 카운트되어 항상 빨간색

**적용할 정책** (4가지 모두):
1. **HMI CLEAR 수신 시 즉시 해제** — `ModuleFaultState.lastEvent === "CLEAR"`(즉 `resolvedAt != null`)이면 비활성. (이미 데이터엔 있으나 UI가 무시 중 → 가장 중요한 버그)
2. **사용자 Acknowledge 시 해제** — Admin이 "확인" 버튼 클릭 시 해당 fault를 ack 처리.
3. **일정 시간 경과 시 자동 해제** — 마지막 갱신(`updatedAt`) 후 **N시간(기본 24h)** 재발생 없으면 자동 비활성. N은 상수로 관리.
4. **활성 fault 0건이면 Faults 탭 회색** — 위 조건으로 활성 fault가 없으면 빨강이 아닌 일반 회색 탭으로 표시.

**구현 설계**:

*백엔드 — 스키마 (`schema.prisma` ModuleFaultState)*
- 필드 추가: `acknowledgedAt DateTime?`, `acknowledgedBy String?`
- 마이그레이션 1건 추가 (`add_module_fault_acknowledge`)

*백엔드 — 활성 판정 로직 (`faultService.ts`)*
- "활성(active)" 정의 헬퍼 도입:
  ```
  active = lastEvent === "RAISE"
           && acknowledgedAt == null
           && (now - updatedAt) < AUTO_CLEAR_MS   // 기본 24h
  ```
- `getFaults` 반환 row에 `active: boolean`, `acknowledgedAt`, `resolvedAt` 등 상태 필드 노출
- `FaultEvent`(순수 이력)는 항상 비활성으로 취급(과거 로그)
- Acknowledge 서비스 추가: `acknowledgeFault({ installationId, faultCode | id, username })` → `acknowledgedAt = now`, `acknowledgedBy = username`

*백엔드 — 라우트*
- `POST /devices/:id/faults/:faultId/ack` (ADMIN 전용, JWT 검증) 또는 receiver 경로와 분리된 admin 경로
- 프론트 프록시: `apps/frontend/src/app/api/.../ack/route.ts` (쿠키→Bearer 변환, 기존 receiver 프록시 패턴 참고)

*프론트엔드*
- `lib/api.ts` `FaultEvent` 타입에 `active`, `acknowledgedAt` 추가
- `DeviceDetailTabs.tsx`: `hasFaults` → `hasActiveFaults = faults.some(f => f.active)` 로 교체. 탭 클래스 `device-tab-btn-fault`와 카운트 배지를 active 기준으로.
- `DeviceFaultHistory.tsx`: 각 행에 상태 칩(활성/해제/확인됨) + 활성 행에 "확인(Acknowledge)" 버튼 추가, 클릭 시 ack API 호출 후 `router.refresh()`
- 회색 처리: active 0건이면 다른 탭과 동일한 기본 스타일 (globals.css의 `.device-tab-btn-fault` 적용 조건만 바꾸면 됨)

**수정 파일**:
| 파일 | 변경 |
|------|------|
| `apps/backend/prisma/schema.prisma` | ModuleFaultState에 ack 필드 |
| `apps/backend/prisma/migrations/...` | 신규 마이그레이션 |
| `apps/backend/src/services/faultService.ts` | active 판정 + acknowledge 서비스 |
| `apps/backend/src/routes/devices.ts` | ack 라우트 |
| `apps/frontend/src/lib/api.ts` | FaultEvent 타입 + ack 호출 |
| `apps/frontend/src/app/api/.../ack/route.ts` | 프록시 라우트 |
| `apps/frontend/src/components/DeviceDetailTabs.tsx` | hasActiveFaults |
| `apps/frontend/src/components/DeviceFaultHistory.tsx` | 상태 칩 + Acknowledge 버튼 |
| `apps/frontend/src/app/globals.css` | 활성/해제 칩 스타일 |

**미결정 사항**: 자동 해제 시간 N의 기본값(현재 24h 제안).

**검증**: RAISE → 빨강 + 카운트 / CLEAR 수신 → 회색 / Acknowledge 클릭 → 회색 + "확인됨" 칩 / 24h 경과 시뮬레이션(updatedAt 과거로) → 회색.

---

## 1. 보안 강화

**현재 양호한 점**: 로그인 쿠키 `httpOnly` + `sameSite=lax` + prod `secure`, 로그인 실패 메시지 단일화(정보 노출 방지), 백엔드 CORS origin 제한 + credentials.

**개선 항목**:

1. **미들웨어 토큰 검증 부재** (`apps/frontend/src/middleware.ts`)
   - 현재 `pmcs_token` **존재 여부만** 검사 → 위조·만료 토큰으로도 페이지 진입 가능(데이터는 백엔드에서 차단되나 UX·정보노출 측면 미흡)
   - 개선: 미들웨어 또는 서버 컴포넌트에서 JWT 서명·만료 검증 (Edge에서 `jose`로 verify, `JWT_SECRET` 공유 필요) 후 실패 시 쿠키 삭제 + `/login` 리다이렉트

2. **보안 헤더 부재**
   - 프론트: `netlify.toml`에 `[[headers]]` 추가 — HSTS, X-Frame-Options(DENY/SAMEORIGIN), X-Content-Type-Options(nosniff), Referrer-Policy, Permissions-Policy, CSP(점진 적용)
   - 백엔드(`server.ts`): `@fastify/helmet` 등록

3. **시크릿 기본값 폴백 제거** (`server.ts:43-45`)
   - `JWT_SECRET`, `RECEIVER_API_KEY`, `FRONTEND_ORIGIN`의 하드코딩 폴백은 dev에서만 허용하고 **prod에선 미설정 시 부팅 실패**하도록 분리 (현재 zod는 통과시킴)

4. **미들웨어 정적자산 우회 경로** (`middleware.ts:13-14`)
   - `.png`/`.ico` `endsWith` 검사를 matcher/`_next` 기반으로 정리해 보호 경로 우회 여지 제거

5. **레이트 리밋** — `/auth/login`, `/receiver/*`에 brute-force 방지 레이트 리밋(`@fastify/rate-limit`) 검토

6. **`/code-review` 또는 `/security-review` 스킬로 변경분 보안 점검** 병행

**수정 파일**:
| 파일 | 변경 |
|------|------|
| `apps/frontend/src/middleware.ts` | JWT 검증 |
| `netlify.toml` | 보안 헤더 |
| `apps/backend/src/server.ts` | helmet, env 폴백 분리, (선택) rate-limit |

**미결정 사항**: CSP 강도(인라인 스크립트/3rd-party 허용 범위), JWT 검증을 Edge 미들웨어에서 할지 서버 컴포넌트에서 할지.

---

## 2. 반응형 UI 지원 (작업량 최대)

**현상**: `apps/frontend/src/app/globals.css`가 4895줄인데 `@media` 쿼리가 **8개뿐** → 모바일/태블릿/대형 모니터 대응 미흡.

**대상 디바이스**:
- 모바일 폰 (~480px / ~768px)
- 태블릿·아이패드 (~768px / ~1024px)
- 일반 Web Browser (데스크탑)
- 대형/고해상도 모니터 (≥1920px, 4K)

**접근 방안 (단계적)**:
1. **브레이크포인트 체계 정의** — CSS 변수/공통 미디어 쿼리 토큰 (예: sm 480, md 768, lg 1024, xl 1440, 2xl 1920)
2. **레이아웃 우선순위 점검** — 대시보드(KoreaMap + Accordion), 사이트 상세, 장비 상세(탭/차트), Admin 패널, AppNav(모바일 햄버거?)
3. 화면별로:
   - 대시보드: 지도/카드 그리드가 좁은 폭에서 1열로 스택
   - 장비 상세 차트: 가로 스크롤 또는 1열, 탭 바 가로 스크롤 대응
   - 테이블(fault/admin): 좁은 폭에서 카드형 또는 가로 스크롤
   - 대형 모니터: 최대 폭 제한 + 여백, 또는 그리드 확장
4. 터치 타깃 크기·폰트 스케일 점검

**수정 파일**: 주로 `globals.css` + 컴포넌트별 클래스. 컴포넌트 구조 변경(모바일 네비 등)이 필요한 경우 해당 `.tsx`.

**진행 제안**: 화면 단위로 쪼개서 점진 적용하고, 실제 디바이스 폭(375/768/1024/1920)에서 확인. 우선순위 화면을 먼저 합의.

**미결정 사항**: 우선 대응 화면 순서, 모바일 네비게이션 형태(햄버거 메뉴 도입 여부).

---

## 작업 순서 요약

1. **4번 Analytics 24h** — 상수 1개 + 라벨 (즉시)
2. **3번 계정** — seed.ts (coupang Site 구성 확인 후)
3. **5번 Faults 정책** — 스키마 마이그레이션 → 백엔드 → 프론트
4. **1번 보안** — 헤더 → JWT 검증 → env 폴백 → (선택) rate-limit
5. **2번 반응형** — 브레이크포인트 정의 후 화면별 점진 적용

각 항목 완료 후 커밋, 항목별로 동작 확인.
