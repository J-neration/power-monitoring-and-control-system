# prod 주소. Route 53 영역(dns 루트)에 있고, 가비아 네임서버를 Route 53 으로 옮긴 뒤에 인증서 검증이 끝난다.
# pqms.co.kr·www 는 컷오버 전까지 Netlify 를 가리키므로(dns 루트 app_target), 리허설은 app.pqms.co.kr 로 한다.
app_hostname        = "pqms.co.kr"
app_alias_hostnames = ["app.pqms.co.kr"]
redirect_hostnames  = ["www.pqms.co.kr"]
api_hostname        = "api.pqms.co.kr"
dns_zone_name       = "pqms.co.kr"

# ECR 이미지 태그(<커밋>-arm64). 단일 매니페스트로 올려야 ECR 기본 스캔이 동작한다:
#   docker buildx build --platform linux/arm64 --provenance=false --sbom=false --push ...
api_image_tag      = "initial"
frontend_image_tag = "initial"

# 서비스 태스크 수. 0이면 Fargate 비용 없음(서비스·작업 정의만 남음).
api_desired_count      = 0
frontend_desired_count = 0
