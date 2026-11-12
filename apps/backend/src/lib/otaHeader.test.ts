import test from "node:test";
import assert from "node:assert/strict";
import { crc32Mpeg2, OTA_ASSET_PKG_MAX, OTA_HEADER_SIZE, parseOtaHeader } from "./otaHeader.js";

/** tools/ota_pack.py 의 build_header 와 같은 배치로 시험용 패키지를 만든다. */
const makePackage = (opts: {
  version?: number;
  productId?: number;
  assetVersion?: number;
  imageSize?: number;
} = {}) => {
  const imageSize = opts.imageSize ?? 1000;
  const pkg = Buffer.alloc(OTA_HEADER_SIZE + imageSize, 0xab);
  pkg.fill(0, 0, OTA_HEADER_SIZE);
  pkg.writeUInt32LE(0x31494d48, 0);
  pkg.writeUInt16LE(1, 4);
  pkg.writeUInt16LE(OTA_HEADER_SIZE, 6);
  pkg.writeUInt32LE(opts.productId ?? 1, 8);
  pkg.writeUInt32LE(opts.version ?? 0x00020400, 12);
  pkg.writeUInt32LE(opts.assetVersion ?? 1, 16);
  pkg.writeUInt32LE(imageSize, 20);
  pkg.writeUInt32LE(crc32Mpeg2(pkg.subarray(0, 252)), 252);
  pkg.fill(0x5a, 60, 124); // 서명 칸: CRC 계산에서는 0으로 본다
  return pkg;
};

test("crc32Mpeg2 matches the STM32 CRC unit check value", () => {
  assert.equal(crc32Mpeg2(Buffer.from("123456789")), 0x0376e6e7);
});

test("parseOtaHeader reads a valid package", () => {
  const r = parseOtaHeader(makePackage({ version: 0x00020305, assetVersion: 3 }));
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;
  assert.deepEqual(r.header, {
    version: "2.3.5",
    versionCode: 0x00020305,
    productId: 1,
    assetVersion: 3,
    imageSize: 1000,
  });
});

test("parseOtaHeader treats a file without the magic as a plain file", () => {
  assert.equal(parseOtaHeader(Buffer.alloc(2000, 0x11)).kind, "none");
  assert.equal(parseOtaHeader(Buffer.alloc(2)).kind, "none");
});

test("parseOtaHeader rejects a damaged header or a cut file", () => {
  const badCrc = makePackage();
  badCrc[13] ^= 1; // version byte, outside the signature
  assert.equal(parseOtaHeader(badCrc).kind, "invalid");

  const cut = makePackage().subarray(0, OTA_HEADER_SIZE + 500);
  assert.equal(parseOtaHeader(cut).kind, "invalid");

  const short = makePackage().subarray(0, 100);
  assert.equal(parseOtaHeader(short).kind, "invalid");
});

/** tools/ota_pack.py --asset 와 같은 배치(Core/Inc/ota/ota_asset_image.h)의 화면 데이터 패키지. */
const makeAsset = (opts: { assetVersion?: number; bodySize?: number } = {}) => {
  const bodySize = opts.bodySize ?? 5000;
  const pkg = Buffer.alloc(OTA_HEADER_SIZE + bodySize);
  for (let i = OTA_HEADER_SIZE; i < pkg.length; i++) pkg[i] = (i * 7) & 0xff;
  pkg.writeUInt32LE(0x41494d48, 0); // "HMIA"
  pkg.writeUInt16LE(1, 4);
  pkg.writeUInt16LE(OTA_HEADER_SIZE, 6);
  pkg.writeUInt32LE(1, 8);
  pkg.writeUInt32LE(opts.assetVersion ?? 2, 12);
  pkg.writeUInt32LE(18_696_924, 16); // raw size
  pkg.writeUInt32LE(0, 20);
  pkg.writeUInt32LE(0x10000, 24);
  pkg.writeUInt32LE(286, 28);
  pkg.writeUInt32LE(bodySize, 32);
  pkg.writeUInt32LE(crc32Mpeg2(pkg.subarray(OTA_HEADER_SIZE)), 36);
  pkg.fill(0xc3, 40, 72); // raw sha256
  pkg.writeUInt32LE(crc32Mpeg2(pkg.subarray(0, 252)), 252);
  pkg.fill(0x5a, 72, 136); // signature: zero for the CRC
  return pkg;
};

test("crc32Mpeg2 table version matches the bit loop", () => {
  const data = Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 131 + 17) & 0xff));
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte << 24;
    for (let b = 0; b < 8; b++) crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
  }
  assert.equal(crc32Mpeg2(data), crc >>> 0);
});

test("parseOtaHeader reads a screen data package (HMIA)", () => {
  const r = parseOtaHeader(makeAsset({ assetVersion: 2 }));
  assert.equal(r.kind, "asset");
  if (r.kind !== "asset") return;
  assert.deepEqual(r.header, {
    productId: 1,
    assetVersion: 2,
    rawSize: 18_696_924,
    blockCount: 286,
    bodySize: 5000,
    rawSha256: "c3".repeat(32),
  });
});

test("parseOtaHeader rejects a damaged or cut screen data package", () => {
  const badHeader = makeAsset();
  badHeader[12] ^= 1; // asset version
  assert.equal(parseOtaHeader(badHeader).kind, "invalid");

  const badBody = makeAsset();
  badBody[OTA_HEADER_SIZE + 100] ^= 1;
  const r = parseOtaHeader(badBody);
  assert.equal(r.kind, "invalid");
  if (r.kind === "invalid") assert.match(r.reason, /본문 CRC/);

  assert.equal(parseOtaHeader(makeAsset().subarray(0, OTA_HEADER_SIZE + 10)).kind, "invalid");
  assert.equal(parseOtaHeader(makeAsset().subarray(0, 100)).kind, "invalid");
  assert.equal(parseOtaHeader(makeAsset({ bodySize: OTA_ASSET_PKG_MAX })).kind, "invalid");
});

// The real screen data 1 package (HMI repo release/test), when this machine has it.
const REAL = process.env.HMI_ASSET_PKG;
test("parseOtaHeader reads the real HMI_asset_1.ota", { skip: !REAL }, async () => {
  const { readFile } = await import("node:fs/promises");
  const r = parseOtaHeader(await readFile(REAL!));
  assert.equal(r.kind, "asset");
  if (r.kind !== "asset") return;
  assert.equal(r.header.assetVersion, 1);
  assert.equal(r.header.rawSize, 18_696_924);
  assert.equal(r.header.blockCount, 286);
});
