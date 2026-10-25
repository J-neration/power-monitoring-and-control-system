#!/bin/bash
# Postgres 데이터 디렉터리가 비어 있을 때(처음 한 번)만 공식 이미지가 실행한다.
# RDS 와 같은 계정 구성을 만든다 (scripts/aws-migrate/setup-*-role.sh 와 같은 권한):
#   pmcs_migrator  스키마 소유자. 마이그레이션·데이터 이전에만 쓴다.
#   pmcs_app       API 가 쓰는 계정. 데이터 조회·입력·수정·삭제만.
#   pmcs_readonly  사람이 데이터를 둘러볼 때. 조회만.
#   pmcs_local     로컬 백엔드(yarn dev)가 터널로 붙을 때. 데이터만, 연결 20개·쿼리 60초 제한.
# 비밀번호는 SSM 파라미터(/pmcs-dev/box/env)에서 compose 환경 변수로 들어온다(hex 라 따옴표 처리 불필요).
set -euo pipefail

psql -v ON_ERROR_STOP=1 -q --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE pmcs_migrator LOGIN PASSWORD '$MIGRATOR_DB_PASSWORD';
CREATE ROLE pmcs_app LOGIN PASSWORD '$APP_DB_PASSWORD';
CREATE ROLE pmcs_readonly LOGIN PASSWORD '$READONLY_DB_PASSWORD';
CREATE ROLE pmcs_local LOGIN CONNECTION LIMIT 20 PASSWORD '$LOCAL_DB_PASSWORD';
ALTER ROLE pmcs_app SET search_path = public;
ALTER ROLE pmcs_readonly SET search_path = public;
ALTER ROLE pmcs_readonly SET default_transaction_read_only = on;
ALTER ROLE pmcs_local SET search_path = public;
ALTER ROLE pmcs_local SET statement_timeout = '60s';

REVOKE ALL ON DATABASE $POSTGRES_DB FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE $POSTGRES_DB TO pmcs_migrator;
GRANT CONNECT ON DATABASE $POSTGRES_DB TO pmcs_app, pmcs_readonly, pmcs_local;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO pmcs_migrator;
GRANT USAGE ON SCHEMA public TO pmcs_app, pmcs_readonly, pmcs_local;

-- 마이그레이션·데이터 이전(pmcs_migrator 소유)으로 생기는 테이블에 권한이 자동으로 붙게 한다.
ALTER DEFAULT PRIVILEGES FOR ROLE pmcs_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pmcs_app, pmcs_local;
ALTER DEFAULT PRIVILEGES FOR ROLE pmcs_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO pmcs_app, pmcs_local;
ALTER DEFAULT PRIVILEGES FOR ROLE pmcs_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO pmcs_readonly;
SQL
