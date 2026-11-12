/**
 * HMI OTA 패키지 헤더(256바이트) 해석. 두 종류가 있다.
 *
 * 코드 패키지 (매직 "HMI1"): HMI 저장소 Core/Inc/ota/ota_image.h, tools/ota_pack.py
 *
 *   0  magic "HMI1"(LE 0x31494D48)   4  header_version(u16)=1   6  header_len(u16)=256
 *   8  product_id   12 image_version(0x00MMmmpp)   16 asset_version   20 image_size
 *   24 image_crc32  28 sha256[32]   60 signature[64]   ...   252 header_crc32
 *
 * 화면 데이터 패키지 (매직 "HMIA", OTA 2부): Core/Inc/ota/ota_asset_image.h, ota_pack.py --asset
 *
 *   0  magic "HMIA"(LE 0x41494D48)   4  header_version(u16)=1   6  header_len(u16)=256
 *   8  product_id   12 asset_version   16 raw_size   20 dest_offset   24 block_size
 *   28 block_count  32 body_size   36 body_crc32   40 raw_sha256[32]   72 signature[64]
 *   136 fingerprint[32]   168 build_time   ...   252 header_crc32
 *   파일 = 헤더 256 + 본문 body_size. body_crc32 = CRC-32/MPEG-2(본문)
 *
 * header_crc32 = CRC-32/MPEG-2(헤더 [0,252), 서명 칸 0으로). 서버는 서명을 검사하지 않는다
 * (공개키 검증은 기기가 한다). 여기서는 업로드 실수(잘못된 파일, 잘린 파일)만 막는다.
 */

export const OTA_HEADER_SIZE = 256;
const MAGIC = 0x31494d48;
const ASSET_MAGIC = 0x41494d48;
const SIG_OFF = 60;
const ASSET_SIG_OFF = 72;
const SIG_LEN = 64;
const HCRC_OFF = 252;
/** 화면 패키지 상한 = HMI SDRAM 수신 자리(OTA_ASSET_PKG_MAX, 8MB) */
export const OTA_ASSET_PKG_MAX = 8 * 1024 * 1024;

export type OtaHeaderInfo = {
  version: string; // "2.4.0"
  versionCode: number; // 0x00020400
  productId: number;
  assetVersion: number;
  imageSize: number;
};

export type OtaAssetHeaderInfo = {
  productId: number;
  /** 화면 데이터 번호 (HMI OTA_ASSET_VERSION) */
  assetVersion: number;
  /** 풀린 화면 데이터 크기 (라이브 영역에 쓰는 바이트) */
  rawSize: number;
  blockCount: number;
  bodySize: number;
  /** 풀린 화면 데이터 SHA-256 (hex 소문자) */
  rawSha256: string;
};

export type OtaHeaderResult =
  | { kind: "none" } // 헤더가 없는 일반 파일(예: 다운로드 시험 파일)
  | { kind: "invalid"; reason: string }
  | { kind: "ok"; header: OtaHeaderInfo } // 코드 패키지
  | { kind: "asset"; header: OtaAssetHeaderInfo }; // 화면 데이터 패키지

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 24;
    for (let b = 0; b < 8; b++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
    t[i] = c >>> 0;
  }
  return t;
})();

/** CRC-32/MPEG-2: poly 0x04C11DB7, init 0xFFFFFFFF, 반사 없음, 최종 XOR 없음. */
export const crc32Mpeg2 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ data[i]!) & 0xff]!) >>> 0;
  }
  return crc >>> 0;
};

const headerCrcOk = (data: Buffer, sigOff: number) => {
  const zeroed = Buffer.from(data.subarray(0, HCRC_OFF));
  zeroed.fill(0, sigOff, sigOff + SIG_LEN);
  return crc32Mpeg2(zeroed) === data.readUInt32LE(HCRC_OFF);
};

const parseAssetHeader = (data: Buffer): OtaHeaderResult => {
  if (data.length < OTA_HEADER_SIZE) return { kind: "invalid", reason: "파일이 헤더(256바이트)보다 짧습니다" };
  const headerVersion = data.readUInt16LE(4);
  const headerLen = data.readUInt16LE(6);
  if (headerVersion !== 1 || headerLen !== OTA_HEADER_SIZE) {
    return { kind: "invalid", reason: `지원하지 않는 화면 패키지 헤더(version ${headerVersion}, len ${headerLen})` };
  }
  if (!headerCrcOk(data, ASSET_SIG_OFF)) return { kind: "invalid", reason: "헤더 CRC 가 맞지 않습니다" };

  const bodySize = data.readUInt32LE(32);
  if (bodySize + OTA_HEADER_SIZE !== data.length) {
    return { kind: "invalid", reason: `파일 크기 ${data.length} 가 헤더(256 + ${bodySize})와 다릅니다` };
  }
  if (data.length > OTA_ASSET_PKG_MAX) {
    return { kind: "invalid", reason: `화면 패키지가 ${OTA_ASSET_PKG_MAX} 바이트를 넘습니다` };
  }
  const assetVersion = data.readUInt32LE(12);
  const rawSize = data.readUInt32LE(16);
  const blockCount = data.readUInt32LE(28);
  if (assetVersion < 1 || rawSize === 0 || blockCount === 0) {
    return { kind: "invalid", reason: "화면 패키지 헤더 값이 올바르지 않습니다" };
  }
  if (crc32Mpeg2(data.subarray(OTA_HEADER_SIZE)) !== data.readUInt32LE(36)) {
    return { kind: "invalid", reason: "본문 CRC 가 맞지 않습니다(파일 손상)" };
  }
  return {
    kind: "asset",
    header: {
      productId: data.readUInt32LE(8),
      assetVersion,
      rawSize,
      blockCount,
      bodySize,
      rawSha256: data.subarray(40, 72).toString("hex"),
    },
  };
};

export const versionString = (code: number) =>
  `${(code >>> 16) & 0xff}.${(code >>> 8) & 0xff}.${code & 0xff}`;

export const parseOtaHeader = (data: Buffer): OtaHeaderResult => {
  if (data.length >= 4 && data.readUInt32LE(0) === ASSET_MAGIC) return parseAssetHeader(data);
  if (data.length < 4 || data.readUInt32LE(0) !== MAGIC) return { kind: "none" };
  if (data.length < OTA_HEADER_SIZE) return { kind: "invalid", reason: "파일이 헤더(256바이트)보다 짧습니다" };

  const headerVersion = data.readUInt16LE(4);
  const headerLen = data.readUInt16LE(6);
  if (headerVersion !== 1 || headerLen !== OTA_HEADER_SIZE) {
    return { kind: "invalid", reason: `지원하지 않는 헤더 형식(version ${headerVersion}, len ${headerLen})` };
  }

  if (!headerCrcOk(data, SIG_OFF)) {
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
