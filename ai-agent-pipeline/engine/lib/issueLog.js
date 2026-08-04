/**
 * 이슈 히스토리 로그 (HTML 07번 탭에 대응)
 * - 자동 해결(resolved)된 것도 전부 기록 → 반복 패턴 발견용
 * - 사람 결정이 필요한 것(pending) / 완료된 것(decided) 구분
 */
const path = require("path");
const { readJSON, updateJSONAtomic } = require("./atomicFile");

const ISSUE_FILE = path.join(__dirname, "..", "..", "state", "issues", "issue_history.json");

function loadIssues() {
  return readJSON(ISSUE_FILE, { issues: [] });
}

function addIssue({ stage, requirementIds = [], classification, status, title, description, resolution, reasoning }) {
  return updateJSONAtomic(
    ISSUE_FILE,
    (data) => {
      const issue = {
        id: `ISSUE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        at: new Date().toISOString(),
        stage,
        requirement_ids: requirementIds,
        classification, // "bug" | "design" | "requirement"
        status, // "resolved" | "pending" | "decided"
        title,
        description,
        resolution: resolution || null,
        reasoning: reasoning || null,
      };
      return { issues: [issue, ...(data.issues || [])] };
    },
    { issues: [] }
  );
}

function decideIssue(issueId, humanDecisionText) {
  return updateJSONAtomic(
    ISSUE_FILE,
    (data) => ({
      issues: (data.issues || []).map((it) =>
        it.id === issueId
          ? { ...it, status: "decided", resolution: humanDecisionText, decided_at: new Date().toISOString() }
          : it
      ),
    }),
    { issues: [] }
  );
}

module.exports = { loadIssues, addIssue, decideIssue, ISSUE_FILE };
