const { runAgentStage } = require("../lib/runAgentStage");

async function run({ target }) {
  const userPrompt = `CI/CD 구성, 배포, 모니터링/롤백 준비를 진행하세요.\n대상: ${JSON.stringify(target)}`;
  return runAgentStage({ agentName: "devops", role: "devops", userPrompt });
}

module.exports = { run };
