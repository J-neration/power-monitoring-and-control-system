# dev 주소. pqms.co.kr 자체(apex·www)는 운영 Netlify가 쓰므로 건드리지 않고,
# 가비아 DNS에 app-dev·api-dev CNAME(→ ALB)과 ACM 검증 CNAME만 추가한다.
app_hostname = "app-dev.pqms.co.kr"
api_hostname = "api-dev.pqms.co.kr"

# ECR 이미지 태그(<커밋>-arm64). 단일 매니페스트로 올려야 ECR 기본 스캔이 동작한다:
#   docker buildx build --platform linux/arm64 --provenance=false --sbom=false --push ...
api_image_tag      = "4385ad7-arm64"
frontend_image_tag = "4385ad7-arm64"
