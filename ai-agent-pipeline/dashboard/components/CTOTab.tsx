"use client";
import { useState } from "react";

type Msg = { role: "human" | "cto"; text: string };

export default function CTOTab() {
  const [log, setLog] = useState<Msg[]>([
    { role: "cto", text: "안녕하세요, CTO 에이전트입니다. 프로젝트 진행 상태나 결정이 필요한 이슈에 대해 무엇이든 물어보세요." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim()) return;
    const userMsg = input;
    setLog((l) => [...l, { role: "human", text: userMsg }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/cto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      setLog((l) => [...l, { role: "cto", text: data.reply }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="sub">
        PM은 내부에서 상시 운영되고, 사람은 이 CTO 에이전트하고만 대화합니다. 평소엔 각 에이전트의 상태 요약 카드만
        참고해서 가볍게 응답하고, "더 자세히"라고 요청하면 원본 히스토리를 드릴다운합니다.
      </p>
      <div className="card">
        <div className="cto-log">
          {log.map((m, i) => (
            <div key={i} className={`cto-msg ${m.role}`} style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
          ))}
          {loading && <div className="cto-msg cto">...</div>}
        </div>
        <div className="cto-input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="예: 지금 어디까지 진행됐어? / 결정 필요한 이슈 있어?"
          />
          <button className="btn" onClick={send}>보내기</button>
        </div>
      </div>
    </div>
  );
}
