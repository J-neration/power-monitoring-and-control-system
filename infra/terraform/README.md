# PMCS AWS 인프라 (Terraform)

PMCS를 AWS 서울 리전(`ap-northeast-2`)으로 옮기기 위한 인프라 코드입니다.
이 디렉터리는 Railway(`watchPatterns`)·Docker 이미지·Netlify(`base = apps/frontend`)
어디에도 포함되지 않으므로, 여기만 바꾼 커밋은 현재 운영 배포에 영향을 주지 않습니다.

## 구조

```
infra/terraform/
  modules/              재사용 모듈 (dev·prod가 같은 코드를 씀)
    state-backend/      상태 저장 S3 버킷 + KMS 키
    security-baseline/  CloudTrail, GuardDuty, Security Hub, Config, 보안 경보 SNS, 계정 기본 보호
    network/            VPC, public·private·isolated 서브넷 × 2 AZ, NAT, S3 엔드포인트, Flow Logs
    database/           RDS PostgreSQL 16 (isolated 서브넷, KMS, SSL 강제, 백업 14일)
    ecr/                이미지 저장소 (태그 불변, 푸시 시 스캔, KMS)
    ecs-service/        Fargate 서비스 하나 + 실행·태스크 역할 + 로그 그룹
    edge/               ALB, WAF, ALB 접근 로그, (도메인이 정해지면) ACM·HTTPS 리스너
  envs/
    dev/                pmcs-dev 계정(035680193225)
      bootstrap/        상태 저장소. 가장 먼저, 한 번만
      security/         계정 보안 기반
      box/              dev 서버 1대형: EC2 + docker compose, ECR (scripts/dev-box/README.md)
    prod/               pmcs-prod 계정(887664351558). "필수 보안형"(ECS·ALB·WAF·RDS, NAT 없음)
      bootstrap/        상태 저장소. 가장 먼저, 한 번만
      security/         계정 보안 기반 (CloudTrail·GuardDuty. Security Hub·Config 는 꺼 둠)
      dns/              pqms.co.kr Route 53 영역 (가비아에서 옮김). 컷오버 때 app_target 으로 화면 주소를 바꿈
      app/              ECS·ALB·WAF·RDS·ECR·시크릿·알람
```

dev 적용 순서는 `bootstrap` → `security` → `box`입니다. 루트끼리 서로의 상태를 참조하지 않아 따로 plan·apply할 수 있습니다.

prod 는 `bootstrap` → `security` → `dns` → **가비아 네임서버를 dns 출력 `name_servers` 로 변경** → `app` 순서입니다.
app 의 인증서는 Route 53 에 검증 레코드를 만들어 검증하므로, 네임서버가 Route 53 으로 넘어간 뒤에야 apply 가 끝납니다.
app 은 dns 루트가 만든 영역을 이름(`pqms.co.kr`)으로 찾고, dns 루트는 컷오버 때(`app_target = "aws"`) ALB 를 이름(`pmcs-prod-alb`)으로 찾습니다.

## dev 와 prod

dev 는 비용 때문에 서버 1대(`envs/dev/box`, 월 약 $22)로 돈다. 2026-10-22~23 에는 prod 와 같은 모듈로 만든
ECS·ALB·RDS dev(`envs/dev/app`)를 실제로 돌려 검증했고, 서버 1대형으로 옮긴 뒤 지웠다(코드는 git 이력, 커밋 7494501).
prod 의 app 루트(`envs/prod/app`)는 그 코드를 바탕으로 작성했다. 그때 확인한 것:

- **도메인·인증서**: 가비아 DNS 는 apex 를 ALB 에 연결할 수 없어, prod 는 pqms.co.kr 를 Route 53 으로 옮긴다(`envs/prod/dns`).
  edge 모듈에 `route53_zone_id` 를 주면 ACM 검증 레코드를 직접 만든다.
- **HMI 요청**: 펌웨어(Quectel 모뎀)가 HTTP 헤더를 직접 만들며 User-Agent 를 보내지 않는다. WAF 는 User-Agent 없는 요청을
  `/receiver` 밖에서만 막는다(edge 모듈 `block_no_user_agent_outside_receiver`). 현장 장비는 Railway 중계를 거쳐 오므로
  WAF 에는 Railway IP 몇 개로 보인다 — 속도 제한은 장비 전체 합계 기준.
