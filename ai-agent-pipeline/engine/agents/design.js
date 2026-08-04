const { runAgentStage } = require("../lib/runAgentStage");

async function run({ requirements, techConstraints }) {
  const isExisting = techConstraints?.project_mode === "existing";
  const noTechSpecified = !techConstraints?.language && !techConstraints?.framework;
  const modeNote = isExisting
    ? `\n\n**중요**: 이건 신규 설계가 아니라 기존 프로젝트(${techConstraints.output_path}) 수정입니다. ` +
      `먼저 그 폴더의 실제 파일 구조와 기존 아키텍처 패턴, 코딩 컨벤션을 읽어서 파악한 뒤, 그 위에서 최소한의 변경으로 요구사항을 반영하는 설계를 하세요. ` +
      `기존 구조를 임의로 갈아엎지 마세요 — 변경 범위를 필요한 만큼만 좁게 유지하세요.` +
      (noTechSpecified
        ? ` 언어/프레임워크가 별도로 지정되지 않았으니, 폴더 안 파일들(예: .csproj, package.json, requirements.txt 등)을 보고 실제 사용 중인 언어·프레임워크·버전을 스스로 판단해서 그것을 따르세요.`
        : "")
    : "";
  const refPaths = techConstraints?.reference_paths || [];
  const refNote = refPaths.length
    ? `\n\n**참고 코드 레퍼런스** (스타일 · 패턴 참고용, 직접 수정하지 말 것):\n${refPaths.map((p) => `- ${p}`).join("\n")}`
    : "";
  const userPrompt = `다음 요구사항을 기준으로 설계하세요.\n요구사항: ${JSON.stringify(requirements)}\n기술 제약: ${JSON.stringify(techConstraints)}${modeNote}${refNote}`;
  return runAgentStage({ agentName: "design", role: "design", userPrompt });
}

module.exports = { run };
