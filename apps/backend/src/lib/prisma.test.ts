import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

// DB 클라이언트는 lib/prisma.ts 하나만 만든다. 서비스가 따로 만들면 DATABASE_SSL_CA_FILE(RDS TLS 검증)과
// DATABASE_POOL_MAX 가 빠져, AWS 에서 "no pg_hba.conf entry ... no encryption" 으로 접속이 거부된다.
const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowed = path.join(srcDir, "lib", "prisma.ts");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });

describe("shared Prisma client", () => {
  it("is constructed only in lib/prisma.ts", () => {
    const offenders = sourceFiles(srcDir)
      .filter((file) => file !== allowed)
      .filter((file) => /new\s+PrismaClient\s*\(/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(srcDir, file));
    assert.deepEqual(offenders, []);
  });
});
