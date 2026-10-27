# prod 주소. Route 53 영역(dns 루트)에 있고, 가비아 네임서버를 Route 53 으로 옮긴 뒤에 인증서 검증이 끝난다.
# pqms.co.kr·www 는 컷오버 전까지 Netlify 를 가리키므로(dns 루트 app_target), 리허설은 app.pqms.co.kr 로 한다.
app_hostname        = "pqms.co.kr"
app_alias_hostnames = ["app.pqms.co.kr"]
redirect_hostnames  = ["www.pqms.co.kr"]
api_hostname        = "api.pqms.co.kr"
dns_zone_name       = "pqms.co.kr"

# 배포할 이미지 태그는 SSM /pmcs-prod/app/image-tag 가 정한다(deploy.tf). 이 값은 파라미터의 첫 값일 뿐이다.
initial_image_tag = "6344f79-arm64"

# 서비스 태스크 수. 0이면 Fargate 비용 없음(서비스·작업 정의만 남음).
api_desired_count      = 1
frontend_desired_count = 1

# 태스크 크기. 2026-10-27 부하 시험 기준: api 0.25 vCPU 는 초당 약 20건까지(장비 20대가 1초마다) 버틴다.
# 실시간 전송으로 바꾸기 전에 api_cpu 를 512 이상으로 올릴 것. 메모리는 0.5GB 에서 79%까지 차서 1GB 로 둔다.
api_cpu         = 256
api_memory      = 1024
frontend_cpu    = 256
frontend_memory = 512
