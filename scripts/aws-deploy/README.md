# prod 배포

main 에 앱 코드(`apps/**`, `package.json`, `yarn.lock`)가 병합되면 GitHub Actions
[`deploy-prod.yml`](../../.github/workflows/deploy-prod.yml)이 돈다.

1. **이미지** — [`build-images.yml`](../../.github/workflows/build-images.yml)(dev 와 공용)이 arm64 이미지
   `<커밋 7자리>-arm64` 를 ECR `pmcs-prod/{api,frontend}` 에 올리고, 스캔에서 Critical 이 있으면 멈춘다.
2. **승인** — 배포 잡은 GitHub 환경 `aws-prod` 에서 돈다. 승인자가 Actions 화면에서 **Review deployments → Approve**
   해야 진행된다. 이미지 잡의 실행 요약에 스캔 결과가 있다.
3. **배포** — [`ecs-deploy.sh`](ecs-deploy.sh): 마이그레이션 태스크 실행 → api·frontend 서비스 교체(안정될 때까지 대기)
   → SSM `/pmcs-prod/app/image-tag` 에 태그 기록. 새 태스크가 뜨지 못하면 ECS 가 이전 버전으로 되돌리고 실패로 끝난다.
4. **외부 확인** — `app.pqms.co.kr/login` 200, `api.pqms.co.kr/receiver`(키 없음) 401.

권한은 GitHub OIDC 역할 두 개다(`infra/terraform/envs/prod/app/deploy.tf`).

| 역할 | 받을 수 있는 실행 | 할 수 있는 일 | GitHub 시크릿 |
| --- | --- | --- | --- |
| `pmcs-prod-github-build` | main 브랜치 | ECR 두 저장소 푸시·스캔 읽기 | 저장소 `AWS_PROD_BUILD_ROLE_ARN` |
| `pmcs-prod-github-deploy` | 환경 `aws-prod` | 작업 정의 등록, 마이그레이션 실행, 서비스 교체, 태그 기록 | 환경 `aws-prod` 의 `AWS_PROD_DEPLOY_ROLE_ARN` |

환경 `aws-prod` 은 승인자를 두고, 배포 브랜치를 `main` 으로 제한한다(Settings → Environments).

## 되돌리기

- Actions → **Deploy prod** → Run workflow (main) → `tag` 에 이전 태그. 빌드 없이 승인 후 배포한다.
  이전 태그는 배포 실행 요약의 "되돌리기" 줄에 있다.
- 관리자 Mac: `AWS_PROFILE=pmcs-prod AWS_REGION=ap-northeast-2 TAG=<이전 태그> scripts/aws-deploy/ecs-deploy.sh`

마이그레이션은 되돌리지 않는다. 이전 이미지가 새 DB 구조에서 돌 수 있어야 한다(Railway 때와 같다).

## Terraform 과의 관계

배포는 지금 작업 정의를 복사해 이미지만 바꾼 새 버전을 등록한다. Terraform 은 SSM 태그로 작업 정의를 만들고
`track_latest` 로 가장 최근 버전과 비교하므로, 배포가 끝나면 plan 은 No changes 다.
CPU·메모리·환경 변수·시크릿은 Terraform 으로만 바꾼다(tfvars 의 `initial_image_tag` 는 파라미터의 첫 값일 뿐이다).

배포가 중간에 실패해 새 버전만 남으면 plan 에 작업 정의 교체가 보일 수 있다. 서비스를 바꾸기 전에 실패하면
스크립트가 새 버전을 등록 취소한다.

## HMI 수신 키 교체

HMI 수신 키(`RECEIVER_API_KEY`)는 환경마다 하나이고 현장 HMI 펌웨어(`REMOTE_HTTPS_API_KEY_PROD`/`_DEV`)에 들어 있다.
그냥 바꾸면 모든 HMI 가 한꺼번에 끊기므로, 교체하는 동안에는 예전 키를 `RECEIVER_API_KEY_PREVIOUS` 에 두고
둘 다 받는다. [`rotate-receiver-key.sh`](rotate-receiver-key.sh)가 값을 화면에 내지 않고 바꾼다.

1. (prod, 처음 한 번) `PMCS_ENV=prod scripts/aws-deploy/rotate-receiver-key.sh prepare` → `envs/prod/app` apply
   (작업 정의가 `RECEIVER_API_KEY_PREVIOUS` 를 읽게 됨). 키 두 개를 받는 API 코드가 배포돼 있어야 한다.
2. `start` — 새 키를 만들고 예전 키를 옮긴 뒤 API 를 다시 띄운다. 현장 HMI 는 그대로 동작한다.
3. `copy` — 새 키를 클립보드로. 새로 굽는 펌웨어에 넣는다(HOST 는 `api.pqms.co.kr` / `api-dev.pqms.co.kr`).
4. `usage` — 예전 키로 보내는 설비 목록. 현장을 다시 구울 때마다 줄어든다.
5. `finish` — 목록이 비면 예전 키를 지운다. 이때부터 예전 키는 401.

로그에서 직접 볼 때: `filter msg = "Receiver identity resolved" | stats count(*) by installationId, keyVersion`
(`keyVersion` 이 `previous` 면 예전 키). 데이터 외 요청(명령 조회·Ack 등)은 `receiver previous api key used` 한 줄.
