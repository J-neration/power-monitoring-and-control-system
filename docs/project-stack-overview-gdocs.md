PMCS 인프라 및 기술 스택 구성 보고서

문서 정보
  작성일: 2026-04-01
  작성자: PMCS 개발팀
  문서 목적: 프로젝트에 사용되는 서비스 및 기술 스택의 역할과 구성을 정의하고, 팀 내 공통 이해를 확보하기 위한 문서

────────────────────────────────────────


1. 개요

PMCS(Power Monitoring & Control System)는 현장에 설치된 HMI 장비로부터 전력 텔레메트리 데이터를 수신하고, 이를 웹 대시보드를 통해 모니터링 및 제어하는 시스템입니다.

본 문서는 해당 시스템의 개발 및 운영에 사용되는 외부 서비스와 기술 도구를 정리하여, 각 구성 요소의 역할과 상호 관계를 명확히 합니다.


────────────────────────────────────────


2. 시스템 아키텍처

아래는 PMCS의 전체 시스템 구성도입니다.

  [HMI 장비]                           [사용자 브라우저]
      |                                     |
      | POST /receiver                      | HTTPS + WebSocket
      | (API Key 인증)                       |
      v                                     v
  +------------------------------------------------+
  |            Railway (클라우드 서버)                 |
  |   +------------------------------------------+  |
  |   |  Fastify Backend (Node.js / TypeScript)   |  |
  |   |   +------------------------------------+  |  |
  |   |   |  Prisma ORM                        |  |  |
  |   |   |  (TypeScript ↔ DB 매핑 자동 생성)    |  |  |
  |   |   +----------------+-------------------+  |  |
  |   +--------------------|----------------------+  |
  +---------------------|--------------------------+
                        | PostgreSQL Protocol (SSL)
                        v
               +--------------------+
               |  Neon               |
               |  PostgreSQL 16      |
               |  (ap-southeast-1)   |
               +--------------------+

  [개발자 로컬 환경]
      |
      +-- Docker -------> 로컬 PostgreSQL (개발/테스트 전용)
      +-- Prisma CLI ----> Migration 생성 및 적용


────────────────────────────────────────


3. 서비스별 역할 정의


3.1  Neon — 운영 데이터베이스

  분류: 클라우드 데이터베이스 서비스 (DBaaS)
  역할: 운영 환경의 PostgreSQL 데이터베이스를 호스팅
  관리: Neon 대시보드 (neon.tech)

  설명:
    Site(현장), Installation(설치지점), Device(장비 텔레메트리), User(사용자 인증) 등
    시스템의 모든 영구 데이터가 Neon에 저장됩니다.
    Railway에서 실행 중인 백엔드 서버가 DATABASE_URL 환경변수를 통해 Neon에 접속합니다.

  비고:
    - 리전: ap-southeast-1 (싱가포르)
    - 로컬 개발 시에는 Neon을 사용하지 않으며, Docker 기반 로컬 DB를 사용합니다.


3.2  Railway — 백엔드 서버 호스팅

  분류: 클라우드 애플리케이션 호스팅 플랫폼 (PaaS)
  역할: Fastify 기반 백엔드 API 서버의 빌드, 배포, 실행
  관리: Railway 대시보드 (railway.app)

  설명:
    HMI 장비로부터 텔레메트리 데이터를 수신하고, 프론트엔드에 REST API 및
    WebSocket을 제공하는 백엔드 서버를 24시간 운영합니다.
    GitHub main 브랜치에 push하면 Dockerfile 기반으로 자동 빌드 및 배포됩니다.

  주요 기능:
    - CI/CD: GitHub push 시 자동 배포
    - 빌드: yarn install → prisma generate → tsc 컴파일
    - 환경변수 관리: Railway Variables UI에서 설정
    - 로그 확인: Railway Deployments 탭에서 실시간 조회 가능


3.3  Prisma — ORM (Object-Relational Mapping)

  분류: 개발 도구 / 라이브러리
  역할: TypeScript 코드와 PostgreSQL 데이터베이스 간의 매핑 및 스키마 관리
  설정 파일: apps/backend/prisma/schema.prisma

  설명:
    Prisma는 외부 서비스가 아닌, 프로젝트에 포함된 개발 도구입니다.
    SQL을 직접 작성하지 않고 TypeScript 코드로 데이터베이스를 조회, 생성, 수정할 수 있게 해줍니다.

  핵심 기능 3가지:
    1) 스키마 정의  — schema.prisma 파일에서 테이블 구조를 선언적으로 정의
    2) 마이그레이션 — 스키마 변경사항을 SQL로 변환하여 데이터베이스에 적용
    3) 클라이언트 생성 — 스키마 기반으로 타입 안전한 쿼리 코드를 자동 생성

  Neon과의 관계:
    Prisma는 데이터베이스에 접근하는 "도구"이고, Neon은 데이터가 저장되는 "저장소"입니다.
    Prisma가 생성한 SQL 쿼리가 Neon(운영) 또는 Docker(로컬)의 PostgreSQL에 전달됩니다.


