import { NextResponse } from "next/server";
import { listAgentStatusCards } from "@/lib/state";

const CHECKPOINT_TO_AGENT: Record<string, string> = {
  requirements: "planning",
  design: "design",
  delivery: "delivery",
};
const CHECKPOINT_LABEL: Record<string, string> = {
  requirements: "요구사항 분석 결과",
  design: "설계 결과",
  delivery: "납품 패키징 결과",
};

function escapeHtml(str: string) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}

function renderRequirementsTable(requirements: any[]) {
  return `
  <table>
    <thead><tr><th>REQ-ID</th><th>제목</th><th>설명</th><th>우선순위</th></tr></thead>
    <tbody>
      ${requirements
        .map(
          (r) => `
        <tr>
          <td class="mono">${escapeHtml(r.id || "")}</td>
          <td><b>${escapeHtml(r.title || "")}</b></td>
          <td>${escapeHtml(r.description || "")}</td>
          <td><span class="tag">${escapeHtml(r.priority || "-")}</span></td>
        </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderBody(checkpoint: string, card: any) {
  const output = card?.last_output;
  const requirements = output?.output?.requirements;

  let contentHtml = "";
  if (checkpoint === "requirements" && requirements?.length) {
    contentHtml += renderRequirementsTable(requirements);
    if (output.assumptions?.length) {
      contentHtml += `<div class="note warn"><b>⚠ 가정하고 진행한 부분</b><ul>${output.assumptions
        .map((a: string) => `<li>${escapeHtml(a)}</li>`)
        .join("")}</ul></div>`;
    }
    if (output.questions?.length) {
      contentHtml += `<div class="note risk"><b>❓ 확인이 필요한 질문</b><ul>${output.questions
        .map((q: string) => `<li>${escapeHtml(q)}</li>`)
        .join("")}</ul></div>`;
    }
  } else if (output) {
    contentHtml += `<pre>${escapeHtml(JSON.stringify(output, null, 2))}</pre>`;
  } else {
    contentHtml += `<p class="muted">산출물이 없습니다.</p>`;
  }
  return contentHtml;
}

export async function GET(_req: Request, { params }: { params: { checkpoint: string } }) {
  const checkpoint = params.checkpoint;
  const agentName = CHECKPOINT_TO_AGENT[checkpoint];
  const cards = listAgentStatusCards();
  const card = cards.find((c: any) => c.agent === agentName);

  const title = CHECKPOINT_LABEL[checkpoint] || checkpoint;
  const generatedAt = new Date().toLocaleString("ko-KR");

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  :root{--ink:#0B0E14;--panel:#12161F;--line:#232938;--text:#E7EAF0;--muted:#8992A6;--flow:#5B8DEF;--human:#E8A33D;--risk:#E1573F;}
  *{box-sizing:border-box;}
  body{background:var(--ink);color:var(--text);font-family:-apple-system,'Noto Sans KR',sans-serif;padding:40px;line-height:1.6;}
  .wrap{max-width:900px;margin:0 auto;}
  h1{font-size:24px;margin:0 0 4px;}
  .meta{color:var(--muted);font-size:13px;margin-bottom:28px;}
  table{width:100%;border-collapse:collapse;background:var(--panel);border-radius:10px;overflow:hidden;margin-bottom:20px;}
  th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);padding:10px 14px;border-bottom:1px solid var(--line);}
  td{padding:12px 14px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:top;}
  .mono{font-family:monospace;color:var(--flow);}
  .tag{font-size:11px;background:rgba(91,141,239,0.15);color:var(--flow);padding:2px 8px;border-radius:10px;}
  .note{border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:13px;}
  .note.warn{background:rgba(232,163,61,0.12);border-left:3px solid var(--human);}
  .note.risk{background:rgba(225,87,63,0.12);border-left:3px solid var(--risk);}
  pre{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px;overflow-x:auto;font-size:12.5px;}
  .muted{color:var(--muted);}
  footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:11px;}
</style>
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">생성 시각: ${escapeHtml(generatedAt)} · 상태: ${escapeHtml(card?.current_status || "unknown")}</div>
    ${renderBody(checkpoint, card)}
    <footer>ai-agent-pipeline 대시보드에서 내보낸 파일입니다.</footer>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${checkpoint}-result.html"`,
    },
  });
}
