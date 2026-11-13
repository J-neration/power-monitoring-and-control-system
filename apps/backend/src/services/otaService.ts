import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { OTA_ASSET_PKG_MAX, parseOtaHeader } from "../lib/otaHeader.js";
import { prisma } from "../lib/prisma.js";

/** 업로드 한도 = 화면 데이터 패키지 상한(HMI SDRAM 수신 자리 8MB). 코드 패키지는 2MB 이하. */
export const OTA_MAX_FILE_BYTES = OTA_ASSET_PKG_MAX;

export type OtaFileKind = "code" | "asset";

export type OtaFileMeta = {
  id: string;
  name: string;
  size: number;
  sha256: string;
  downloadToken: string;
  uploadedBy: string | null;
  createdAt: Date;
  /** "code" | "asset". 헤더 없는 일반 파일이면 null */
  kind: string | null;
  /** 패키지 헤더 값. 헤더 없는 일반 파일이면 null. version 은 코드 패키지만 */
  version: string | null;
  productId: number | null;
  assetVersion: number | null;
  imageSize: number | null;
  /** 화면 패키지의 풀린 화면 데이터 SHA-256 */
  rawSha256: string | null;
};

/** 헤더(매직 "HMI1")는 있는데 깨진 파일. 라우트에서 400 으로 바꾼다. */
export class OtaUploadError extends Error {}

/** 그 번호의 마지막 화면 패키지는 지울 수 없다(보관본으로 다시 쓰임). 라우트에서 409. */
export class OtaDeleteRefused extends Error {}

const META_SELECT = {
  id: true,
  name: true,
  size: true,
  sha256: true,
  downloadToken: true,
  uploadedBy: true,
  createdAt: true,
  kind: true,
  version: true,
  productId: true,
  assetVersion: true,
  imageSize: true,
  rawSha256: true,
} as const;

/** HMI 가 받는 경로. 모뎀 URL 한도(2048자) 안에 들어가도록 짧게 유지한다. */
export const otaDownloadPath = (f: Pick<OtaFileMeta, "id" | "downloadToken">) =>
  `/receiver/ota/file/${f.id}?t=${f.downloadToken}`;

const tokensEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

export const otaService = {
  async create(input: { name: string; data: Buffer; uploadedBy?: string | null }): Promise<OtaFileMeta> {
    const parsed = parseOtaHeader(input.data);
    if (parsed.kind === "invalid") throw new OtaUploadError(`OTA 패키지 헤더 오류: ${parsed.reason}`);
    const code = parsed.kind === "ok" ? parsed.header : null;
    const asset = parsed.kind === "asset" ? parsed.header : null;
    const sha256 = createHash("sha256").update(input.data).digest("hex");
    return prisma.otaFile.create({
      data: {
        name: input.name,
        size: input.data.length,
        sha256,
        data: new Uint8Array(input.data),
        downloadToken: randomBytes(16).toString("hex"),
        uploadedBy: input.uploadedBy ?? null,
        kind: code ? "code" : asset ? "asset" : null,
        version: code?.version ?? null,
        productId: code?.productId ?? asset?.productId ?? null,
        assetVersion: code?.assetVersion ?? asset?.assetVersion ?? null,
        imageSize: code?.imageSize ?? asset?.rawSize ?? null,
        rawSha256: asset?.rawSha256 ?? null,
      },
      select: META_SELECT,
    });
  },

  async list(): Promise<OtaFileMeta[]> {
    return prisma.otaFile.findMany({ select: META_SELECT, orderBy: { createdAt: "desc" } });
  },

  async findMeta(id: string): Promise<OtaFileMeta | null> {
    return prisma.otaFile.findUnique({ where: { id }, select: META_SELECT });
  },

  /** 가장 최근에 올린 화면 패키지 (그 번호, 그 제품). 없으면 null */
  async findLatestAsset(assetVersion: number, productId: number): Promise<OtaFileMeta | null> {
    return prisma.otaFile.findFirst({
      where: { kind: "asset", assetVersion, productId },
      select: META_SELECT,
      orderBy: { createdAt: "desc" },
    });
  },

  /** 지운 개수 0 이면 없는 id. 그 번호의 마지막 화면 패키지면 OtaDeleteRefused. */
  async remove(id: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const f = await tx.otaFile.findUnique({
        where: { id },
        select: { kind: true, assetVersion: true, productId: true },
      });
      if (!f) return false;
      if (f.kind === "asset") {
        const others = await tx.otaFile.count({
          where: { kind: "asset", assetVersion: f.assetVersion, productId: f.productId, id: { not: id } },
        });
        if (others === 0) {
          throw new OtaDeleteRefused(
            `화면 데이터 ${f.assetVersion}번의 마지막 패키지라 지울 수 없습니다(되돌리기용 보관본으로 쓰입니다).`,
          );
        }
      }
      const res = await tx.otaFile.deleteMany({ where: { id } });
      return res.count > 0;
    });
  },

  /** 토큰이 맞을 때만 메타를 준다. 없는 id 와 틀린 토큰을 구분하지 않는다. */
  async findForDownload(id: string, token: string): Promise<OtaFileMeta | null> {
    const f = await prisma.otaFile.findUnique({ where: { id }, select: META_SELECT });
    if (!f || !token || !tokensEqual(f.downloadToken, token)) return null;
    return f;
  },

  /** [start, end] (end 포함) 바이트만 DB 에서 잘라 읽는다. 파일 전체를 메모리에 올리지 않는다. */
  async readRange(id: string, start: number, end: number): Promise<Buffer> {
    const rows = await prisma.$queryRaw<{ chunk: Uint8Array | null }[]>`
      SELECT substring("data" FROM ${start + 1}::int FOR ${end - start + 1}::int) AS chunk
      FROM "OtaFile" WHERE "id" = ${id}`;
    const chunk = rows[0]?.chunk;
    return chunk ? Buffer.from(chunk) : Buffer.alloc(0);
  },
};
