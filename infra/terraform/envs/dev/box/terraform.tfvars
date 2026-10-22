# Caddy 는 여기 있는 주소마다 Let's Encrypt 인증서를 받는다. 가비아에서 그 주소가 이 서버 IP(A 레코드)를
# 가리켜야 발급되며, 레코드를 바꾼 직후에는 Caddy 를 재시작해야 재시도 대기 없이 바로 받는다.
app_hosts = ["app-dev.pqms.co.kr"]
api_hosts = ["api-dev.pqms.co.kr"]

api_image_tag      = "74a11de-arm64"
frontend_image_tag = "74a11de-arm64"
