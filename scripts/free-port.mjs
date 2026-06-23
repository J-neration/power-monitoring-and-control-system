/**
 * Free a TCP port before starting dev servers (avoids EADDRINUSE from zombie node).
 * Usage: node scripts/free-port.mjs 4000
 */
import { execSync } from "node:child_process";

const port = process.argv[2] ?? "4000";

function freePortWindows() {
  let out = "";
  try {
    out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
  } catch {
    return;
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    const pid = line.trim().split(/\s+/).at(-1);
    if (pid && pid !== "0") pids.add(pid);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      console.log(`[free-port] 종료: PID ${pid} (포트 ${port})`);
    } catch {
      // already gone
    }
  }
}

function freePortUnix() {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
      shell: true,
      stdio: "ignore",
    });
  } catch {
    // port already free
  }
}

if (process.platform === "win32") {
  freePortWindows();
} else {
  freePortUnix();
}
