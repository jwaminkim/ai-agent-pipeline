const { runAgentStage } = require("../lib/runAgentStage");

/** part: "db" | "backend" | "frontend" */
async function run({ part, interfaceContract, techConstraints }) {
  const outputPath = techConstraints?.output_path;
  const isExisting = techConstraints?.project_mode === "existing";

  const noTechSpecified = !techConstraints?.language && !techConstraints?.framework;
  let outputNote;
  if (outputPath && isExisting) {
    outputNote =
      `\n\n이 프로젝트의 작업 디렉토리는 기존 프로젝트 ${outputPath} 로 설정되어 있습니다 (Claude Code가 이 폴더를 기준으로 실행됨).\n` +
      `**먼저 이 폴더의 기존 파일 구조·코딩 컨벤션·네이밍 규칙을 확인**하고, 그 스타일을 그대로 따라서 필요한 부분만 수정하세요. ` +
      `관련 없는 기존 코드는 건드리지 마세요. 이 폴더가 Git 저장소라면, 변경 후 diff로 확인 가능하도록 커밋하세요.` +
      (noTechSpecified ? ` 언어/프레임워크가 지정 안 됐으니 폴더 안 실제 파일들을 보고 스스로 판단하세요.` : "");
  } else if (outputPath) {
    outputNote = `\n\n이 프로젝트의 작업 디렉토리는 이미 ${outputPath} 로 설정되어 있습니다 (Claude Code가 이 폴더를 기준으로 실행됨). 이 폴더 기준 상대경로로 파일을 생성/수정하세요 — 이 폴더 밖에는 아무것도 만들지 마세요.`;
  } else {
    outputNote = "\n\n(⚠ 프로젝트 생성 위치가 지정되지 않아 임시 작업 디렉토리에서 실행됩니다 — 대시보드 '① 프로젝트 시작' 탭에서 output_path를 먼저 설정하세요.)";
  }

  const refPaths = techConstraints?.reference_paths || [];
  const refNote = refPaths.length
    ? `\n\n**참고 코드 레퍼런스** (스타일 · 패턴만 참고, 이 경로 자체는 수정하지 말 것):\n${refPaths.map((p) => `- ${p}`).join("\n")}`
    : "";
  const userPrompt = `당신은 ${part} 파트를 담당하는 개발 에이전트입니다. 아래 인터페이스 계약과 기술 스택을 기준으로 코드를 작성하세요 (실제로는 이 자리에서 코드 편집 도구를 호출).\n계약: ${JSON.stringify(interfaceContract)}\n기술 스택: ${JSON.stringify(techConstraints)}${outputNote}${refNote}`;
  return runAgentStage({ agentName: `dev-${part}`, role: "dev", userPrompt, cwd: outputPath || undefined });
}

module.exports = { run };
