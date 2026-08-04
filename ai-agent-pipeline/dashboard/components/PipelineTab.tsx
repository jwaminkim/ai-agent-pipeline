"use client";
import { useEffect, useState } from "react";

type Stage = { id: string; order: number; name: string; role: string; required: boolean; humanCheckpoint: string | null };
type Status = { current_stage: string | null; last_completed_stage: string | null; status: string };
type AgentCard = { agent: string; current_status: string; summary: string; open_issues: string[]; last_output?: any };

// 사람 승인 체크포인트 ↔ 그 산출물을 만든 에이전트 매핑 (여기 내용을 미리 보여주고 승인받음)
const CHECKPOINT_TO_AGENT: Record<string, string> = {
  requirements: "planning",
  design: "design",
  delivery: "delivery",
};
const CHECKPOINT_LABEL: Record<string, string> = {
  requirements: "요구사항 확정",
  design: "설계 확정",
  delivery: "최종 납품",
};

function CheckpointDetail({ checkpoint, card }: { checkpoint: string; card: AgentCard }) {
  const output = card.last_output?.output;

  // 요구사항 확정: REQ-ID 표로 전체 목록을 보여준다 (한 줄 요약이 아니라 실제 내용)
  if (checkpoint === "requirements" && output?.requirements?.length) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: "var(--muted-dim)", fontSize: 11, marginBottom: 6 }}>
          기획 에이전트가 분석한 요구사항 {output.requirements.length}건
        </div>
        <div style={{ background: "var(--panel-alt)", borderRadius: 8, overflow: "hidden" }}>
          {output.requirements.map((r: any) => (
            <div key={r.id} style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                <span className="tag flow">{r.id}</span>
                <b style={{ color: "var(--text)" }}>{r.title}</b>
                {r.priority && <span className="tag human" style={{ marginLeft: "auto" }}>{r.priority}</span>}
              </div>
              <div style={{ color: "var(--muted)" }}>{r.description}</div>
            </div>
          ))}
        </div>
        {card.last_output?.assumptions?.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--human)" }}>
            ⚠ 임의로 가정하고 진행한 부분: {card.last_output.assumptions.join(" / ")}
          </div>
        )}
        {card.last_output?.questions?.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--risk)" }}>
            ❓ 확인이 필요한 질문: {card.last_output.questions.join(" / ")}
          </div>
        )}
      </div>
    );
  }

  // 설계/납품/기타 체크포인트는 스키마가 조금씩 달라서(output으로 감싸진 것도, 안 감싸진 것도 있음)
  // 전체 산출물(last_output)을 그대로 펼쳐서 보여준다
  if (card.last_output) {
    return (
      <pre style={{
        background: "var(--panel-alt)", borderRadius: 8, padding: 12, fontSize: 11.5,
        maxHeight: 260, overflowY: "auto", whiteSpace: "pre-wrap", margin: "0 0 10px",
      }}>{JSON.stringify(card.last_output, null, 2)}</pre>
    );
  }

  return (
    <div style={{ background: "var(--panel-alt)", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 12.5 }}>
      {card.summary || "(요약 없음)"}
    </div>
  );
}

export default function PipelineTab() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [status, setStatus] = useState<Status>({ current_stage: null, last_completed_stage: null, status: "idle" });
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [agentCards, setAgentCards] = useState<AgentCard[]>([]);

  async function load() {
    const cfgRes = await fetch("/api/config");
    const cfg = await cfgRes.json();
    setStages(cfg.config.stages);
    const statusRes = await fetch("/api/status", { cache: "no-store" });
    const s = await statusRes.json();
    setStatus(s.pipelineStatus);
    const apprRes = await fetch("/api/approve", { cache: "no-store" });
    setApprovals(await apprRes.json());
    const agentsRes = await fetch("/api/agents", { cache: "no-store" });
    const agentsData = await agentsRes.json();
    setAgentCards(agentsData.agents || []);
  }
  useEffect(() => { load(); const id = setInterval(load, 6000); return () => clearInterval(id); }, []);

  function stageState(s: Stage) {
    if (!status.last_completed_stage) return status.current_stage === s.id ? "running" : "pending";
    const order = stages.find((x) => x.id === status.last_completed_stage)?.order ?? 0;
    if (s.order <= order) return "done";
    if (status.current_stage === s.id) return "running";
    return "pending";
  }

  async function approve(checkpoint: string) {
    await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkpoint }),
    });
    load();
  }

  function cardFor(checkpoint: string) {
    const agentName = CHECKPOINT_TO_AGENT[checkpoint];
    return agentCards.find((c) => c.agent === agentName);
  }

  return (
    <div>
      <p className="sub">
        12단계 진행 현황입니다. "사람 승인하기"는 <b style={{ color: "var(--text)" }}>해당 에이전트가 만든 산출물을
        검토하고, 다음 단계로 넘어가도 좋다고 확인하는 것</b>입니다 — 버튼을 누르기 전에 아래 요약 내용을 먼저 확인하세요.
      </p>
      {stages.map((s) => {
        const st = stageState(s);
        const card = s.humanCheckpoint ? cardFor(s.humanCheckpoint) : null;
        return (
          <div key={s.id} className="card" style={{ borderColor: st === "running" ? "var(--flow)" : "var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <h3>{s.id} · {s.name}</h3>
              <span className={`tag ${st === "done" ? "ok" : st === "running" ? "flow" : "pm"}`}>
                {st === "done" ? "완료" : st === "running" ? "진행 중" : "대기"}
              </span>
            </div>
            <p>담당: {s.role}</p>

            {s.humanCheckpoint && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: "var(--muted-dim)" }}>
                    승인 대상: <b>{CHECKPOINT_LABEL[s.humanCheckpoint]}</b>
                  </div>
                  {card && (
                    <a className="btn" style={{ fontSize: 11, padding: "5px 10px" }} href={`/api/export/${s.humanCheckpoint}`}>
                      ⬇ HTML로 다운로드
                    </a>
                  )}
                </div>

                {card ? (
                  <CheckpointDetail checkpoint={s.humanCheckpoint} card={card} />
                ) : (
                  <div className="sub" style={{ margin: "0 0 10px" }}>
                    아직 해당 단계 산출물이 없습니다 — 파이프라인이 이 단계까지 진행되면 여기에 상세 내용이 표시됩니다.
                  </div>
                )}

                {approvals[s.humanCheckpoint] ? (
                  <span className="tag ok">✓ 승인됨</span>
                ) : (
                  <button className="btn" onClick={() => approve(s.humanCheckpoint!)} disabled={!card}>
                    위 내용 확인 후 승인하기
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
