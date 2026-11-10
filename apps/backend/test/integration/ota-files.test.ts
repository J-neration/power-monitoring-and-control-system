import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { crc32Mpeg2 } from "../../src/lib/otaHeader.js";
import { hmi, http, useTestApp, type TestApp } from "./helpers/app.js";
import { IDS, seedWorld } from "./helpers/fixtures.js";

const t = useTestApp();

/** tools/ota_pack.py 와 같은 헤더(256B) + 이미지. version 0x00020400 = "2.4.0". */
const otaPackage = (imageSize = 70_000, version = 0x00020400) => {
  const pkg = Buffer.alloc(256 + imageSize, 0x3c);
  pkg.fill(0, 0, 256);
  pkg.writeUInt32LE(0x31494d48, 0);
  pkg.writeUInt16LE(1, 4);
  pkg.writeUInt16LE(256, 6);
  pkg.writeUInt32LE(1, 8);
  pkg.writeUInt32LE(version, 12);
  pkg.writeUInt32LE(1, 16);
  pkg.writeUInt32LE(imageSize, 20);
  pkg.writeUInt32LE(crc32Mpeg2(pkg.subarray(0, 252)), 252);
  return pkg;
};

/** 0x00 연속과 AT 응답 모양 문자열이 섞인 바이너리 (HMI 수신 경로가 깨지기 쉬운 내용). */
const sampleFile = (size = 200_003) => {
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i++) buf[i] = (i * 31 + 7) & 0xff;
  buf.fill(0, 0, Math.min(1024, size));
  const marker = Buffer.from("\r\nOK\r\nCONNECT 4096\r\n");
  if (size >= 65536 + marker.length) marker.copy(buf, 65536 - 8);
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

  it("stores the package header; a plain file has none; a broken header is rejected", async () => {
    const { tokens } = await seedWorld(t.app);
    const pkg = (await upload(t.app, otaPackage(), { token: tokens.admin, name: "HMI_2.4.0.ota" })).json().file;
    assert.equal(pkg.version, "2.4.0");
    assert.equal(pkg.productId, 1);
    assert.equal(pkg.assetVersion, 1);
    assert.equal(pkg.imageSize, 70_000);

    const plain = (await upload(t.app, sampleFile(), { token: tokens.admin })).json().file;
    assert.equal(plain.version, null);

    const broken = otaPackage();
    broken[12] ^= 1; // version byte -> header CRC no longer matches
    const res = await upload(t.app, broken, { token: tokens.admin });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().message, /CRC/);
  });

  it("ota command: the HMI gets version, size and a download URL on its own host", async () => {
    const { tokens } = await seedWorld(t.app);
    const data = otaPackage();
    const file = (await upload(t.app, data, { token: tokens.admin })).json().file;
    const plain = (await upload(t.app, sampleFile(), { token: tokens.admin })).json().file;

    const create = (fileId: string) =>
      http(t.app).post(
        "/receiver/commands/create",
        { installationId: IDS.lotteInst, module: 0, power: "ota", fields: { fileId } },
        { token: tokens.admin },
      );
    assert.equal((await create(plain.id)).statusCode, 400);

    const created = await create(file.id);
    assert.equal(created.statusCode, 201);
    const { command } = created.json();

    const polled = (await hmi(t.app).get(`/receiver/commands?iccid=${IDS.lotteIccid}`)).json();
    assert.equal(polled.id, command.id);
    assert.equal(polled.power, "ota");
    assert.equal(polled.module, 0);
    assert.equal(polled.ver, "2.4.0");
    assert.equal(polled.pid, 1);
    assert.equal(polled.asset, 1);
    assert.equal(polled.size, data.length);
    assert.ok(polled.url.startsWith("https://"));
    assert.ok(polled.url.endsWith(file.downloadPath));
    assert.ok(JSON.stringify(polled).length < 300, "HMI command buffer");

    // The path in the URL really serves the package.
    const first = await download(t.app, file.downloadPath, "bytes=0-255");
    assert.equal(first.statusCode, 206);
    assert.ok(first.rawPayload.equals(data.subarray(0, 256)));
  });
});
