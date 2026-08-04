/**
 * Claude Code 로그인 상태 체크
 *
 * `claude auth status` 명령은 로그인 상태면 종료 코드 0, 아니면 1을 반환한다
 * (JSON 출력이 기본, --text로 사람이 읽는 형태도 가능).
 * ⚠️ TO VERIFY: 설치된 버전에서 `claude auth status --text`가 그대로 동작하는지 확인.
 *    (일부 버전은 `claude /status`가 인터랙티브 전용일 수 있음 — 그 경우 이 함수를 그에 맞게 수정)
 */
const { spawnSync } = require("child_process");

function checkClaudeAuth() {
  try {
    const result = spawnSync("claude", ["auth", "status", "--text"], {
      encoding: "utf-8",
      timeout: 15000,
    });
    if (result.error) {
      // claude 명령 자체를 못 찾음 (설치 안 됨)
      return { installed: false, loggedIn: false, detail: result.error.message };
    }
    return {
      installed: true,
      loggedIn: result.status === 0,
      detail: (result.stdout || result.stderr || "").trim(),
    };
  } catch (err) {
    return { installed: false, loggedIn: false, detail: err.message };
  }
}

module.exports = { checkClaudeAuth };
