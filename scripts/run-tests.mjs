/**
 * 디렉터리 아래의 *.test.ts 를 모아 node:test 로 실행한다.
 *
 * Usage: node <repo>/scripts/run-tests.mjs <dir...> [--serial] [--import <module>] [-- <node --test 옵션>]
 *   예) node ../../scripts/run-tests.mjs src
 *       node ../../scripts/run-tests.mjs test/integration --serial --import ./test/integration/setup.ts
 *       yarn test -- --test-name-pattern="login"
 *
 * 왜 직접 모으나:
 *   `node --test "src/**\/*.test.ts"` 의 글롭 확장은 Node 21+ 에만 있다. Node 20 에서는
 *   "Could not find …" 로 실패하고, 셸 글롭(**)은 Windows cmd 에서 동작하지 않는다.
 *   파일 목록을 여기서 만들어 넘기면 Node 20/22 · macOS/Windows/CI 에서 똑같이 돈다.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SKIP_DIRS = new Set(["node_modules", "dist", ".next", "generated", "coverage"]);

const args = process.argv.slice(2);
const passthroughAt = args.indexOf("--");
const own = passthroughAt === -1 ? args : args.slice(0, passthroughAt);
const passthrough = passthroughAt === -1 ? [] : args.slice(passthroughAt + 1);

const dirs = [];
const imports = [];
let serial = false;
for (let i = 0; i < own.length; i++) {
  const arg = own[i];
  if (arg === "--serial") serial = true;
  else if (arg === "--import") imports.push(own[++i]);
  else if (arg.startsWith("--")) passthrough.push(arg);
  else dirs.push(arg);
}

if (dirs.length === 0) {
  console.error("[run-tests] 테스트 디렉터리를 지정하세요. 예) node scripts/run-tests.mjs src");
  process.exit(2);
}

const collect = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
};

const files = dirs.flatMap((dir) => collect(path.resolve(dir))).sort();
if (files.length === 0) {
  console.error(`[run-tests] ${dirs.join(", ")} 아래에 *.test.ts 가 없습니다.`);
  process.exit(1);
}

// 상대 경로 import 는 node 가 cwd 기준 패키지명으로 해석하므로 file URL 로 넘긴다.
const toImportSpecifier = (spec) =>
  spec.startsWith(".") || path.isAbsolute(spec)
    ? pathToFileURL(path.resolve(spec)).href
    : spec;

// 터미널이 아니면(CI·파이프) node 기본값이 TAP 이라 읽기 어렵다 — 따로 지정하지 않으면 spec 으로.
const reporter = passthrough.some((arg) => arg.startsWith("--test-reporter"))
  ? []
  : ["--test-reporter=spec"];

const nodeArgs = [
  "--test",
  ...reporter,
  "--import",
  "tsx",
  ...imports.flatMap((spec) => ["--import", toImportSpecifier(spec)]),
  // DB 를 공유하는 통합 테스트는 파일 단위로도 동시에 돌리면 서로의 데이터를 지운다.
  ...(serial ? ["--test-concurrency=1"] : []),
  ...passthrough,
  ...files,
];

const result = spawnSync(process.execPath, nodeArgs, { stdio: "inherit" });
process.exit(result.status ?? 1);
