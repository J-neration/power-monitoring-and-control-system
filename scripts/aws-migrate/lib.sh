# scripts/aws-migrate 공용 설정·함수. 각 스크립트가 source 하며, 직접 실행하지 않는다.
#
# 공통 환경 변수
#   PMCS_ENV        dev(기본) | prod — 대상 AWS 계정과 리소스 이름(pmcs-<env>-*)을 정한다.
#   AWS_PROFILE     기본 pmcs-<env>
#   TUNNEL_PORT     open-db-tunnel.sh 가 여는 로컬 포트 (기본 15432)
#   TARGET_HOST     RDS 에 닿는 주소. 기본은 터널(host.docker.internal:$TUNNEL_PORT).
#   TARGET_PORT
#   PG_IMAGE        psql·pg_dump 를 실행할 이미지 (기본 postgres:16). 로컬에 psql 설치 불필요.
#   PG_DOCKER_NETWORK  로컬 리허설용: pg 컨테이너를 붙일 Docker 네트워크
#   LOCAL_REHEARSAL=1  로컬 리허설: AWS 호출과 시크릿 쓰기를 건너뛴다(README 참고).

set -euo pipefail

PMCS_ENV="${PMCS_ENV:-dev}"
case "$PMCS_ENV" in
  dev) EXPECTED_ACCOUNT=035680193225 ;;
  prod) EXPECTED_ACCOUNT=887664351558 ;;
  *) echo "PMCS_ENV 는 dev 또는 prod 여야 합니다: $PMCS_ENV" >&2; exit 1 ;;
esac

export AWS_PROFILE="${AWS_PROFILE:-pmcs-$PMCS_ENV}"
export AWS_REGION="${AWS_REGION:-ap-northeast-2}"

NAME_PREFIX="pmcs-$PMCS_ENV"
DB_IDENTIFIER="$NAME_PREFIX-db"
DB_NAME="${DB_NAME:-pmcs}"
APP_ROLE=pmcs_app
MIGRATOR_ROLE=pmcs_migrator
API_SECRET_ID="$NAME_PREFIX/api"
# ECS 이미지 안의 RDS CA 번들 경로 (apps/backend/Dockerfile)
IMAGE_RDS_CA=/app/apps/backend/certs/rds-global-bundle.pem
# Prisma 마이그레이션 엔진은 sslcert 파일의 "첫 번째" 인증서만 읽는다. 전체 묶음(첫 인증서가 sa-east-1)을
# 주면 서울 RDS 인증서 검증에 실패하므로, 서울 RDS 루트(rds-ca-rsa2048-g1) 하나만 담은 파일을 쓴다.
# RDS 의 CA 를 바꾸면(rsa4096·ecc384) 이 파일도 그 루트로 바꿔야 한다.
IMAGE_RDS_MIGRATE_CA=/app/apps/backend/certs/rds-ap-northeast-2-rsa2048-g1.pem

TUNNEL_PORT="${TUNNEL_PORT:-15432}"
TARGET_HOST="${TARGET_HOST:-host.docker.internal}"
TARGET_PORT="${TARGET_PORT:-$TUNNEL_PORT}"
PG_IMAGE="${PG_IMAGE:-postgres:16}"
LOCAL_REHEARSAL="${LOCAL_REHEARSAL:-0}"

log() { printf '\033[1m[aws-migrate]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[31m[aws-migrate] %s\033[0m\n' "$*" >&2; exit 1; }

require() {
  local c
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || die "'$c' 이(가) 필요합니다."
  done
}

# 잘못된 계정(관리 계정, 다른 환경)에서 실행되는 것을 막는다.
check_account() {
  [ "$LOCAL_REHEARSAL" = 1 ] && return 0
  local acct
  acct=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) ||
    die "AWS 세션이 없습니다. AAM 포털에서 역할을 연 뒤 aws login --profile $AWS_PROFILE"
  [ "$acct" = "$EXPECTED_ACCOUNT" ] || die "계정 불일치: $acct (PMCS_ENV=$PMCS_ENV 는 $EXPECTED_ACCOUNT)"
}

db_address() {
  aws rds describe-db-instances --db-instance-identifier "$DB_IDENTIFIER" \
    --query 'DBInstances[0].Endpoint.Address' --output text
}

master_secret_arn() {
  aws rds describe-db-instances --db-instance-identifier "$DB_IDENTIFIER" \
    --query 'DBInstances[0].MasterUserSecret.SecretArn' --output text
}

# psql·pg_dump·pg_restore 를 Docker 로 실행한다. 비밀번호는 PGPASSWORD 환경 변수로만
# 넘겨(-e PGPASSWORD) 명령줄·프로세스 목록에 남지 않게 한다.
pg_docker() {
  local net=()
  [ -n "${PG_DOCKER_NETWORK:-}" ] && net=(--network "$PG_DOCKER_NETWORK")
  # macOS 기본 bash 3.2 는 set -u 에서 빈 배열 "${net[@]}" 을 unbound 로 본다.
  docker run --rm -i ${net[@]+"${net[@]}"} -e PGPASSWORD "$PG_IMAGE" "$@"
}

# 터널을 거쳐 RDS 에 붙는 libpq 연결 문자열 (비밀번호 제외).
# 터널 주소는 RDS 인증서의 호스트명과 달라 verify-full 이 불가능하므로 sslmode=require 로
# 암호화만 강제한다. 구간 자체는 SSM 세션으로 한 번 더 암호화된다.
target_conninfo() {
  printf 'host=%s port=%s dbname=%s user=%s sslmode=require' "$TARGET_HOST" "$TARGET_PORT" "$DB_NAME" "$1"
}

# postgresql://user:password@... 에서 사용자·비밀번호를 꺼낸다 (setup-db-roles.sh 가 만든 hex 비밀번호 전제).
url_user() { sed -E 's#^postgres(ql)?://([^:]+):.*#\2#' <<<"$1"; }
url_password() { sed -E 's#^postgres(ql)?://[^:]+:([^@]+)@.*#\2#' <<<"$1"; }
