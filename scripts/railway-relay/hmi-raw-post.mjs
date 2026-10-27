#!/usr/bin/env node
// HMI 펌웨어와 같은 바이트로 /receiver 에 측정값 1건을 보낸다(Railway 중계 검증용).
// 모뎀(Quectel, requestheader=1)은 헤더를 직접 써서 보낸다: Host, Content-Type, x-api-key, Content-Length.
// User-Agent·Accept-Encoding·Connection 은 없고, 인증서는 검증하지 않으며 SNI 는 보낸다.
//
// 키는 환경 변수 RECEIVER_API_KEY 로만 받는다(명령줄·화면에 나오지 않게).
// 사용:
//   RECEIVER_API_KEY=... HOST=pmcsbackend-dev.up.railway.app node scripts/railway-relay/hmi-raw-post.mjs
//   DEVICE_ID 기본값 relay-test-01 — 처음 보내면 "Unknown" 사이트 아래 장비가 새로 생긴다.
//   COUNT=5 로 여러 번 보내 응답 시간을 본다(요청마다 새 연결, 모뎀과 같다).
import tls from "node:tls";

const key = process.env.RECEIVER_API_KEY;
const host = process.env.HOST;
if (!key || !host) {
  console.error("RECEIVER_API_KEY 와 HOST 가 필요합니다 (예: HOST=pmcsbackend-dev.up.railway.app)");
  process.exit(2);
}
const deviceId = process.env.DEVICE_ID || "relay-test-01";
const count = Number(process.env.COUNT || 1);

const body = JSON.stringify({
  device_id: deviceId, model: "psta", numOfMods: 1, moduleStatus: [1],
  vL1: 229.1, vL2: 228.7, vL3: 229.4,
  gridCurrentL1: 95.2, gridCurrentL2: 96.0, gridCurrentL3: 94.8,
  loadCurrentL1: 101.3, loadCurrentL2: 102.1, loadCurrentL3: 100.9,
  compS: 70.1, compP: 66.5, compQ: 5.2, tpf1: 0.86, tpf2: 0.98,
  areaTemp: 28.5, moduleTemp: [41.2], fanSpeed: [60], csq: 20, rsrp: -85, faults: [],
});
const request =
  `POST /receiver HTTP/1.1\r\nHost: ${host}\r\nContent-Type: application/json\r\n` +
  `x-api-key: ${key}\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;

function postOnce() {
  return new Promise((resolve) => {
    const started = Date.now();
    let raw = "";
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
      socket.write(request);
    });
    const finish = (error) => {
      socket.destroy();
      const [head = "", payload = ""] = raw.split("\r\n\r\n");
      resolve({ status: head.split("\r\n")[0] || error || "응답 없음", payload, ms: Date.now() - started });
    };
    socket.setTimeout(60_000, () => finish("시간 초과(60초)"));
    socket.on("error", (e) => finish(e.message));
    socket.on("data", (chunk) => {
      raw += chunk;
      // 모뎀은 연결을 닫지 않으므로 Content-Length 만큼 받으면 끝낸다.
      const [head, payload] = raw.split("\r\n\r\n");
      const length = /content-length:\s*(\d+)/i.exec(head || "");
      if (payload !== undefined && length && Buffer.byteLength(payload) >= Number(length[1])) finish();
    });
  });
}

let ok = true;
for (let i = 1; i <= count; i++) {
  const { status, payload, ms } = await postOnce();
  console.log(`${i}: ${status} · ${ms}ms · ${payload.slice(0, 200)}`);
  if (!/ 20[01] /.test(status)) ok = false;
}
process.exit(ok ? 0 : 1);
