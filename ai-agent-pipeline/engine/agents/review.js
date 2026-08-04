const { runAgentStage } = require("../lib/runAgentStage");

async function run({ changedFiles, techConstraints }) {
  const userPrompt = `다음 변경사항을 기술스택 준수 여부·보안·컨벤션 관점에서 체크리스트로 검토하세요.\n변경파일: ${JSON.stringify(changedFiles)}\n기술제약: ${JSON.stringify(techConstraints)}`;
  return runAgentStage({ agentName: "review", role: "review", userPrompt });
}

module.exports = { run };
