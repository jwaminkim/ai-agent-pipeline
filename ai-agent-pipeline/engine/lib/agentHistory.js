/**
 * 에이전트별 대화 히스토리 + 상태 요약 카드
 *
 * - <agent>.history.json  : 실제 작업용 원본 대화 히스토리 (계속 누적, 압축 대상)
 * - <agent>.status.json   : CTO가 평소에 읽는 가벼운 요약 카드 (원본을 안 읽어도 되게)
 *
 * ⚠️ TO VERIFY(HTML 06번 탭): 압축 임계값(MAX_HISTORY_TURNS_BEFORE_COMPRESS)은
 *    실제 운영하면서 컨텍스트 윈도우 초과 빈도를 보고 조정할 것.
 */
const path = require("path");
const { readJSON, writeJSONAtomic } = require("./atomicFile");

const STATE_DIR = path.join(__dirname, "..", "..", "state", "agents");
const MAX_HISTORY_TURNS_BEFORE_COMPRESS = 20; // 이 턴 수를 넘으면 오래된 부분을 요약으로 대체

function historyPath(agentName) {
  return path.join(STATE_DIR, `${agentName}.history.json`);
}
function statusPath(agentName) {
  return path.join(STATE_DIR, `${agentName}.status.json`);
}

function loadHistory(agentName) {
  return readJSON(historyPath(agentName), { agent: agentName, turns: [], summary_of_older: null });
}

function appendTurn(agentName, turn) {
  const h = loadHistory(agentName);
  h.turns.push({ ...turn, at: new Date().toISOString() });

  if (h.turns.length > MAX_HISTORY_TURNS_BEFORE_COMPRESS) {
    // 압축 훅: 실제로는 별도 요약 호출을 통해 오래된 턴을 압축해야 함 (TODO: 요약 에이전트 연동)
    const toCompress = h.turns.slice(0, h.turns.length - MAX_HISTORY_TURNS_BEFORE_COMPRESS);
    const recent = h.turns.slice(h.turns.length - MAX_HISTORY_TURNS_BEFORE_COMPRESS);
    h.summary_of_older = h.summary_of_older
      ? `${h.summary_of_older}\n(+ ${toCompress.length}건 추가 압축 필요 — TODO: 실제 요약 호출 연동)`
      : `(오래된 대화 ${toCompress.length}건 — TODO: 실제 요약 호출 연동)`;
    h.turns = recent;
  }

  writeJSONAtomic(historyPath(agentName), h);
  return h;
}

function updateStatusCard(agentName, patch) {
  const current = readJSON(statusPath(agentName), {
    agent: agentName,
    current_status: "idle",
    summary: "",
    open_issues: [],
    last_updated: null,
  });
  const next = { ...current, ...patch, last_updated: new Date().toISOString() };
  writeJSONAtomic(statusPath(agentName), next);
  return next;
}

function loadAllStatusCards(agentNames) {
  return agentNames.map((name) => readJSON(statusPath(name), null)).filter(Boolean);
}

module.exports = { loadHistory, appendTurn, updateStatusCard, loadAllStatusCards, historyPath, statusPath };
