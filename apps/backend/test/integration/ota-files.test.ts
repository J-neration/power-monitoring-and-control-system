import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { crc32Mpeg2 } from "../../src/lib/otaHeader.js";
import { prisma } from "../../src/lib/prisma.js";
import { hmi, http, useTestApp, type TestApp } from "./helpers/app.js";
import { IDS, seedWorld } from "./helpers/fixtures.js";

const t = useTestApp();

/** tools/ota_pack.py 와 같은 헤더(256B) + 이미지. version 0x00020400 = "2.4.0". */
const otaPackage = (imageSize = 70_000, version = 0x00020400, assetVersion = 1) => {
  const pkg = Buffer.alloc(256 + imageSize, 0x3c);
  pkg.fill(0, 0, 256);
  pkg.writeUInt32LE(0x31494d48, 0);
  pkg.writeUInt16LE(1, 4);
  pkg.writeUInt16LE(256, 6);
  pkg.writeUInt32LE(1, 8);
  pkg.writeUInt32LE(version, 12);
  pkg.writeUInt32LE(assetVersion, 16);
  pkg.writeUInt32LE(imageSize, 20);
  pkg.writeUInt32LE(crc32Mpeg2(pkg.subarray(0, 252)), 252);
  return pkg;
};

/** tools/ota_pack.py --asset 와 같은 화면 데이터 패키지(HMIA, Core/Inc/ota/ota_asset_image.h). */
const assetPackage = (assetVersion: number, bodySize = 90_000, fill = 0x41) => {
  const pkg = Buffer.alloc(256 + bodySize, fill);
  pkg.fill(0, 0, 256);
  pkg.writeUInt32LE(0x41494d48, 0);
  pkg.writeUInt16LE(1, 4);
  pkg.writeUInt16LE(256, 6);
  pkg.writeUInt32LE(1, 8);
  pkg.writeUInt32LE(assetVersion, 12);
  pkg.writeUInt32LE(18_696_924, 16);
  pkg.writeUInt32LE(0x10000, 24);
  pkg.writeUInt32LE(286, 28);
  pkg.writeUInt32LE(bodySize, 32);
  pkg.writeUInt32LE(crc32Mpeg2(pkg.subarray(256)), 36);
  pkg.fill(0xab, 40, 72);
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

    assert.equal(pkg.kind, "code");

    const plain = (await upload(t.app, sampleFile(), { token: tokens.admin })).json().file;
    assert.equal(plain.version, null);
    assert.equal(plain.kind, null);

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

  it("stores a screen data package (HMIA) up to 8 MB; a damaged body is rejected", async () => {
    const { tokens } = await seedWorld(t.app);
    // larger than the old 4 MB limit
    const data = assetPackage(2, 5 * 1024 * 1024);
    const res = await upload(t.app, data, { token: tokens.admin, name: "HMI_asset_2.ota" });
    assert.equal(res.statusCode, 201, res.body);
    const f = res.json().file;
    assert.equal(f.kind, "asset");
    assert.equal(f.version, null);
    assert.equal(f.assetVersion, 2);
    assert.equal(f.productId, 1);
    assert.equal(f.imageSize, 18_696_924);
    assert.equal(f.rawSha256, "ab".repeat(32));

    const bad = assetPackage(2);
    bad[1000] ^= 1;
    const badRes = await upload(t.app, bad, { token: tokens.admin });
    assert.equal(badRes.statusCode, 400);
    assert.match(badRes.json().message, /본문 CRC/);

    const tooBig = await upload(t.app, Buffer.alloc(8 * 1024 * 1024 + 1, 1), { token: tokens.admin });
    assert.equal(tooBig.statusCode, 413);
  });

  it("keeps the last screen data package of each number", async () => {
    const { tokens } = await seedWorld(t.app);
    const a = (await upload(t.app, assetPackage(1), { token: tokens.admin })).json().file;
    const b = (await upload(t.app, assetPackage(1, 90_000, 0x42), { token: tokens.admin })).json().file;
    const del = (id: string) => http(t.app).delete(`/receiver/ota/files/${id}`, { token: tokens.admin });
    assert.equal((await del(a.id)).statusCode, 204);
    const last = await del(b.id);
    assert.equal(last.statusCode, 409);
    assert.match(last.json().message, /보관본/);
    assert.equal((await http(t.app).get("/receiver/ota/files", { token: tokens.admin })).json().files.length, 1);
  });

  it("ota command for other screen data carries the screen and backup URLs", async () => {
    const { tokens } = await seedWorld(t.app);
    const code = (await upload(t.app, otaPackage(70_000, 0x00020600, 2), { token: tokens.admin })).json().file;
    const create = () =>
      http(t.app).post(
        "/receiver/commands/create",
        { installationId: IDS.lotteInst, module: 0, power: "ota", fields: { fileId: code.id } },
        { token: tokens.admin },
      );

    // the HMI never reported assetOta (2.4.0)
    let res = await create();
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().code, "OTA_ASSET_NOT_SUPPORTED");

    await prisma.device.update({
      where: { installationId: IDS.lotteInst },
      data: { assetVersion: 1, assetOta: true },
    });
    res = await create();
    assert.equal(res.json().code, "OTA_ASSET_FILE_MISSING");
    const screen2 = assetPackage(2);
    const s2 = (await upload(t.app, screen2, { token: tokens.admin })).json().file;
    res = await create();
    assert.equal(res.json().code, "OTA_ASSET_BACKUP_MISSING");
    const s1 = (await upload(t.app, assetPackage(1), { token: tokens.admin })).json().file;

    // a screen data package cannot be sent on its own
    const direct = await http(t.app).post(
      "/receiver/commands/create",
      { installationId: IDS.lotteInst, module: 0, power: "ota", fields: { fileId: s2.id } },
      { token: tokens.admin },
    );
    assert.equal(direct.json().code, "OTA_FILE_IS_ASSET");

    res = await create();
    assert.equal(res.statusCode, 201, res.body);

    const polled = (await hmi(t.app).get(`/receiver/commands?iccid=${IDS.lotteIccid}`)).json();
    assert.equal(polled.ver, "2.6.0");
    assert.equal(polled.asset, 2);
    assert.ok(polled.url.endsWith(code.downloadPath));
    assert.ok(polled.aurl.endsWith(s2.downloadPath));
    assert.equal(polled.asize, screen2.length);
    assert.ok(polled.burl.endsWith(s1.downloadPath));
    assert.equal(polled.bsize, s1.size);
    assert.ok(JSON.stringify(polled).length < 700, "HMI command buffer (1024 B)");

    const path = new URL(polled.aurl).pathname + new URL(polled.aurl).search;
    const head = await download(t.app, path, "bytes=0-3");
    assert.equal(head.statusCode, 206);
    assert.equal(head.rawPayload.toString("latin1"), "HMIA");
  });
});
