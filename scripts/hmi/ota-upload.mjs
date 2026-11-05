#!/usr/bin/env node
// HMI OTA 파일을 서버에 올리고 HMI 가 받을 다운로드 URL 을 출력한다.
//
// 흐름: APP 주소(/api/auth/login)로 관리자 로그인 → JWT(pmcs_token 쿠키) →
//       API 주소 /receiver/ota/files 로 업로드. API 주소는 /receiver/* 만 열려 있어
//       로그인은 프론트의 로그인 경로를 쓴다.
//
// 비밀번호는 환경 변수 PMCS_PASSWORD 또는 입력 프롬프트(화면에 표시 안 함)로만 받는다.
// 사용:
//   node scripts/hmi/ota-upload.mjs <파일> [이름]
//   환경 변수: APP_HOST(기본 app-dev.pqms.co.kr) API_HOST(기본 api-dev.pqms.co.kr)
//              PMCS_USERNAME PMCS_PASSWORD (없으면 물어본다)
// 목록: node scripts/hmi/ota-upload.mjs --list
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

const APP_HOST = process.env.APP_HOST || "app-dev.pqms.co.kr";
const API_HOST = process.env.API_HOST || "api-dev.pqms.co.kr";

const ask = (question, { hidden = false } = {}) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.startsWith(question)) rl.output.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });

const login = async () => {
  const username = process.env.PMCS_USERNAME || (await ask("관리자 아이디: "));
  const password = process.env.PMCS_PASSWORD || (await ask("비밀번호: ", { hidden: true }));
  const res = await fetch(`https://${APP_HOST}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`로그인 실패 (${res.status}): ${body.message ?? ""}`);
  }
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  const token = cookies.map((c) => /pmcs_token=([^;]+)/.exec(c)?.[1]).find(Boolean);
  if (!token) throw new Error("로그인 응답에 pmcs_token 쿠키가 없습니다.");
  return token;
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("사용: node scripts/hmi/ota-upload.mjs <파일> [이름]   |   --list");
    process.exit(2);
  }

  const token = await login();
  const auth = { Authorization: `Bearer ${token}` };

  if (args[0] === "--list") {
    const res = await fetch(`https://${API_HOST}/receiver/ota/files`, { headers: auth });
    const body = await res.json();
    if (!res.ok) throw new Error(`목록 실패 (${res.status}): ${body.message ?? ""}`);
    for (const f of body.files) {
      console.log(`${f.createdAt}  ${f.name}  ${f.size}B  sha256=${f.sha256}`);
      console.log(`  https://${API_HOST}${f.downloadPath}`);
    }
    return;
  }

  const file = args[0];
  const name = args[1] || path.basename(file);
  const data = readFileSync(file);
  const localSha = createHash("sha256").update(data).digest("hex");

  const res = await fetch(`https://${API_HOST}/receiver/ota/files?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/octet-stream" },
    body: data,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`업로드 실패 (${res.status}): ${body.message ?? JSON.stringify(body)}`);

  const f = body.file;
  const url = `https://${API_HOST}${f.downloadPath}`;
  console.log(`업로드 완료: ${f.name} (${f.size} bytes)`);
  console.log(`sha256 서버 ${f.sha256}`);
  console.log(`sha256 로컬 ${localSha} ${f.sha256 === localSha ? "(일치)" : "(불일치!)"}`);
  console.log(`다운로드 URL (${url.length}자):`);
  console.log(url);
};

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
