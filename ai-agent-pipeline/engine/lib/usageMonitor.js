/**
 * 사용량 모니터
 *
 * ⚠️ 중요한 정정: /usage 명령은 인터랙티브 전용이라 헤드리스(-p) 모드에서는 작동하지 않습니다
 * (Anthropic 공식 문서 확인됨 — 비대화형 모드에서는 요청 자체를 안 보내고 인터랙티브 세션에서
 * 실행하라고 안내함). 그래서 CLI를 호출해서 사용량을 물어보는 방식 자체가 불가능합니다.
 *
 * 대신 Claude Code가 로컬에 남기는 실제 세션 로그(~/.claude/projects/**\/*.jsonl)를 직접 파싱합니다.
 * 각 줄에 어시스턴트 메시지의 usage(input_tokens/output_tokens 등)가 들어있어서, 이걸 합산하면
 * 실제 토큰 사용량을 알 수 있습니다 (ccusage 같은 서드파티 도구들이 쓰는 것과 같은 방식).
 *
 * ⚠️ TO VERIFY: 아래 JSONL 필드 경로(message.usage.input_tokens 등)는 실제 로컬 파일을 열어서
 *    직접 확인 후 맞춰야 합니다. Claude Code 버전에 따라 구조가 다를 수 있습니다.
 *
 * 한계: Anthropic이 플랜별 정확한 토큰 할당량(5시간/주간 한도의 절대 수치)을 공개하지 않기 때문에,
 * "한도 대비 몇 %"는 정확히 계산할 수 없습니다. 대신 "실제 사용한 토큰 수"를 있는 그대로 보여줍니다 —
 * 이게 /usage가 보여주는 것보다 원시 데이터이긴 하지만, 최소한 거짓 추정치보다 훨씬 정직합니다.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readJSON, writeJSONAtomic } = require("./atomicFile");

const STATE_DIR = path.join(__dirname, "..", "..", "state");
const USAGE_FILE = path.join(STATE_DIR, "usage.json");
const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

function defaultUsage() {
  return {
    checked_at: null,
    source: "not_checked",
    last_5h: { input_tokens: 0, output_tokens: 0, message_count: 0, earliest_ts: null },
    last_7d: { input_tokens: 0, output_tokens: 0, message_count: 0, earliest_ts: null },
    note: null,
  };
}

/** ~/.claude/projects/ 아래 모든 JSONL 세션 로그 파일 경로를 찾는다 (모든 프로젝트 통틀어 — 계정 전체 사용량이므로) */
function findAllSessionLogFiles() {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return [];
  const files = [];
  const projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const dir of projectDirs) {
    const full = path.join(CLAUDE_PROJECTS_DIR, dir.name);
    try {
      const jsonlFiles = fs.readdirSync(full).filter((f) => f.endsWith(".jsonl"));
      jsonlFiles.forEach((f) => files.push(path.join(full, f)));
    } catch {
      // 접근 불가한 폴더는 건너뜀
    }
  }
  return files;
}

/** 하나의 JSONL 파일을 읽어서, 지정된 시간 윈도우 안의 usage 합계와 가장 오래된 타임스탬프를 낸다 */
function parseFileUsage(filePath, sinceMs) {
  const result = { input_tokens: 0, output_tokens: 0, message_count: 0, earliest_ts: null };
  let lines;
  try {
    lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  } catch {
    return result;
  }
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = obj.timestamp ? new Date(obj.timestamp).getTime() : null;
    if (ts && ts < sinceMs) continue; // 윈도우 밖이면 제외

    // ⚠️ TO VERIFY: 실제 필드 경로. usage는 보통 assistant 메시지에만 있음.
    const usage = obj.message?.usage;
    if (usage) {
      result.input_tokens += (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
      result.output_tokens += usage.output_tokens || 0;
      result.message_count += 1;
      if (ts && (!result.earliest_ts || ts < result.earliest_ts)) result.earliest_ts = ts;
    }
  }
  return result;
}

function sumUsage(a, b) {
  const earliest =
    a.earliest_ts && b.earliest_ts ? Math.min(a.earliest_ts, b.earliest_ts) : a.earliest_ts || b.earliest_ts || null;
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    message_count: a.message_count + b.message_count,
    earliest_ts: earliest,
  };
}

