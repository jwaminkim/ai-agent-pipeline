/**
 * Claude Code CLI 래퍼
 *
 * 전제: 로컬에 Claude Code CLI(`claude`)가 설치 및 로그인(Pro/Max 구독)되어 있어야 함.
 * 이 파일은 "에이전트 하나 호출" = "claude CLI를 비대화형으로 한 번 실행"으로 매핑한다.
 *
 * ⚠️⚠️ 크리티컬 (최종 시니어 리뷰에서 발견 · 공식 문서로 확인됨):
 * Claude Code는 기본적으로 도구(파일 읽기/쓰기/Bash) 실행 전 권한을 대화형으로 "물어보는데",
 * 헤드리스(-p) 모드에서는 물어볼 방법이 없어서 미리 승인해두지 않으면 그냥 영원히 멈춘다(freeze)
 * — 에러도 안 남. 이 프로젝트의 기획/설계/개발 에이전트는 전부 파일을 읽거나 써야 하므로,
 * 권한 플래그 없이는 실제 모드에서 첫 파일 작업 시점에 조용히 멈춰버린다.
 * → --permission-mode acceptEdits 로 파일 편집을 자동 승인하도록 기본 설정.
 * ⚠️ TO VERIFY: 실제 설치본에서 이 모드가 Bash 도구까지 커버하는지, 아니면 --allowedTools를
 *    추가로 명시해야 하는지 로컬에서 직접 한 번 돌려보고 확인 필요 (예: --allowedTools
 *    "Bash,Read,Edit,Write"). 참고로 --dangerously-skip-permissions는 컨테이너/CI 같은
 *    격리된 환경 전용으로 권장되고, 이 프로젝트처럼 로컬 개발 머신에서 도는 경우엔 권장되지
 *    않아 사용하지 않았음.
 *
 * ⚠️ TO VERIFY: 아래 CLI 인자(--print, --output-format 등)는 설치된 Claude Code 버전에 따라
 *    이름이 다를 수 있음. 로컬에서 `claude --help`로 실제 옵션을 확인 후 맞출 것.
 */
const { spawn } = require("child_process");
const path = require("path");
const { detectLimitHit } = require("./usageMonitor");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

// 헤드리스 모드에서 도구 사용 시 멈추지 않도록 모든 호출에 기본 적용
const DEFAULT_PERMISSION_ARGS = ["--permission-mode", "acceptEdits"];

// 권한 플래그로도 못 막는 다른 원인(네트워크 문제 등)의 무한 대기에 대비한 안전장치.
// 이게 없으면 문제가 재발했을 때 파이프라인이 로그 한 줄 없이 몇 시간이고 멈춰있게 된다.
const CALL_TIMEOUT_MS = 15 * 60 * 1000; // 단일 에이전트 호출 최대 15분

class UsageLimitError extends Error {
  constructor(limitType, rawText) {
    super(`Claude usage limit hit: ${limitType}`);
    this.name = "UsageLimitError";
    this.limitType = limitType; // "5hour" | "weekly"
    this.rawText = rawText;
  }
}

class CallTimeoutError extends Error {
  constructor(ms) {
    super(`Claude 호출이 ${ms}ms 안에 끝나지 않아 강제 종료했습니다 (권한 프롬프트에 멈췄을 가능성이 높습니다).`);
    this.name = "CallTimeoutError";
  }
}

function buildArgs({ systemPrompt, userPrompt, model }) {
  const args = [
    "--print",
    "--output-format", "json",
    ...DEFAULT_PERMISSION_ARGS,
    "--append-system-prompt", systemPrompt,
  ];
  if (model) args.push("--model", model); // ⚠️ TO VERIFY: 실제 플래그명/모델 문자열 형식 확인
  args.push(userPrompt);
  return args;
}

/**
 * 저수준 실행 함수: claude CLI를 지정된 인자로 한 번 실행하고 stdout을 반환.
 * callAgent(JSON 모드)와 callText(일반 텍스트 모드, CTO 대화용)가 공통으로 이걸 쓴다.
 * ⚠️ 대시보드(dashboard/app/api/**)도 이 파일을 직접 require()해서 재사용한다 —
 *    별도로 복제하지 말 것 (엔진/대시보드 코드 중복 방지, README 6번 섹션 참고).
 */
function spawnClaude(args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, { shell: false, cwd: cwd || PROJECT_ROOT });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new CallTimeoutError(CALL_TIMEOUT_MS));
    }, CALL_TIMEOUT_MS);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err); // claude CLI 자체가 설치 안 되어 있는 경우 등
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const combined = `${stdout}\n${stderr}`;
      const limitCheck = detectLimitHit(combined);
      if (limitCheck.hit) {
        reject(new UsageLimitError(limitCheck.type, combined));
        return;
      }
      if (code !== 0) {
        reject(new Error(`claude CLI exited with code ${code}: ${stderr || stdout}`));
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * 에이전트 한 번 호출 (JSON 모드 — 실무 에이전트들이 씀).
 * @param {object} opts
 * @param {string} opts.systemPrompt - 해당 에이전트 역할의 시스템 프롬프트 (prompts/*.md 내용)
 * @param {string} opts.userPrompt - 이번 턴에 실제로 전달할 지시/컨텍스트 (파일 경로 등)
 * @param {string} [opts.model] - 이 호출에 사용할 모델 (예: "claude-opus-4-8"). 생략 시 Claude Code 기본값.
 * @param {string} [opts.cwd] - Claude Code의 작업 디렉토리. 생략 시 프로젝트 루트(ai-agent-pipeline).
 * @returns {Promise<{raw: string, parsed: object|null}>}
 */
async function callAgent({ systemPrompt, userPrompt, model, cwd }) {
  const args = buildArgs({ systemPrompt, userPrompt, model });
  const stdout = await spawnClaude(args, { cwd });
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    // JSON 강제 실패 시 원문이라도 반환 (호출부에서 재시도/보정 로직 가능)
  }
  return { raw: stdout, parsed };
}

/**
 * 일반 텍스트 모드 호출 (CTO 대화용 — JSON 강제 안 함, 사람이 읽는 자연어 응답).
 * @returns {Promise<string>}
 */
async function callText({ systemPrompt, userPrompt, model, cwd }) {
  const args = ["--print", ...DEFAULT_PERMISSION_ARGS, "--append-system-prompt", systemPrompt];
  if (model) args.push("--model", model);
  args.push(userPrompt);
  const stdout = await spawnClaude(args, { cwd });
  return stdout.trim();
}

module.exports = { callAgent, callText, spawnClaude, UsageLimitError, CallTimeoutError };
