# Caddy 는 여기 있는 주소마다 Let's Encrypt 인증서를 받는다. 가비아에서 그 주소가 이 서버 IP(A 레코드)를
# 가리켜야 발급되며, 레코드를 바꾼 직후에는 Caddy 를 재시작해야 재시도 대기 없이 바로 받는다.
# box-* 는 전환 전 시험용 주소다(되돌리기 시험에도 쓰므로 당분간 둔다).
app_hosts = ["app-dev.pqms.co.kr", "box-app-dev.pqms.co.kr"]
api_hosts = ["api-dev.pqms.co.kr", "box-api-dev.pqms.co.kr"]

# ECS dev(envs/dev/app)와 같은 이미지.
api_image_tag      = "74a11de-arm64"
frontend_image_tag = "74a11de-arm64"
