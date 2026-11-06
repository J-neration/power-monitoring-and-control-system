import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../middleware/authenticate.js";
import { parseRange } from "../lib/otaRange.js";
import {
  OTA_MAX_FILE_BYTES,
  otaDownloadPath,
  otaService,
  OtaUploadError,
  type OtaFileMeta,
} from "../services/otaService.js";

/**
 * HMI 무선 업데이트(OTA) 파일. prefix "/receiver/ota" 로 등록한다 —
 * dev Caddy 와 prod ALB 가 /receiver/* 만 API 로 넘기므로 인프라를 바꾸지 않아도 된다.
 *
 *   POST   /receiver/ota/files?name=...   관리자. 본문 application/octet-stream.
 *                                         OTA 패키지면 헤더(버전 등)를 저장, 헤더가 깨졌으면 400
 *   GET    /receiver/ota/files            관리자. 목록(메타만)
 *   DELETE /receiver/ota/files/:id        관리자
 *   GET    /receiver/ota/file/:id?t=...   HMI. Range(206) 지원. x-api-key 대신 파일별 토큰
 *
 * 파일 진위는 URL 비밀이 아니라 펌웨어 서명으로 검증한다(HMI 저장소 docs/OTA_DEVELOPMENT_PLAN.md 6장).
 */

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, "영문, 숫자, . _ - 만 쓸 수 있습니다.");

const idParams = z.object({ id: z.string().min(1).max(64) });
const downloadQuery = z.object({ t: z.string().max(128).optional() });

const toDto = (f: OtaFileMeta) => ({
  id: f.id,
  name: f.name,
  size: f.size,
  sha256: f.sha256,
  uploadedBy: f.uploadedBy,
  createdAt: f.createdAt,
  version: f.version,
  productId: f.productId,
  assetVersion: f.assetVersion,
  imageSize: f.imageSize,
  downloadPath: otaDownloadPath(f),
});

export const otaRoutes: FastifyPluginAsync = async (server) => {
  // 이 플러그인 안에서만 바이너리 본문을 Buffer 로 받는다(서버 기본 파서는 문자열).
  server.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: OTA_MAX_FILE_BYTES },
    (_request, body, done) => done(null, body),
  );

  server.post(
    "/files",
    { preHandler: requireAdmin, bodyLimit: OTA_MAX_FILE_BYTES },
    async (request, reply) => {
      const name = nameSchema.safeParse((request.query as { name?: unknown }).name);
      if (!name.success) {
        return reply.status(400).send({ message: "name 쿼리가 올바르지 않습니다.", issues: name.error.issues });
      }
      const body = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply
          .status(400)
          .send({ message: "Content-Type: application/octet-stream 으로 파일 내용을 보내야 합니다." });
      }

      let file: OtaFileMeta;
      try {
        file = await otaService.create({
          name: name.data,
          data: body,
          uploadedBy: request.user.username,
        });
      } catch (error) {
        if (error instanceof OtaUploadError) return reply.status(400).send({ message: error.message });
        throw error;
      }
      request.log.info(
        { otaFileId: file.id, name: file.name, size: file.size, version: file.version },
        "ota file uploaded",
      );
      return reply.status(201).send({ file: toDto(file) });
    },
  );

  server.get("/files", { preHandler: requireAdmin }, async () => {
    const files = await otaService.list();
    return { files: files.map(toDto) };
  });

  server.delete("/files/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ message: "잘못된 id 입니다." });
    const removed = await otaService.remove(params.data.id);
    if (!removed) return reply.status(404).send({ message: "파일이 없습니다." });
    return reply.status(204).send();
  });

  server.get("/file/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const query = downloadQuery.safeParse(request.query);
    if (!params.success || !query.success) return reply.status(404).send({ message: "Not Found" });

    const file = await otaService.findForDownload(params.data.id, query.data.t ?? "");
    if (!file) return reply.status(404).send({ message: "Not Found" });

    reply.header("Accept-Ranges", "bytes");
    reply.header("Cache-Control", "no-store");

    const range = parseRange(request.headers.range, file.size);
    if (range.kind === "unsatisfiable") {
      reply.header("Content-Range", `bytes */${file.size}`);
      return reply.status(416).send({ message: "Range Not Satisfiable" });
    }

    const start = range.kind === "partial" ? range.start : 0;
    const end = range.kind === "partial" ? range.end : file.size - 1;
    const data = await otaService.readRange(file.id, start, end);

    request.log.info(
      { otaFileId: file.id, start, end, bytes: data.length, partial: range.kind === "partial" },
      "ota file download",
    );

    reply.header("Content-Type", "application/octet-stream");
    reply.header("Content-Length", data.length);
    if (range.kind === "partial") {
      reply.header("Content-Range", `bytes ${start}-${end}/${file.size}`);
      reply.status(206);
    }
    return reply.send(data);
  });
};
