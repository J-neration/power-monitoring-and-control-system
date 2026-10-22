# dev 서버 1대형 (B안)

pmcs-dev 를 EC2 t4g.small 1대 + docker compose(Caddy · API · 프론트 · PostgreSQL 16)로 돌린다.
월 약 $22 (ECS · ALB · RDS dev 는 약 $70~80). prod 는 ECS 구성을 그대로 쓴다.

| 위치 | 내용 |
| --- | --- |
| `infra/terraform/envs/dev/box/` | VPC · 보안 그룹(80·443만) · EC2 · 데이터 볼륨 · 고정 IP · S3(설정·백업) · SSM 시크릿 자리 · 로그 그룹 |
| `infra/dev-box/` | 서버에서 쓰는 파일. Terraform 이 S3 `config/` 로 올리고 서버의 `pmcs-deploy` 가 내려받는다 |
| `scripts/dev-box/` | 관리자 Mac 에서 쓰는 스크립트 (이 문서) |

서버에는 SSH 가 없다. 접속은 SSM(세션 관리자)로만 한다. Postgres 는 서버 안(127.0.0.1)에만 열려 있다.

## 처음 만들기와 전환

1. `envs/dev/box` 를 plan → 승인 → apply. 출력 `public_ip` 가 고정 IP 다.
2. 가비아에 시험용 A 레코드 `box-app-dev`, `box-api-dev` → 고정 IP.
3. `scripts/dev-box/init-env.sh` — 시크릿 채우기 (DB 비밀번호 생성, RECEIVER_API_KEY 등은 ECS dev 에서 복사).
4. `scripts/dev-box/deploy.sh` — Postgres 만 뜨고 "DB 가 비어 있다"고 멈추는 것이 정상.
5. 다른 터미널에서 `PMCS_ENV=dev scripts/aws-migrate/open-db-tunnel.sh` (RDS 터널), 이어서
   `scripts/dev-box/copy-from-rds.sh` — RDS → 서버 복사, 행 수 비교.
6. `scripts/dev-box/deploy.sh` — 마이그레이션 확인 후 앱 시작. `https://box-app-dev.pqms.co.kr` 에서 로그인·이력·실시간 확인.
7. 전환: 시험 기간에도 HMI 는 RDS 로 보내므로, 먼저 RDS 터널을 열고
   `REPLACE=1 scripts/dev-box/copy-from-rds.sh && scripts/dev-box/deploy.sh` 로 서버 DB 를 최신으로 바꾼다
   (서버 API 를 멈추고, 기존 데이터 삭제와 복원을 한 트랜잭션으로 한다).
   이어서 `terraform.tfvars` 의 `app_hosts`·`api_hosts` 에 `app-dev`·`api-dev` 를 더해 apply → `deploy.sh`
   → 가비아의 `app-dev`·`api-dev` 를 CNAME(ALB)에서 A(고정 IP)로 바꾼다. 몇 분 안에 Caddy 가 인증서를 받는다.
   HMI 가 Let's Encrypt 인증서를 받아들이는지 수신 로그로 확인한다.
   - 다시 복사한 뒤 레코드가 바뀔 때까지 HMI 가 RDS 에 보낸 몇 건은 옮겨지지 않는다(dev 라 허용).
8. 되돌리기: 가비아 레코드를 다시 CNAME(ALB)로. ECS dev 는 1주일 동안 그대로 둔다.

## 평소 작업

- 배포: `terraform.tfvars` 의 이미지 태그를 바꿔 apply(S3 의 settings.env 갱신) → `scripts/dev-box/deploy.sh`.
- 로그: CloudWatch 로그 그룹 `/pmcs-dev/box/{api,frontend,caddy,postgres}`.
- 백업: 매일 03:00 KST 에 `pg_dump` → `s3://pmcs-dev-box-<계정>/backups/` (14일 보관).
- 서버 셸: `aws ssm start-session --target <instance_id>` 후 `sudo -i`.
  compose 명령은 `docker compose --project-name pmcs --project-directory /opt/pmcs/config -f /opt/pmcs/config/compose.yml ...`.
