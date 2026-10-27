# Railway 중계

현장 HMI 펌웨어에는 Railway 주소가 고정돼 있다(`REMOTE_HTTPS_HOST_PROD` = `pmcsbackend-production.up.railway.app`).
펌웨어를 바꾸려면 현장에 가야 하므로, 컷오버 때 그 Railway 서비스의 프로그램을 이 중계(Caddy)로 바꿔
HMI 요청을 AWS 로 넘긴다. 같은 서비스·같은 주소를 그대로 쓰므로 **Railway 서비스를 지우면 현장 장비가 끊긴다.**

- `/receiver`, `/receiver/*` → `https://$UPSTREAM_HOST` (Host 를 바꾸고 `x-api-key` 는 그대로 넘긴다)
- `/relay-health` → 200 (Railway 헬스 체크)
- 나머지 → 404
- 접속 로그는 Railway 로그에 남고, 요청 헤더(키 포함)는 빼고 남긴다.

AWS 쪽 `RECEIVER_API_KEY` 는 그 Railway 서비스가 쓰던 키와 같아야 한다(dev: AWS dev 키, prod: Railway prod 키).

## Railway 서비스 설정

Railway 서비스 Settings 에서:

| 항목 | 값 |
| --- | --- |
| Source → Root Directory | `/infra/railway-relay` |
| Config-as-code → Railway Config File | `/infra/railway-relay/railway.toml` |
| Variables | `UPSTREAM_HOST` 추가 (dev `api-dev.pqms.co.kr`, prod `api.pqms.co.kr`) |

기존 변수(DATABASE_URL 등)와 화면의 Custom Start Command(`node apps/backend/...`)는 되돌릴 때를 위해 그대로 둔다.
중계의 시작 명령은 `railway.toml` 의 `startCommand` 가 화면 값보다 우선한다.
포트는 Railway 가 주는 `PORT` 를 그대로 쓴다(백엔드와 같다). 저장 뒤 Deploy 를 누른다.

**되돌리기**: Root Directory 와 Config File 칸을 비우고 다시 Deploy → 저장소 루트의 `railway.toml`(백엔드)로 돌아간다.

## 확인

```sh
curl -s https://<railway 주소>/relay-health                    # ok
RECEIVER_API_KEY=... HOST=<railway 주소> COUNT=3 node scripts/railway-relay/hmi-raw-post.mjs   # 200
```

`hmi-raw-post.mjs` 는 모뎀과 같은 헤더(User-Agent 없음, 인증서 검증 안 함)로 측정값 1건을 보낸다.
기본 장비 `relay-test-01` 은 처음 보내면 "Unknown" 사이트 아래 새로 생긴다.