3.4  Netlify — 프론트엔드 호스팅

  분류: 정적 사이트 / SSR 호스팅 플랫폼
  역할: Next.js 기반 프론트엔드 웹 애플리케이션의 빌드 및 서빙
  관리: Netlify 대시보드 (app.netlify.com)

  설명:
    사용자가 브라우저를 통해 접속하는 모니터링 대시보드를 호스팅합니다.
    GitHub main 브랜치에 push하면 자동으로 빌드 및 배포됩니다.
    NEXT_PUBLIC_API_BASE 환경변수를 통해 Railway 백엔드 URL을 참조합니다.


3.5  Docker — 로컬 개발 환경

  분류: 컨테이너 런타임 (로컬 전용)
  역할: 개발 및 테스트를 위한 로컬 PostgreSQL 데이터베이스 실행
  설정 파일: docker-compose.yml

  설명:
    운영 데이터베이스(Neon)에 영향을 주지 않고 독립적으로 개발할 수 있도록
    로컬 환경에서 PostgreSQL 컨테이너를 실행합니다.

  주요 명령어:
    docker compose up -d      로컬 DB 시작
    docker compose down -v    로컬 DB 초기화 (전체 데이터 삭제)


────────────────────────────────────────


4. 서비스 간 관계 요약

  구성 요소        분류               역할 요약
  ─────────────────────────────────────────────────────────────
  Neon            클라우드 DB         운영 데이터 저장소 (PostgreSQL)
  Railway         클라우드 서버       백엔드 API 서버 실행 및 자동 배포
  Prisma          개발 도구          DB 스키마 관리 및 쿼리 코드 자동 생성
  Netlify         클라우드 호스팅     프론트엔드 웹 앱 서빙
  Docker          로컬 도구          로컬 개발용 PostgreSQL 실행

  핵심 관계:
    - Railway(서버)가 Prisma(도구)를 통해 Neon(DB)에 접근합니다.
    - Netlify(프론트엔드)가 Railway(백엔드)의 API를 호출합니다.
    - Docker는 로컬 개발 시 Neon을 대체하는 역할입니다.


────────────────────────────────────────


5. 환경변수 구성

5.1  Backend 환경변수 (Railway Variables에서 관리)

  변수명              용도
  ─────────────────────────────────────────────────────────────
  DATABASE_URL       Neon PostgreSQL 연결 문자열
  JWT_SECRET         사용자 인증 토큰(JWT) 서명 키
  RECEIVER_API_KEY   HMI 텔레메트리 수신 API 인증 키
                     (HMI가 POST /receiver 요청 시 x-api-key 헤더에 포함)
  FRONTEND_ORIGIN    CORS 허용 오리진 (Netlify 프론트엔드 URL)
  PORT               서버 바인드 포트 (기본값: 4000)
  HOST               서버 바인드 주소 (기본값: 0.0.0.0)
  LOG_LEVEL          로그 출력 레벨 (기본값: info)

5.2  Frontend 환경변수 (Netlify Site Configuration에서 관리)

  변수명                  용도
  ─────────────────────────────────────────────────────────────
  NEXT_PUBLIC_API_BASE   백엔드 API URL (Railway 배포 URL)


────────────────────────────────────────


6. 개발 및 배포 워크플로우

6.1  일반적인 코드 변경 (스키마 변경 없음)

    코드 수정
        ↓
    git push origin main
        ↓
    Netlify: 프론트엔드 자동 빌드 및 배포
    Railway: 백엔드 자동 빌드 및 배포

6.2  DB 스키마 변경이 포함된 경우

    schema.prisma 수정
        ↓
    npx prisma migrate dev --name <변경_내용_요약>
    (로컬 DB에 적용 + migration 파일 생성)
        ↓
    git push origin main
    (migration 파일 포함하여 커밋)
        ↓
    Railway: 백엔드 자동 빌드 및 배포
        ↓
    운영 DB 반영 (수동):
    DATABASE_URL="<Neon URL>" npx prisma migrate deploy
        ↓
    Neon 운영 DB 스키마 반영 완료


────────────────────────────────────────


7. 참고 사항

  - 운영 DB 마이그레이션(prisma migrate deploy)은 Railway 배포 시 자동 실행되지 않으므로,
    스키마 변경이 포함된 배포 시 반드시 수동으로 실행해야 합니다.
  - 환경변수 중 JWT_SECRET, RECEIVER_API_KEY는 보안 민감 정보이므로
    코드에 직접 포함하지 않고 Railway Variables에서만 관리합니다.
  - 로컬 개발 시 .env 파일에 로컬용 기본값이 설정되어 있어
    별도 환경변수 설정 없이 개발 서버를 실행할 수 있습니다.
