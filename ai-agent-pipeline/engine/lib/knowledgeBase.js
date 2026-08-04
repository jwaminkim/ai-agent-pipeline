/**
 * 지식 베이스 (HTML 08번 탭 대응)
 *
 * 지금 단계에서는 벡터DB 없이 JSON 배열 + 간단한 키워드 매칭으로 구현한다.
 * (프로젝트 수가 많아지고 검색 품질이 부족해지면, patterns.json을 그대로
 *  임베딩해서 벡터DB로 옮기는 마이그레이션 경로를 열어둔다 — 아래 하단 주석 참고.)
 *
 * ⚠️ 반드시 지킬 것 (HTML 06번 탭 "최우선" 확인필요 항목):
 * - 고객사명, 계약조건, 실제 코드, REQ-ID 원문 등 프로젝트 고유 정보는 저장 금지.
 * - 사람이 검토·승인한 패턴만 저장 (addPattern에 approvedByHuman: true 필수).
 */
const path = require("path");
const { readJSON, updateJSONAtomic } = require("./atomicFile");

const KB_FILE = path.join(__dirname, "..", "..", "state", "knowledge", "patterns.json");

function loadPatterns() {
  return readJSON(KB_FILE, { patterns: [] });
}

function addPattern({ techStack, issueType, cause, issue, resolution, approvedByHuman }) {
  if (!approvedByHuman) {
    throw new Error(
      "지식 베이스에는 사람이 검토·승인한 패턴만 저장할 수 있습니다 (approvedByHuman: true 필요)."
    );
  }
  return updateJSONAtomic(
    KB_FILE,
    (data) => {
      const pattern = {
        id: `KB-${Date.now()}`,
        tech_stack: techStack,
        issue_type: issueType,
        cause,
        issue,
        resolution,
        seen_count: 1,
        created_at: new Date().toISOString(),
      };
      return { patterns: [pattern, ...(data.patterns || [])] };
    },
    { patterns: [] }
  );
}

/** 아주 단순한 키워드 매칭 검색 (벡터DB 도입 전 임시 구현) */
function searchPatterns(query) {
  const { patterns } = loadPatterns();
  const q = query.toLowerCase();
  return patterns.filter((p) =>
    [p.tech_stack, p.issue_type, p.cause, p.issue, p.resolution]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

module.exports = { loadPatterns, addPattern, searchPatterns, KB_FILE };

/*
 * 마이그레이션 경로 (규모가 커졌을 때):
 * 1. patterns.json의 각 항목을 (cause + issue + resolution) 텍스트로 합쳐 임베딩
 * 2. Chroma/Qdrant/pgvector 등에 저장, tech_stack/issue_type을 메타데이터로 태깅
 * 3. searchPatterns()를 유사도 검색 호출로 교체 (인터페이스는 그대로 유지 가능)
 */
