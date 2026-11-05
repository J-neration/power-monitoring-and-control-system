import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "../lib/prisma.js";

/** 업로드 한도. HMI 앱 슬롯이 2MB 라 여유를 두고 4MB. */
export const OTA_MAX_FILE_BYTES = 4 * 1024 * 1024;

export type OtaFileMeta = {
  id: string;
  name: string;
  size: number;
  sha256: string;
  downloadToken: string;
  uploadedBy: string | null;
  createdAt: Date;
};

const META_SELECT = {
  id: true,
  name: true,
  size: true,
  sha256: true,
  downloadToken: true,
  uploadedBy: true,
  createdAt: true,
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
    const sha256 = createHash("sha256").update(input.data).digest("hex");
    return prisma.otaFile.create({
      data: {
        name: input.name,
        size: input.data.length,
        sha256,
        data: new Uint8Array(input.data),
        downloadToken: randomBytes(16).toString("hex"),
        uploadedBy: input.uploadedBy ?? null,
      },
      select: META_SELECT,
    });
  },

  async list(): Promise<OtaFileMeta[]> {
    return prisma.otaFile.findMany({ select: META_SELECT, orderBy: { createdAt: "desc" } });
  },

  async remove(id: string): Promise<boolean> {
    const res = await prisma.otaFile.deleteMany({ where: { id } });
    return res.count > 0;
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
