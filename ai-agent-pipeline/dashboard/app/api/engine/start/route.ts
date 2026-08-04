import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { authCheck } from "@/lib/engineBridge";

const ENGINE_DIR = path.join(process.cwd(), "..", "engine");
const STATE_DIR = path.join(process.cwd(), "..", "state");
const LOG_FILE = path.join(STATE_DIR, "engine.log");
const PID_FILE = path.join(STATE_DIR, "engine.pid.json");

function readPidInfo(): { pid: number | null } {
  try {
    return JSON.parse(fs.readFileSync(PID_FILE, "utf-8"));
  } catch {
    return { pid: null };
  }
}

function isRunning(pid: number | null) {
  if (!pid) return false;
  try {
    process.kill(pid, 0); // 신호 0: 실제로 죽이지 않고 존재 여부만 확인
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const { pid } = readPidInfo();
  return NextResponse.json({ running: isRunning(pid), pid });
}

export async function POST(req: Request) {
  const { dryRun } = await req.json().catch(() => ({ dryRun: false }));

  const { pid } = readPidInfo();
  if (isRunning(pid)) {
    return NextResponse.json({ ok: false, error: "엔진이 이미 실행 중입니다." }, { status: 409 });
  }

  if (!dryRun) {
    const auth = authCheck.checkClaudeAuth();
    if (!auth.installed) {
      return NextResponse.json(
        { ok: false, error: "claude 명령을 찾을 수 없습니다. Claude Code CLI를 설치해주세요." },
        { status: 400 }
      );
    }
    if (!auth.loggedIn) {
      return NextResponse.json(
        { ok: false, error: "Claude Code에 로그인되어 있지 않습니다. 터미널에서 claude auth login을 먼저 실행해주세요." },
        { status: 400 }
      );
    }
  }

  fs.mkdirSync(STATE_DIR, { recursive: true });
  const logStream = fs.openSync(LOG_FILE, "a");

  const child = spawn("node", ["orchestrator.js"], {
    cwd: ENGINE_DIR,
    detached: true,
    stdio: ["ignore", logStream, logStream],
    env: { ...process.env, CLAUDE_DRY_RUN: dryRun ? "1" : "0" },
  });
  child.unref();

  fs.writeFileSync(PID_FILE, JSON.stringify({ pid: child.pid, started_at: new Date().toISOString() }));

  return NextResponse.json({ ok: true, pid: child.pid });
}
