"use client";
import { useEffect, useState } from "react";

type Pattern = {
  id: string; tech_stack: string; issue_type: string; cause: string; issue: string; resolution: string; seen_count: number;
};

export default function KnowledgeBaseTab() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);

  useEffect(() => {
    fetch("/api/knowledge").then((r) => r.json()).then((d) => setPatterns(d.patterns || []));
  }, []);

  return (
    <div>
      <p className="sub">
        한 프로젝트의 이슈 히스토리(원인 · 이슈 · 해결법)를 다음 프로젝트가 참고할 수 있는 지식으로 축적합니다.
        고객사 고유 정보는 저장하지 않고, 사람이 검토·승인한 기술 패턴만 저장됩니다.
      </p>
      {patterns.length === 0 && (
        <p className="sub">
          아직 축적된 패턴이 없습니다. 엔진의 <code>engine/lib/knowledgeBase.js</code>의 <code>addPattern()</code>을
          사람 승인 후 호출하면 여기에 쌓입니다.
        </p>
      )}
      {patterns.map((p) => (
        <div key={p.id} className="card">
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <span className="tag flow">{p.tech_stack}</span>
            <span className="tag pm">{p.issue_type}</span>
            <span className="tag ok">재발 {p.seen_count}회</span>
          </div>
          <p><b style={{ color: "var(--text)" }}>원인</b> — {p.cause}</p>
          <p><b style={{ color: "var(--text)" }}>이슈</b> — {p.issue}</p>
          <p><b style={{ color: "var(--text)" }}>해결법</b> — {p.resolution}</p>
        </div>
      ))}
    </div>
  );
}
