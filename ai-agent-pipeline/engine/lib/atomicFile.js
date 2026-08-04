/**
 * 원자적 파일 읽기/쓰기
 * - 여러 프로세스(순차 실행이지만 PM/CTO가 동시에 상태를 읽을 수 있음)가
 *   공유 상태 파일에 접근할 때, 쓰다가 죽어서 파일이 반쪽으로 남는 걸 방지한다.
 * - 방식: 임시 파일에 먼저 쓰고, 완료되면 rename으로 교체 (rename은 OS 레벨에서 원자적).
 */
const fs = require("fs");
const path = require("path");

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function readJSON(filePath, fallback = null) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    // 파싱 실패 등 — 원본 유지, 호출자에게 fallback 반환하되 에러는 로그
    console.error(`[atomicFile] read 실패: ${filePath}`, err.message);
    return fallback;
  }
}

function writeJSONAtomic(filePath, data) {
  ensureDir(filePath);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath); // 원자적 교체
}

/** 락 없이 안전하게 갱신: 최신 값을 읽어 updater(current) 결과를 다시 씀 */
function updateJSONAtomic(filePath, updater, fallback = {}) {
  const current = readJSON(filePath, fallback);
  const next = updater(current);
  writeJSONAtomic(filePath, next);
  return next;
}

module.exports = { readJSON, writeJSONAtomic, updateJSONAtomic, ensureDir };
