/**
 * HMI OTA 패키지 헤더(256바이트) 해석.
 * 형식은 HMI 저장소 Core/Inc/ota/ota_image.h, tools/ota_pack.py 와 같다.
 *
 *   0  magic "HMI1"(LE 0x31494D48)   4  header_version(u16)=1   6  header_len(u16)=256
 *   8  product_id   12 image_version(0x00MMmmpp)   16 asset_version   20 image_size
 *   24 image_crc32  28 sha256[32]   60 signature[64]   ...   252 header_crc32
 *
 * header_crc32 = CRC-32/MPEG-2(헤더 [0,252), 서명 칸 0으로). 서버는 서명을 검사하지 않는다
 * (공개키 검증은 기기가 한다). 여기서는 업로드 실수(잘못된 파일, 잘린 파일)만 막는다.
 */

export const OTA_HEADER_SIZE = 256;
const MAGIC = 0x31494d48;
const SIG_OFF = 60;
const SIG_LEN = 64;
const HCRC_OFF = 252;

export type OtaHeaderInfo = {
  version: string; // "2.4.0"
  versionCode: number; // 0x00020400
  productId: number;
  assetVersion: number;
  imageSize: number;
};

export type OtaHeaderResult =
  | { kind: "none" } // 헤더가 없는 일반 파일(예: 다운로드 시험 파일)
  | { kind: "invalid"; reason: string }
  | { kind: "ok"; header: OtaHeaderInfo };

/** CRC-32/MPEG-2: poly 0x04C11DB7, init 0xFFFFFFFF, 반사 없음, 최종 XOR 없음. */
export const crc32Mpeg2 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte << 24;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
    }
  }
  return crc >>> 0;
};

export const versionString = (code: number) =>
  `${(code >>> 16) & 0xff}.${(code >>> 8) & 0xff}.${code & 0xff}`;

export const parseOtaHeader = (data: Buffer): OtaHeaderResult => {
  if (data.length < 4 || data.readUInt32LE(0) !== MAGIC) return { kind: "none" };
  if (data.length < OTA_HEADER_SIZE) return { kind: "invalid", reason: "파일이 헤더(256바이트)보다 짧습니다" };

  const headerVersion = data.readUInt16LE(4);
  const headerLen = data.readUInt16LE(6);
  if (headerVersion !== 1 || headerLen !== OTA_HEADER_SIZE) {
    return { kind: "invalid", reason: `지원하지 않는 헤더 형식(version ${headerVersion}, len ${headerLen})` };
  }

  const zeroed = Buffer.from(data.subarray(0, HCRC_OFF));
  zeroed.fill(0, SIG_OFF, SIG_OFF + SIG_LEN);
  if (crc32Mpeg2(zeroed) !== data.readUInt32LE(HCRC_OFF)) {
    return { kind: "invalid", reason: "헤더 CRC 가 맞지 않습니다" };
  }

  const imageSize = data.readUInt32LE(20);
  if (imageSize + OTA_HEADER_SIZE !== data.length) {
    return {
      kind: "invalid",
      reason: `파일 크기 ${data.length} 가 헤더(256 + ${imageSize})와 다릅니다`,
    };
  }

  const versionCode = data.readUInt32LE(12);
  return {
    kind: "ok",
    header: {
      version: versionString(versionCode),
      versionCode,
      productId: data.readUInt32LE(8),
      assetVersion: data.readUInt32LE(16),
      imageSize,
    },
  };
};
