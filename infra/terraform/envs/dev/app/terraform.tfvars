# dev 주소. pqms.co.kr 자체(apex·www)는 운영 Netlify가 쓰므로 건드리지 않고,
# 가비아 DNS에 app-dev·api-dev CNAME(→ ALB)과 ACM 검증 CNAME만 추가한다.
app_hostname = "app-dev.pqms.co.kr"
api_hostname = "api-dev.pqms.co.kr"
