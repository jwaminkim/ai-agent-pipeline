const { runAgentStage } = require("../lib/runAgentStage");

async function run({ target }) {
  const userPrompt = `다음 산출물에 대해 취약점, 인증/인가, 민감정보 노출, 의존성 라이선스를 검토하세요.\n대상: ${JSON.stringify(target)}`;
  return runAgentStage({ agentName: "security", role: "security", userPrompt });
}

module.exports = { run };
