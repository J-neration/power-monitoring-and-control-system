import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { http, useTestApp, type TestApp } from "./helpers/app.js";
import { seedWorld } from "./helpers/fixtures.js";

const t = useTestApp();

/** 0x00 연속과 AT 응답 모양 문자열이 섞인 바이너리 (HMI 수신 경로가 깨지기 쉬운 내용). */
const sampleFile = (size = 200_003) => {
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i++) buf[i] = (i * 31 + 7) & 0xff;
  buf.fill(0, 0, 1024);
  Buffer.from("\r\nOK\r\nCONNECT 4096\r\n").copy(buf, 65536 - 8);
  return buf;
};

const upload = (app: TestApp, data: Buffer, opts: { token?: string; name?: string } = {}) =>
  app.inject({
    method: "POST",
    url: `/receiver/ota/files?name=${encodeURIComponent(opts.name ?? "ota_test.bin")}`,
    headers: {
      "content-type": "application/octet-stream",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    payload: data,
  });

const download = (app: TestApp, path: string, range?: string) =>
  app.inject({ method: "GET", url: path, headers: range ? { range } : {} });

describe("OTA files", () => {
  it("only an admin can upload", async () => {
    const { tokens } = await seedWorld(t.app);
    const data = sampleFile();
    assert.equal((await upload(t.app, data)).statusCode, 401);
    assert.equal((await upload(t.app, data, { token: tokens.client })).statusCode, 403);

    const res = await upload(t.app, data, { token: tokens.admin });
    assert.equal(res.statusCode, 201);
    const file = res.json().file;
    assert.equal(file.size, data.length);
    assert.equal(file.sha256, createHash("sha256").update(data).digest("hex"));
    assert.equal(file.uploadedBy, "admin-reg");
    assert.match(file.downloadPath, /^\/receiver\/ota\/file\/[^/?]+\?t=[0-9a-f]{32}$/);
  });

  it("rejects an empty body and a bad name", async () => {
    const { tokens } = await seedWorld(t.app);
    assert.equal((await upload(t.app, Buffer.alloc(0), { token: tokens.admin })).statusCode, 400);
    assert.equal(
      (await upload(t.app, sampleFile(10), { token: tokens.admin, name: "../evil" })).statusCode,
      400,
    );
  });

  it("serves the whole file and 64 KB ranges byte for byte", async () => {
    const { tokens } = await seedWorld(t.app);
    const data = sampleFile();
    const { downloadPath } = (await upload(t.app, data, { token: tokens.admin })).json().file;

    const full = await download(t.app, downloadPath);
    assert.equal(full.statusCode, 200);
    assert.equal(full.headers["accept-ranges"], "bytes");
    assert.ok(full.rawPayload.equals(data));

    const chunk = await download(t.app, downloadPath, "bytes=65536-131071");
    assert.equal(chunk.statusCode, 206);
    assert.equal(chunk.headers["content-range"], `bytes 65536-131071/${data.length}`);
    assert.equal(Number(chunk.headers["content-length"]), 65536);
    assert.ok(chunk.rawPayload.equals(data.subarray(65536, 131072)));

    // 마지막 조각: 요청 끝이 파일 끝을 넘으면 파일 끝까지
    const last = await download(t.app, downloadPath, "bytes=196608-262143");
    assert.equal(last.statusCode, 206);
    assert.equal(last.headers["content-range"], `bytes 196608-${data.length - 1}/${data.length}`);
    assert.ok(last.rawPayload.equals(data.subarray(196608)));
  });

  it("answers 416 past the end of the file", async () => {
    const { tokens } = await seedWorld(t.app);
    const data = sampleFile();
    const { downloadPath } = (await upload(t.app, data, { token: tokens.admin })).json().file;
    const res = await download(t.app, downloadPath, `bytes=${data.length}-`);
    assert.equal(res.statusCode, 416);
    assert.equal(res.headers["content-range"], `bytes */${data.length}`);
  });

  it("hides the file without the right token", async () => {
    const { tokens } = await seedWorld(t.app);
    const { id } = (await upload(t.app, sampleFile(), { token: tokens.admin })).json().file;
    assert.equal((await download(t.app, `/receiver/ota/file/${id}`)).statusCode, 404);
    assert.equal((await download(t.app, `/receiver/ota/file/${id}?t=${"0".repeat(32)}`)).statusCode, 404);
    assert.equal((await download(t.app, `/receiver/ota/file/nope?t=${"0".repeat(32)}`)).statusCode, 404);
  });

  it("lists and deletes files (admin only)", async () => {
    const { tokens } = await seedWorld(t.app);
    const { id, downloadPath } = (await upload(t.app, sampleFile(), { token: tokens.admin })).json().file;

    assert.equal((await http(t.app).get("/receiver/ota/files", { token: tokens.client })).statusCode, 403);
    const list = await http(t.app).get("/receiver/ota/files", { token: tokens.admin });
    assert.equal(list.statusCode, 200);
    assert.deepEqual(
      list.json().files.map((f: { id: string }) => f.id),
      [id],
    );

    assert.equal((await http(t.app).delete(`/receiver/ota/files/${id}`, { token: tokens.admin })).statusCode, 204);
    assert.equal((await download(t.app, downloadPath)).statusCode, 404);
    assert.equal((await http(t.app).delete(`/receiver/ota/files/${id}`, { token: tokens.admin })).statusCode, 404);
  });
});
