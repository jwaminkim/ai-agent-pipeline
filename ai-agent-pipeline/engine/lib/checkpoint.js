/**
 * 체크포인트 관리
 * - pipeline_status.json은 오케스트레이터(엔진)만 쓴다.
 * - 에이전트 선택(enabled_stages)은 별도 파일(agent_selection.json)로 분리되어 있음
 *   — 대시보드가 그 파일을 쓰고, 여기 pipeline_status.json은 건드리지 않는다
 *     (두 프로세스가 같은 파일을 동시에 쓰다가 한쪽 변경이 유실되는 경합 조건 방지).
 * - 재개 시 이 파일을 읽어 last_completed_stage 이후부터 이어간다.
 */
const path = require("path");
const { readJSON, writeJSONAtomic } = require("./atomicFile");

const STATE_DIR = path.join(__dirname, "..", "..", "state");
const STATUS_FILE = path.join(STATE_DIR, "pipeline_status.json");

function loadStatus() {
  return readJSON(STATUS_FILE, {
    project_id: null,
    current_stage: null,
    last_completed_stage: null,
    status: "idle", // idle | running | waiting_for_reset | waiting_for_human | done | error
    session_started_at: null,
    estimated_reset_at: null,
    limit_type: null, // "5hour" | "weekly" | null
    updated_at: new Date().toISOString(),
  });
}

function saveStatus(patch) {
  const current = loadStatus();
  const next = { ...current, ...patch, updated_at: new Date().toISOString() };
  writeJSONAtomic(STATUS_FILE, next);
  return next;
}

function markStageComplete(stageId) {
  return saveStatus({ last_completed_stage: stageId });
}

function markWaitingForReset(limitType, estimatedResetAt) {
  return saveStatus({
    status: "waiting_for_reset",
    limit_type: limitType,
    estimated_reset_at: estimatedResetAt,
  });
}

function markRunning(stageId) {
  return saveStatus({ status: "running", current_stage: stageId });
}

function markWaitingForHuman(reason) {
  return saveStatus({ status: "waiting_for_human", human_wait_reason: reason || null });
}

module.exports = {
  STATE_DIR,
  STATUS_FILE,
  loadStatus,
  saveStatus,
  markStageComplete,
  markWaitingForReset,
  markRunning,
  markWaitingForHuman,
};
