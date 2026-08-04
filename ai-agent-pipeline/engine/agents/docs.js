const { runAgentStage } = require("../lib/runAgentStage");

async function run({ project }) {
  const userPrompt = `README, API 문서, 배포 가이드, 요구사항 추적 매트릭스를 작성하세요.\n프로젝트 정보: ${JSON.stringify(project)}`;
  return runAgentStage({ agentName: "docs", role: "docs", userPrompt });
}

module.exports = { run };
