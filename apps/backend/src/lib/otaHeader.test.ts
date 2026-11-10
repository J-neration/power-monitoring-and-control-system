import test from "node:test";
import assert from "node:assert/strict";
import { crc32Mpeg2, OTA_HEADER_SIZE, parseOtaHeader } from "./otaHeader.js";

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
