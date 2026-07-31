# 배포 실패 알림 받기

## 문제

Railway 빌드 로그는 Railway 대시보드에서만 보인다. 그래서 백엔드 빌드가 깨지면
**대시보드를 보는 사람만** 알게 되고, 정작 그 커밋을 푸시한 사람은 모른 채 넘어간다.
결과적으로 백엔드 문제가 항상 한 사람에게 몰린다.

해결은 두 겹이다. (1)은 코드로 처리됐고, (2)는 Railway 대시보드에서 한 번 설정해야 한다.

---

## 1. GitHub Actions — 푸시한 사람에게 자동 메일 (설정 완료)

[`.github/workflows/backend-docker-build.yml`](../.github/workflows/backend-docker-build.yml)이
**Railway와 동일한 Dockerfile로** 이미지를 미리 빌드한다.

- 백엔드 관련 파일이 바뀐 푸시/PR마다 실행된다
- 실패하면 **그 커밋을 푸시한 사람에게 GitHub이 자동으로 메일을 보낸다** — Railway 계정이 없어도 된다
- 메일의 링크를 열면 Railway 빌드 로그와 같은 내용이 그대로 보인다
- PR에는 빨간 X로 표시되므로, 깨진 채로 머지되는 것도 막힌다

즉 Railway까지 가기 전에 GitHub에서 먼저 잡힌다.

### 메일이 안 오면

GitHub → Settings → Notifications → Actions 에서 확인:

- **Email** 체크
- "Send notifications for: **Failed workflows only**" (기본값이지만 꺼둔 경우가 있음)

### 이 워크플로가 잡아주는 것

실제로 Railway에서 터졌던 것들이 전부 포함된다.

- `prisma generate`가 schema.prisma를 못 찾는 문제
- `.dockerignore` 오설정으로 `COPY` 대상이 사라지는 문제
- yarn lockfile 불일치 (`--frozen-lockfile` 실패)
- `tsc` 타입 에러

---

## 2. Railway — 배포 실패 알림 (대시보드에서 설정 필요)

GitHub Actions는 **빌드**만 검증한다. 부팅 실패(마이그레이션 오류, 환경변수 누락 등)는
Railway에서만 드러나므로 아래도 같이 설정해두는 게 좋다.

### 2-1. 프로젝트 멤버 추가 (가장 간단)

Railway 프로젝트 → **Settings → Members** → 초대.
멤버로 등록되면 배포 실패 알림을 각자 받게 된다.
(개인 계정 알림 설정이 켜져 있어야 하니, 초대 후 실제로 메일이 오는지 한 번 확인할 것.)

### 2-2. 웹훅으로 공용 채널에 보내기 (권장)

한 사람 메일함에 의존하지 않으려면 이쪽이 낫다.

Railway 프로젝트 → **Settings → Webhooks** → 웹훅 URL 등록.
Railway는 Slack/Discord 웹훅 URL을 인식해서 배포 상태(성공/실패)를 메시지로 보낸다.

- Discord: 채널 설정 → 연동 → 웹훅 → 새 웹훅 → URL 복사
- Slack: Incoming Webhook 앱 추가 → URL 복사

둘 다 쓰지 않는다면 Discord 서버 하나를 두 명만 쓰는 용도로 파는 게 제일 빠르다.

> Railway UI는 개편이 잦다. 메뉴 이름이 다르면 프로젝트 Settings 안에서
> "Members" / "Webhooks" 에 해당하는 항목을 찾으면 된다.

---

## 요약

| 언제 깨지는가 | 어디서 알게 되는가 | 누가 받는가 |
| --- | --- | --- |
| 빌드 (이미지 생성) | GitHub Actions | 푸시한 사람 (자동) |
| 부팅/런타임 | Railway | 프로젝트 멤버 + 웹훅 채널 |
