# dev 서버 1대형

pmcs-dev 는 EC2 t4g.small 1대 + docker compose(Caddy · API · 프론트 · PostgreSQL 16)로 돈다. 월 약 $22.
주소는 `https://app-dev.pqms.co.kr`(브라우저), `https://api-dev.pqms.co.kr/receiver`(HMI 수신)이고, 가비아 A 레코드가
서버 고정 IP 를 가리킨다. prod 는 ECS · ALB · WAF · RDS 구성이며(`infra/terraform/modules`), 둘의 차이는 운영 리허설에서 검증한다.

2026-10-23 에 ECS·ALB·RDS 로 된 이전 dev 를 이 서버로 옮기고 지웠다(RDS 최종 스냅샷 `pmcs-dev-db-final` 보관).

| 위치 | 내용 |
| --- | --- |
| `infra/terraform/envs/dev/box/` | VPC · 보안 그룹(80·443만) · EC2 · 데이터 볼륨 · 고정 IP · S3(설정·백업) · SSM 시크릿 자리 · 로그 그룹 · ECR |
| `infra/dev-box/` | 서버에서 쓰는 파일. Terraform 이 S3 `config/` 로 올리고 서버의 `pmcs-deploy` 가 내려받는다 |
| `scripts/dev-box/` | 관리자 Mac 에서 쓰는 스크립트 (이 문서) |
| `scripts/local-dev-db.mjs` | `yarn dev:aws-db` — 로컬 개발을 이 서버 DB 로 (Windows·Mac) |

서버에는 SSH 가 없다. 접속은 SSM(세션 관리자)로만 한다. Postgres 는 서버 안(127.0.0.1)에만 열려 있다.

## 평소 작업

- **배포 (자동)**: dev 에 앱 코드(`apps/**`, `package.json`, `yarn.lock`)가 병합되면 GitHub Actions
  [`deploy-dev-box.yml`](../../.github/workflows/deploy-dev-box.yml)이 arm64 이미지 `<커밋 7자리>-arm64` 를 ECR 에 올리고,
  스캔에서 Critical 이 0건이면 SSM `/pmcs-dev/box/image-tag` 에 태그를 쓴 뒤 서버에서 `pmcs-deploy` 를 실행한다.
  권한은 GitHub OIDC 역할 `pmcs-dev-github-deploy`(dev 브랜치 전용, `envs/dev/box/deploy.tf`)로 받는다.
  수동 실행은 Actions → Deploy dev box → Run workflow (dev 브랜치).
- **되돌리기**: `TAG=<이전 태그> scripts/dev-box/deploy.sh`. 이전 태그는 Actions 실행 요약에 적혀 있다.
  설정·시크릿만 바꿨다면 `scripts/dev-box/deploy.sh` (지금 태그로 다시 배포).
  tfvars 의 `initial_image_tag` 는 파라미터의 첫 값일 뿐이라, 바꿔도 배포되지 않는다.
- **로그**: CloudWatch 로그 그룹 `/pmcs-dev/box/{api,frontend,caddy,postgres}`.
  API 의 "request completed" 줄에는 URL 이 없으니, 같은 `reqId` 의 "incoming request" 줄과 맞춰 본다.
- **서버 셸**: `aws ssm start-session --target <instance_id>` 후 `sudo -i`.
  compose 는 `docker compose --project-name pmcs --project-directory /opt/pmcs/config -f /opt/pmcs/config/compose.yml ...`.
- **비밀 값**: SSM 파라미터 `/pmcs-dev/box/env`(KEY='value' 한 줄씩). 고친 뒤 `deploy.sh`.
  DB 비밀번호 5개는 Postgres 를 처음 만들 때만 적용되므로 여기서 바꾸지 않는다.
- **주소를 바꾸거나 더할 때**: tfvars 의 `app_hosts`·`api_hosts` → apply → `deploy.sh` → 가비아 A 레코드.
  레코드가 생기기 전에 Caddy 가 인증서 발급에 실패하면 재시도 간격이 길어지므로, 레코드를 만든 뒤
  서버에서 `... restart caddy` 로 바로 다시 받게 한다. 인증서는 RSA 2048(HMI 호환, Caddyfile `key_type`).

## DB 보기 · 로컬 개발

`yarn dev:aws-db` 가 이 서버 Postgres 를 이 PC 의 `127.0.0.1:15432` 로 연다(SSM 포트 포워딩, 창을 닫으면 끝남).

- 로컬 개발: 그 창을 열어 둔 채 다른 터미널에서 `yarn dev`. 계정은 `pmcs_local`(데이터 읽기·쓰기만, 연결 20개·쿼리 60초).
  **로컬에서 바꾼 데이터는 dev 서버에 바로 반영된다.**
- 데이터 둘러보기(TablePlus 등): 같은 창을 연 채 Host `127.0.0.1`, Port `15432`, Database `pmcs`, SSL 끔,
  사용자 `pmcs_readonly`, 비밀번호는 `/pmcs-dev/box/env` 의 `READONLY_DB_PASSWORD`. 조회만 된다.

## 백업 · 복원

매일 03:00 KST 에 `pg_dump -Fc` → `s3://pmcs-dev-box-035680193225/backups/` (14일 보관). 서버 역할은 올리기만 할 수 있다.

복원(서버 셸, root). 백업 파일은 관리자 Mac 에서 받아 서버로 옮기거나, 서버에서 받을 수 있게 잠시 권한을 준다.

```sh
C="docker compose --project-name pmcs --project-directory /opt/pmcs/config -f /opt/pmcs/config/compose.yml"
$C stop api frontend
$C exec -T postgres pg_restore -U postgres -d pmcs --clean --if-exists --no-owner --role=pmcs_migrator < pmcs-<시각>.dump
pmcs-deploy
```

`--role=pmcs_migrator` 로 복원해야 테이블 주인이 마이그레이션 계정이 되고, 앱 계정 권한이 자동으로 붙는다
(로컬 Postgres 에서 2026-10-23 백업으로 확인).

## 서버를 새로 만들 때

1. `envs/dev/box` 를 plan → 승인 → apply. 데이터 볼륨(`/data`)이 남아 있으면 DB 와 인증서도 그대로 붙는다.
2. 시크릿 파라미터가 비어 있으면 `scripts/dev-box/init-env.sh` (RECEIVER_API_KEY 는 HMI 값을 환경 변수로).
3. `scripts/dev-box/deploy.sh`. DB 가 비어 있으면 앱을 띄우지 않으니 위 복원 후 다시, 또는 `ALLOW_EMPTY_DB=1`.