/** 실제 로컬 세션 로그를 파싱해서 최근 5시간 / 7일 사용량을 계산한다 (네트워크 요청 없음, 완전 로컬) */
function checkUsageFromLogs() {
  const files = findAllSessionLogFiles();
  if (!files.length) {
    return { ...defaultUsage(), source: "no_logs_found", note: "~/.claude/projects 에서 세션 로그를 찾지 못했습니다." };
  }

  const now = Date.now();
  const since5h = now - FIVE_HOUR_MS;
  const since7d = now - WEEK_MS;

  let last5h = { input_tokens: 0, output_tokens: 0, message_count: 0, earliest_ts: null };
  let last7d = { input_tokens: 0, output_tokens: 0, message_count: 0, earliest_ts: null };

  for (const file of files) {
    // 파일 수정시각이 7일보다 오래됐으면 아예 열지 않음 (성능)
    try {
      const stat = fs.statSync(file);
      if (stat.mtimeMs < since7d) continue;
    } catch {
      continue;
    }
    last7d = sumUsage(last7d, parseFileUsage(file, since7d));
    last5h = sumUsage(last5h, parseFileUsage(file, since5h));
  }

  return {
    checked_at: new Date().toISOString(),
    source: "local_session_logs",
    last_5h: last5h,
    last_7d: last7d,
    note: "Anthropic이 플랜별 정확한 토큰 한도를 공개하지 않아 '한도 대비 %'는 계산할 수 없습니다. 실제 토큰 사용량(원시 수치)만 표시합니다.",
  };
}

/**
 * ⚠️ 실험적 · 비공식 기능: 플랜 한도 대비 % 조회
 *
 * Anthropic 공식 문서에는 없지만, Claude Code가 내부적으로 쓰는 것으로 보이는 엔드포인트
 * (api.anthropic.com/api/oauth/usage)를 통해 실제 5시간/7일 한도 대비 %를 얻을 수 있다는 게
 * 커뮤니티 조사로 확인됨. `claude setup-token`으로 발급한 토큰을 CLAUDE_CODE_OAUTH_TOKEN
 * 환경변수로 설정해야 동작한다.
 *
 * ⚠️ TO VERIFY: 이 엔드포인트는 문서화되어 있지 않아 버전/정책 변경으로 언제든 깨질 수 있음.
 *    반드시 try/catch로 감싸고, 실패 시 조용히 null을 반환해 나머지 기능에 지장이 없게 한다.
 */
async function fetchPlanUsagePercentage() {
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) return null;
  try {
    const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "User-Agent": "claude-code-agent-pipeline/1.0",
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return {
      five_hour_pct: data?.five_hour?.utilization ?? data?.five_hour?.used_percentage ?? null,
      seven_day_pct: data?.seven_day?.utilization ?? data?.seven_day?.used_percentage ?? null,
      source: "oauth_usage_api(비공식)",
    };
  } catch {
    return null;
  }
}

/** 프로젝트/파이프라인 시작 시 한 번 체크해서 state/usage.json에 저장 (계속 폴링하지 않음) */
async function checkAndSaveUsageOnce() {
  const usage = checkUsageFromLogs();
  usage.plan_pct = await fetchPlanUsagePercentage();
  writeJSONAtomic(USAGE_FILE, usage);
  return usage;
}

function getUsageSnapshot() {
  return readJSON(USAGE_FILE, defaultUsage());
}

/** CLI 호출 결과(stdout/stderr)에서 한도 도달 메시지를 감지 → 종류 분류
 *  ⚠️ TO VERIFY: 실제 Claude Code CLI가 반환하는 정확한 문자열은 버전에 따라 다를 수 있으므로
 *     방어적으로 여러 키워드를 매칭한다. 실 환경에서 한 번 걸려보고 문구를 갱신할 것. */
function detectLimitHit(text = "") {
  const lower = text.toLowerCase();
  if (/weekly|7-day|seven.?day|주간/.test(lower)) {
    return { hit: true, type: "weekly" };
  }
  if (/usage limit|rate limit|5-hour|five.?hour|session limit|한도/.test(lower)) {
    return { hit: true, type: "5hour" };
  }
  return { hit: false, type: null };
}

/**
 * 한도 도달 시 예상 리셋 시각을 추정한다.
 * - windowEarliestTs(현재 5시간/7일 윈도우 안에서 가장 오래된 실제 사용 시점)가 있으면
 *   그 시점 + 윈도우 길이로 추정 (더 정확 — 실제로 언제부터 소진되기 시작했는지 반영).
 * - 없으면(사용 이력을 못 찾은 경우) 안전하게 "지금부터 전체 윈도우"로 최대치를 가정한다.
 * ⚠️ Claude의 실제 윈도우가 "가장 오래된 메시지 기준 롤링"인지, "세션 시작 시각 고정"인지는
 *    공식적으로 정확히 문서화되어 있지 않아 이 추정은 근사치임 — 실제 동작을 관찰하며 보정 필요.
 */
function estimateResetAt(limitType, windowEarliestTs) {
  const windowMs = limitType === "weekly" ? WEEK_MS : FIVE_HOUR_MS;
  const start = windowEarliestTs ? new Date(windowEarliestTs).getTime() : Date.now();
  return new Date(start + windowMs).toISOString();
}

module.exports = {
  checkUsageFromLogs,
  checkAndSaveUsageOnce,
  getUsageSnapshot,
  detectLimitHit,
  estimateResetAt,
  USAGE_FILE,
};

