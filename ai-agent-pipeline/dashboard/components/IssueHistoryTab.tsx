"use client";
import { useEffect, useState } from "react";

type Issue = {
  id: string; at: string; stage: string; requirement_ids: string[];
  classification: "bug" | "design" | "requirement"; status: "resolved" | "pending" | "decided";
  title: string; description: string; resolution: string | null; reasoning?: string | null;
};

const classTag: Record<string, string> = { bug: "flow", design: "risk", requirement: "human" };
const classLabel: Record<string, string> = { bug: "구현 버그", design: "설계 결함", requirement: "요구사항 모호" };
const statusLabel: Record<string, string> = { resolved: "자동 해결", pending: "사람 결정 대기", decided: "사람 결정 완료" };
const statusTag: Record<string, string> = { resolved: "ok", pending: "human", decided: "pm" };

export default function IssueHistoryTab() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filter, setFilter] = useState<string>("전체");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch("/api/issues", { cache: "no-store" });
    const data = await res.json();
    setIssues(data.issues || []);
  }
  useEffect(() => { load(); const id = setInterval(load, 8000); return () => clearInterval(id); }, []);

  async function decide(issueId: string) {
    const text = drafts[issueId];
    if (!text) return;
    await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId, decisionText: text }),
    });
    setDrafts((d) => ({ ...d, [issueId]: "" }));
    load();
  }

  const filtered = issues.filter((it) => {
    if (filter === "전체") return true;
    if (filter === "자동 해결") return it.status === "resolved";
    if (filter === "사람 결정 대기") return it.status === "pending";
    if (filter === "사람 결정 완료") return it.status === "decided";
    return true;
  });

  return (
    <div>
      <p className="sub">파이프라인 진행 중 발생한 모든 이슈 기록입니다. 자동 해결된 것과 사람 결정이 필요한 것을 구분합니다.</p>
      <div className="filter-row">
        {["전체", "자동 해결", "사람 결정 대기", "사람 결정 완료"].map((f) => (
          <div key={f} className={`filter-chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f}</div>
        ))}
      </div>

      {filtered.length === 0 && <p className="sub">기록된 이슈가 없습니다.</p>}

      {filtered.map((it) => (
        <div key={it.id} className="issue-card">
          <div className="issue-top">
            <span className="tag flow">{it.stage}</span>
            <span className={`tag ${classTag[it.classification]}`}>{classLabel[it.classification]}</span>
            <span className={`tag ${statusTag[it.status]}`} style={{ marginLeft: "auto" }}>{statusLabel[it.status]}</span>
          </div>
          <div className="issue-title">{it.title}</div>
          <div className="issue-desc">{it.description}</div>
          {it.resolution && <div className="issue-resolution">해결/결정: {it.resolution}</div>}
          {it.status === "pending" && (
            <div className="decide-box">
              <input
                placeholder="사람 결정 내용을 입력하세요"
                value={drafts[it.id] || ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [it.id]: e.target.value }))}
              />
              <button onClick={() => decide(it.id)}>결정 입력</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