- **시크릿 값**: Terraform 은 빈 시크릿만 만들고 값은 콘솔·스크립트로 넣는다.
  `<env>/api`: `DATABASE_URL`, `MIGRATE_DATABASE_URL`, `RECEIVER_API_KEY`, `CRITICAL_FAULT_WEBHOOK_URL` /
  `<env>/jwt`: `JWT_SECRET` / `<env>/alert-mail`: `SMTP_*`, `ALERT_EMAIL_TO`.
- **CPU 아키텍처**: ARM64(Graviton). 이미지는 `docker buildx build --platform linux/arm64 --provenance=false --sbom=false`
  로 단일 매니페스트를 올려야 ECR 기본 스캔이 된다. API 는 `apps/backend/Dockerfile`(Railway 용 루트 `Dockerfile` 아님).
- **마이그레이션**: API 는 부팅 시 마이그레이션을 하지 않고 `scripts/aws-migrate/run-migrate-task.sh` 로 따로 돌린다.
  Prisma 마이그레이션 엔진은 `sslcert` 의 첫 인증서만 읽으므로 서울 RDS 루트 하나만 든 파일을 쓴다(`scripts/aws-migrate/lib.sh`).
- **ECS 서비스는 리스너 규칙보다 먼저 만들어지면 실패**한다(대상 그룹이 ALB 에 안 붙음) → edge 출력에 `depends_on`.
- **GuardDuty 런타임 감시**가 ECS 태스크에 사이드카를 붙이고, VPC 에 인터페이스 엔드포인트를 만든다.
  컨테이너는 이름으로 찾고, VPC 를 지울 때는 그 엔드포인트를 먼저 지운다.
- **보안 경보 이메일**: 저장소가 공개라 코드에 두지 않고 SSM 파라미터 `/<env>/security/alert-emails`(StringList)에서 읽는다.

계정마다 상태 버킷과 KMS 키가 따로 있고, 루트(bootstrap·security·app)마다 상태 파일이
따로 있어 한 루트의 실수가 다른 루트의 리소스를 건드리지 않습니다.
각 루트의 프로바이더는 `allowed_account_ids`로 대상 계정을 고정하므로, 다른 계정의
자격 증명으로 실행하면 plan 단계에서 멈춥니다.

## 실행 방법

자격 증명은 코드에 넣지 않습니다. AAM 포털에서 `PmcsDevAdmin` 세션을 연 뒤
`aws login --profile pmcs-dev`로 로그인하고 아래처럼 실행합니다.
prod 는 `PmcsProdAdmin` 세션과 `--profile pmcs-prod`, `envs/prod/<루트>` 로 같은 순서입니다.

```sh
export AWS_PROFILE=pmcs-dev
aws sts get-caller-identity          # assumed-role/PmcsDevAdmin, 035680193225 확인
cd infra/terraform/envs/dev/<루트>
terraform init
terraform plan -out=<루트>.tfplan    # 결과와 월 비용을 검토·승인받은 뒤에만
terraform apply <루트>.tfplan
```

## bootstrap 최초 적용 순서

상태 버킷이 아직 없으므로 bootstrap은 처음에 로컬 상태로 적용하고, 버킷이 생기면
그 안으로 자기 상태를 옮깁니다.

1. `envs/dev/bootstrap`에서 `terraform init` → `plan` → `apply` (로컬 상태)
2. 아래 `backend.tf`를 추가하고 `terraform init -migrate-state`
3. 로컬의 `terraform.tfstate*` 파일 삭제 (상태는 이제 S3에 있음)

```hcl
terraform {
  backend "s3" {
    bucket       = "pmcs-dev-tfstate-035680193225"
    key          = "bootstrap/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    kms_key_id   = "alias/pmcs-dev-tfstate"
    use_lockfile = true
  }
}
```

다른 루트도 같은 버킷을 쓰고 `key`만 `security/terraform.tfstate`,
`box/terraform.tfstate`로 바꿉니다. 잠금은 S3 네이티브 잠금(`use_lockfile`)이라
DynamoDB 테이블이 필요 없습니다.

## 지키는 규칙

- 리소스를 만들거나 바꾸기 전에는 항상 `plan` 결과와 월 예상 비용을 검토받습니다.
- 상태 버킷은 `prevent_destroy`로 보호합니다. 지우려면 코드에서 먼저 풀어야 합니다.
- 상태·플랜 파일(`*.tfstate`, `*.tfplan`)과 `.terraform/`은 커밋하지 않습니다.
  `.terraform.lock.hcl`은 프로바이더 버전 고정용이라 커밋합니다.
- 비밀 값은 Terraform 변수나 코드에 넣지 않고, Secrets Manager에 직접 입력합니다.
