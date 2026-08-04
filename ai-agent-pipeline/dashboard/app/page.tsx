"use client";
import { useState } from "react";
import UsageBar from "@/components/UsageBar";
import PipelineTab from "@/components/PipelineTab";
import AgentSelectTab from "@/components/AgentSelectTab";
import IssueHistoryTab from "@/components/IssueHistoryTab";
import KnowledgeBaseTab from "@/components/KnowledgeBaseTab";
import CTOTab from "@/components/CTOTab";
import PrinciplesTab from "@/components/PrinciplesTab";

const TABS = [
  { key: "agentselect", label: "프로젝트 시작", n: "01" },
  { key: "pipeline", label: "진행 현황", n: "02" },
  { key: "issues", label: "이슈 히스토리", n: "03" },
  { key: "knowledge", label: "지식 베이스", n: "04" },
  { key: "cto", label: "CTO 대화", n: "05" },
  { key: "principles", label: "설계 원칙", n: "06" },
];

export default function Page() {
  const [tab, setTab] = useState("agentselect");

  return (
    <div className="wrap">
      <div className="eyebrow">Multi-Agent Development Pipeline</div>
      <h1>AI 에이전트 개발 파이프라인 대시보드</h1>
      <p className="sub">기획부터 납품까지, 사람은 CTO 에이전트와만 대화하며 전체 진행 상황을 확인합니다.</p>

      <UsageBar />

      <div className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <span className="n">{t.n}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === "pipeline" && <PipelineTab />}
      {tab === "agentselect" && <AgentSelectTab />}
      {tab === "issues" && <IssueHistoryTab />}
      {tab === "knowledge" && <KnowledgeBaseTab />}
      {tab === "cto" && <CTOTab />}
      {tab === "principles" && <PrinciplesTab />}

      <footer>
        <span>ai-agent-pipeline · dashboard</span>
        <span>engine 프로세스는 별도로 실행됩니다 (README 참고)</span>
      </footer>
    </div>
  );
}
