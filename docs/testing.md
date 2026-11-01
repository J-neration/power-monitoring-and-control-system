# 자동화 테스트 (회귀 테스트)

코드를 고치거나 기능을 더한 뒤 **기존 기능이 그대로 동작하는지** 자동으로 확인한다.
모든 PR 과 main·dev push 에서 GitHub Actions(`Tests` 워크플로)가 돌고, 실패하면 푸시한 사람에게 메일이 간다.

## 한눈에 보기

| 층 | 무엇을 확인하나 | 명령 | DB | 소요 |
|---|---|---|---|---|
| 단위 | 순수 로직 — 상태 판정, 용량 계산, 비밀번호 정책, 명령 규칙, 프론트↔백엔드 규칙 일치 | `yarn test:unit` | 불필요 | ~3초 |
| API 통합 | 실제 Postgres 위에서 API 전체 — 권한, HMI 수신, 고장, 원격 명령, 설정, WebSocket | `yarn test:integration` | 테스트 DB | ~10초 |
| 브라우저 E2E | 실제 브라우저로 로그인 → 대시보드 → 현장 → 장치, 고객사 계정 격리, 관리자 패널 | `yarn test:e2e` | 테스트 DB | ~1–2분 (빌드 포함) |

`yarn test` = 단위 + API 통합, `yarn test:all` = 전부.

## 처음 한 번

```bash
yarn install
yarn test:db:start              # Docker 로 테스트 DB 실행 (localhost:5433, 메모리 전용)
npx playwright install chromium # E2E 를 돌릴 때만
```

Docker Desktop 이 켜져 있어야 한다. 테스트 DB 는 개발 DB(5432)와 별개이며 컨테이너를 내리면 데이터가 사라진다.
다 쓰면 `yarn test:db:stop`.

## 자주 쓰는 명령

```bash
yarn test                                        # 커밋 전 기본 확인
yarn test:unit                                   # DB 없이 빠르게
yarn test:integration -- --test-name-pattern="login"   # 이름으로 골라 실행
yarn workspace @pmcs/backend test                # 백엔드 단위만
yarn workspace @pmcs/frontend test               # 프론트 단위만

yarn test:e2e                                    # 프론트를 빌드한 뒤 E2E
E2E_SKIP_BUILD=1 yarn test:e2e                   # 화면 코드를 안 고쳤으면 직전 빌드 재사용
yarn test:e2e --ui                               # 브라우저를 보면서 단계별 디버깅
npx playwright show-report                       # 마지막 E2E 결과 (실패 스크린샷·trace)
```

pre-push 훅(`yarn hooks:install`)은 변경된 쪽의 **단위 테스트**까지 푸시 전에 돌린다.
DB 가 필요한 통합·E2E 는 CI 가 맡는다.

## 안전장치 — 운영 DB 는 절대 건드리지 않는다

테스트는 매 케이스마다 **모든 테이블을 비운다.** 그래서 다음 두 조건을 모두 만족하는 DB 에서만 돈다.

1. 호스트가 로컬 (`localhost` / `127.0.0.1`)
2. DB 이름에 `test` 가 들어감

기본값은 `postgresql://pmcs:pmcs@localhost:5433/pmcs_test` 이고, 바꾸려면 `TEST_DATABASE_URL` 을 지정한다.
Neon·RDS 주소를 넣으면 시작하기 전에 거부한다 (`apps/backend/test/testDatabase.ts`).

테스트는 `.env*` 파일을 읽지 않는다. 마이그레이션도 `.env` 를 읽는 `prisma.config.ts` 대신
`prisma.test.config.ts` 로 돌려서, 로컬 `.env.development` 의 Neon 주소로 바뀌는 일이 없다.
SMTP·웹훅 환경변수도 지우고 시작하므로 테스트 중 실제 알림 메일이 나가지 않는다.

## 파일 위치

