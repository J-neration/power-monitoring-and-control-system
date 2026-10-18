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
      app/              앱 인프라 (KMS, 보안 그룹, Secrets, ECS 클러스터와 위 모듈들)
    prod/               pmcs-prod 계정(887664351558). dev 검증 후 같은 모듈로 작성
```

적용 순서는 `bootstrap` → `security` → `app`입니다. `security`와 `app`은 서로의 상태를
참조하지 않아 따로 plan·apply할 수 있습니다.

## app 루트의 현재 상태와 다음 단계

- **도메인 전**: `app_hostname`·`api_hostname`이 비어 있으면 ACM 인증서와 HTTPS 리스너를
  만들지 않고, ALB 80 포트는 모든 요청에 404를 돌려줍니다. ECS 서비스도 ALB에 붙지 않습니다.
- **도메인이 정해지면**: `terraform.tfvars`에 두 주소를 넣고 apply → 출력 `acm_validation_records`의
  CNAME을 DNS에 등록 → 인증서 발급 후 HTTPS 리스너와 경로 규칙이 생깁니다. app·api 주소는
  출력 `alb_dns_name`을 가리키게 합니다.
- **태스크 수**: 이미지와 시크릿 값이 준비되기 전에는 `api_desired_count`·`frontend_desired_count`가
  0이라 Fargate 비용이 들지 않습니다(3단계에서 1로 올림).
- **시크릿 값**: Terraform은 빈 시크릿만 만듭니다. 값은 콘솔에서 직접 입력합니다.
  - `pmcs-dev/api`: `DATABASE_URL`, `MIGRATE_DATABASE_URL`, `RECEIVER_API_KEY`, `CRITICAL_FAULT_WEBHOOK_URL`
  - `pmcs-dev/jwt`: `JWT_SECRET` (백엔드 `JWT_SECRET`, 프론트 `AUTH_JWT_SECRET`에 같이 쓰임)
- **CPU 아키텍처**: Fargate는 ARM64(Graviton)로 돈다(x86보다 약 20% 저렴). 이미지는
  `docker build --platform linux/arm64 ...`로 만든다. Apple Silicon Mac에서는 기본값이다.
- **보안 경보 이메일**: 저장소가 공개라 코드에 두지 않는다. SSM 파라미터
  `/pmcs-dev/security/alert-emails`(StringList, 쉼표 구분)에 넣으면 security 루트가 읽어
  SNS 이메일 구독을 만든다. 구독마다 확인 메일의 링크를 눌러야 경보가 온다.
- **마이그레이션**: API 서비스는 Railway와 달리 부팅 시 마이그레이션을 하지 않습니다.
  배포 때 `pmcs-dev-api-migrate` 작업 정의를 `aws ecs run-task`로 한 번 실행합니다.

계정마다 상태 버킷과 KMS 키가 따로 있고, 루트(bootstrap·security·app)마다 상태 파일이
따로 있어 한 루트의 실수가 다른 루트의 리소스를 건드리지 않습니다.
각 루트의 프로바이더는 `allowed_account_ids`로 대상 계정을 고정하므로, 다른 계정의
자격 증명으로 실행하면 plan 단계에서 멈춥니다.

## 실행 방법

자격 증명은 코드에 넣지 않습니다. AAM 포털에서 `PmcsDevAdmin` 세션을 연 뒤
`aws login --profile pmcs-dev`로 로그인하고 아래처럼 실행합니다.

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
`app/terraform.tfstate`로 바꿉니다. 잠금은 S3 네이티브 잠금(`use_lockfile`)이라
DynamoDB 테이블이 필요 없습니다.

## 지키는 규칙

- 리소스를 만들거나 바꾸기 전에는 항상 `plan` 결과와 월 예상 비용을 검토받습니다.
- 상태 버킷은 `prevent_destroy`로 보호합니다. 지우려면 코드에서 먼저 풀어야 합니다.
- 상태·플랜 파일(`*.tfstate`, `*.tfplan`)과 `.terraform/`은 커밋하지 않습니다.
  `.terraform.lock.hcl`은 프로바이더 버전 고정용이라 커밋합니다.
- 비밀 값은 Terraform 변수나 코드에 넣지 않고, Secrets Manager에 직접 입력합니다.
