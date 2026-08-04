import fs from "fs";
import path from "path";

// dashboard/ 와 engine/ 이 공유하는 최상위 state/ 폴더
export const STATE_DIR = path.join(process.cwd(), "..", "state");

export function readJSON<T>(relPath: string, fallback: T): T {
  try {
    const full = path.join(STATE_DIR, relPath);
    const raw = fs.readFileSync(full, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(relPath: string, data: unknown) {
  const full = path.join(STATE_DIR, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const tmp = `${full}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, full);
}

export function listAgentStatusCards() {
  const dir = path.join(STATE_DIR, "agents");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".status.json"))
    .map((f) => readJSON(path.join("agents", f), null))
    .filter(Boolean);
}