```
scripts/run-tests.mjs                       *.test.ts 를 모아 node:test 로 실행 (Node 20/22, Windows 공통)

apps/backend/src/**/*.test.ts               백엔드 단위 테스트 (대상 파일 옆에)
apps/backend/test/
  testDatabase.ts                           테스트 DB 주소 + 안전장치
  run-integration.ts                        yarn test:integration 진입점 (마이그레이션 → 순차 실행)
  integration/
    setup.ts                                테스트 프로세스 환경 고정 (가장 먼저 로드)
    helpers/app.ts                          useTestApp(), http(), hmi()
    helpers/fixtures.ts                     seedWorld(), createUser(), telemetryPayload() …
    *.test.ts                               API 통합 테스트
  e2e/server.ts, seed.ts                    E2E 용 백엔드 (시작 시 DB 초기화 + 시드)

apps/frontend/src/**/*.test.ts              프론트 단위 테스트
  lib/backendParity.test.ts                 프론트·백엔드에 복사된 규칙이 같은지

playwright.config.ts                        E2E 설정 (백엔드 4100 · 프론트 3100)
e2e/*.spec.ts                               브라우저 시나리오
```

## 테스트 추가하기

### 원칙

- **버그를 고치면 그 버그를 재현하는 테스트를 먼저 쓴다.** 고치기 전에는 실패하고, 고친 뒤에 통과해야 한다.
  같은 버그가 다시 들어오면 CI 가 막는다.
- **새 API 를 만들면 통합 테스트를 같이 만든다.** 관리자 전용이면 `authorization.test.ts` 의
  `ADMIN_ONLY` 목록에도 한 줄 추가한다 — 빠뜨리면 권한이 열려도 아무도 모른다.
- 화면 흐름이 바뀌면 `e2e/` 시나리오를 고친다. E2E 는 느리므로 핵심 흐름만 둔다. 세부 규칙은 단위·통합에서 확인한다.

### API 통합 테스트 예시

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hmi, http, useTestApp } from "./helpers/app.js";
import { IDS, seedWorld, telemetryPayload } from "./helpers/fixtures.js";

const t = useTestApp(); // 서버 생성 · 매 테스트 전 DB 초기화 · 종료 정리

describe("GET /devices/:id", () => {
  it("shows the latest telemetry to the site's own account", async () => {
    const { tokens } = await seedWorld(t.app); // 롯데/GS 현장, ADMIN·CLIENT·SITE 계정
    await hmi(t.app).post("/receiver", telemetryPayload({ vL1: 230 }));

    const res = await http(t.app).get(`/devices/${IDS.lotteInst}`, { token: tokens.client });

    assert.equal(res.statusCode, 200);
    assert.equal(res.json().device.vL1, 230);
  });
});
```

- `http(app)` 은 사용자 요청(`token` 을 주면 Bearer 헤더), `hmi(app)` 은 장비 요청(`x-api-key`).
- 환경변수로 동작이 바뀌는 코드는 테스트 안에서 `process.env.X = ...` 로 켜고 `afterEach` 에서 지운다
  (`receiver-telemetry.test.ts` 의 `RECEIVER_REQUIRE_ICCID` 참고).

### 알려진 문제를 표시하기

지금 고칠 수 없는 문제는 테스트를 지우지 말고 `todo` 로 둔다. 실행은 되지만 CI 를 실패시키지 않고,
결과에 계속 보인다. 고친 뒤 `todo` 를 지우면 그때부터 다시 새는 것을 막는다.

```ts
it("hides the SIM ICCID from non-admins on /devices too", { todo: "이유" }, async () => { ... });
```

## CI 에서 실패했을 때

- GitHub → Actions → 실패한 실행 → 각 잡의 **Summary** 에 원인과 로컬 재현 명령이 있다.
- E2E 실패는 **Artifacts → playwright-report** 를 받아 `npx playwright show-report playwright-report` 로 열면
  실패 순간 스크린샷과 단계별 trace(네트워크·콘솔 포함)를 볼 수 있다.
- 의도한 동작 변경이라면 테스트의 기대값을 바꾼다. 의도하지 않았다면 그게 바로 회귀다.
