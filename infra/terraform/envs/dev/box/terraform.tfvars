# 전환 전에는 시험용 주소만 둔다. Caddy 는 여기 있는 주소마다 Let's Encrypt 인증서를 받으려 하므로,
# 가비아에서 아직 ALB 를 가리키는 app-dev·api-dev 를 넣으면 인증서 발급이 실패를 반복한다.
# 전환할 때 app-dev.pqms.co.kr·api-dev.pqms.co.kr 를 더하고, 가비아 레코드를 이 서버 IP 로 바꾼다.
app_hosts = ["box-app-dev.pqms.co.kr"]
api_hosts = ["box-api-dev.pqms.co.kr"]

# ECS dev(envs/dev/app)와 같은 이미지.
api_image_tag      = "74a11de-arm64"
frontend_image_tag = "74a11de-arm64"
