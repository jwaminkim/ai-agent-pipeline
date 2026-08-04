"use client";
import { useEffect, useState } from "react";

type Bucket = { input_tokens: number; output_tokens: number; message_count: number; earliest_ts?: number | null };
type PlanPct = { five_hour_pct: number | null; seven_day_pct: number | null; source: string } | null;
type Usage = { checked_at: string | null; source: string; last_5h: Bucket; last_7d: Bucket; note: string | null; plan_pct?: PlanPct };
type PipelineStatus = { current_stage: string | null; status: string };

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function pctColor(pct: number | null | undefined) {
  if (pct == null) return "var(--muted)";
  if (pct >= 85) return "var(--risk)";
  if (pct >= 60) return "var(--human)";
  return "var(--ok)";
}

function TokenBucket({ label, bucket }: { label: string; bucket: Bucket }) {
  return (
    <div className="usage-item">
      <div className="u-top"><span className="u-label">{label}</span></div>
      <div style={{ display: "flex", gap: 14, marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--muted-dim)" }}>입력</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{fmt(bucket.input_tokens)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--muted-dim)" }}>출력</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{fmt(bucket.output_tokens)}</div>
        </div>
      </div>
      <div className="u-sub">{bucket.message_count}건 메시지</div>
    </div>
  );
}

export default function UsageBar() {
  const [usage, setUsage] = useState<Usage>({
    checked_at: null, source: "not_checked",
    last_5h: { input_tokens: 0, output_tokens: 0, message_count: 0 },
    last_7d: { input_tokens: 0, output_tokens: 0, message_count: 0 },
    note: null, plan_pct: null,
  });
  const [pipeline, setPipeline] = useState<PipelineStatus>({ current_stage: null, status: "idle" });
  const [checking, setChecking] = useState(false);

  async function poll() {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      const data = await res.json();
      setUsage(data.usage);
      setPipeline(data.pipelineStatus);
    } catch {}
  }

  useEffect(() => {
    poll();
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, []);

  async function checkNow() {
    setChecking(true);
    try {
      const res = await fetch("/api/usage/check", { method: "POST" });
      const data = await res.json();
      setUsage(data);
    } finally {
      setChecking(false);
    }
  }

  const notChecked = usage.source === "not_checked";
  const noLogs = usage.source === "no_logs_found";
  const pct = usage.plan_pct;

  return (
    <>
      <div className="usage-bar">
        <TokenBucket label="최근 5시간" bucket={usage.last_5h} />
        <TokenBucket label="최근 7일" bucket={usage.last_7d} />
        <div className="usage-item">
          <div className="u-top"><span className="u-label">파이프라인 상태</span><span className="u-pct" style={{ color: "var(--flow)" }}>{pipeline.status}</span></div>
          <div className="u-sub">{pipeline.current_stage || "대기 중"}</div>
        </div>
        <div className="usage-item">
          <div className="u-top"><span className="u-label">마지막 확인</span></div>
          <div className="u-sub" style={{ marginBottom: 8 }}>
            {usage.checked_at ? new Date(usage.checked_at).toLocaleTimeString("ko-KR") : "아직 확인 안 함"}
          </div>
          <button className="btn" style={{ fontSize: 11, padding: "5px 10px" }} onClick={checkNow} disabled={checking}>
            {checking ? "확인 중..." : "지금 체크"}
          </button>
        </div>
      </div>

      {/* 플랜 한도 대비 % — CLAUDE_CODE_OAUTH_TOKEN이 설정되어 있을 때만 표시 가능 (비공식 API, 실패 시 자동 숨김) */}
      {pct && (pct.five_hour_pct != null || pct.seven_day_pct != null) ? (
        <div className="usage-bar" style={{ marginTop: 8 }}>
          <div className="usage-item">
            <div className="u-top"><span className="u-label">5시간 한도 대비</span><span className="u-pct" style={{ color: pctColor(pct.five_hour_pct) }}>{pct.five_hour_pct ?? "-"}%</span></div>
            <div className="u-track"><div className="u-fill" style={{ width: `${pct.five_hour_pct ?? 0}%`, background: pctColor(pct.five_hour_pct) }} /></div>
          </div>
          <div className="usage-item">
            <div className="u-top"><span className="u-label">7일 한도 대비</span><span className="u-pct" style={{ color: pctColor(pct.seven_day_pct) }}>{pct.seven_day_pct ?? "-"}%</span></div>
            <div className="u-track"><div className="u-fill" style={{ width: `${pct.seven_day_pct ?? 0}%`, background: pctColor(pct.seven_day_pct) }} /></div>
          </div>
          <div className="usage-item" style={{ gridColumn: "span 2" }}>
            <div className="u-sub">⚠ 비공식 API 기반 추정치(source: {pct.source}) — 정확도 보장 안 됨</div>
          </div>
        </div>
      ) : (
        <div className="usage-note" style={{ marginTop: 8 }}>
          % 표시를 보려면 <code>CLAUDE_CODE_OAUTH_TOKEN</code> 환경변수를 설정하세요 (터미널에서 <code>claude setup-token</code>으로 발급 가능, 비공식 API라 실패할 수 있음).
        </div>
      )}

      <div className="usage-note">
        <span className="live-dot" />
        로컬 세션 로그(~/.claude/projects) 기반 · 별도 토큰 소모 없음
        {notChecked && " · 아직 확인 전입니다 — 파이프라인을 시작하거나 '지금 체크'를 눌러보세요"}
        {noLogs && " · 로컬 세션 로그를 찾지 못했습니다 (claude 로그인/사용 이력 확인 필요)"}
      </div>
      {usage.note && !notChecked && (
        <div className="usage-note" style={{ marginTop: -20, color: "var(--human)" }}>⚠ {usage.note}</div>
      )}
    </>
  );
}
