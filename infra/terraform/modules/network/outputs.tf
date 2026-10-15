output "vpc_id" {
  value = aws_vpc.this.id
}

output "vpc_cidr" {
  value = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "isolated_subnet_ids" {
  value = aws_subnet.isolated[*].id
}

output "nat_public_ips" {
  description = "NAT의 고정 공인 IP. 외부 웹훅 등이 허용 IP 목록을 요구하면 이 값을 준다."
  value       = aws_eip.nat[*].public_ip
}
