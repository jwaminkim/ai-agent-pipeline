"use client";
import { useEffect, useRef, useState } from "react";

type Stage = { id: string; order: number; name: string; role: string; required: boolean; dependsOn: string[] };
type Config = {
  stages: Stage[];
  presets: Record<string, { label: string; description: string; enabledStages: string[] }>;
  dependencyWarnings: { if: { stage: string; on: boolean }; andMissing: string; message: string }[];
};

export default function AgentSelectTab() {
  // --- 1. 파일 업로드 ---
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadUploads() {
    const res = await fetch("/api/upload");
    const data = await res.json();
    setUploadedFiles(data.files || []);
  }
  useEffect(() => { loadUploads(); }, []);

  async function handleUpload(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));
    await fetch("/api/upload", { method: "POST", body: formData });
    setUploading(false);
    loadUploads();
  }

  async function removeFile(filename: string) {
    await fetch("/api/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    loadUploads();
  }

  // --- 2. 기술 스택 설정 (언어/프레임워크/프로젝트 유형/출력 위치) ---
  const [tech, setTech] = useState({
    project_mode: "new" as "new" | "existing",
    language: "", framework: "", project_type: "", ui_framework: "", orm: "", output_path: "", notes: "",
    reference_paths: [] as string[],
  });
  const [newRefPath, setNewRefPath] = useState("");
  const [techSaved, setTechSaved] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [recommendError, setRecommendError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/techstack").then((r) => r.json()).then((data) => {
      setTech({
        project_mode: data.project_mode || "new",
        language: data.language || "", framework: data.framework || "", project_type: data.project_type || "",
        ui_framework: data.ui_framework || "", orm: data.orm || "", output_path: data.output_path || "", notes: data.notes || "",
        reference_paths: data.reference_paths || [],
      });
    });
  }, []);

  function addReferencePath() {
    const p = newRefPath.trim();
    if (!p || tech.reference_paths.includes(p)) return;
    setTech({ ...tech, reference_paths: [...tech.reference_paths, p] });
    setNewRefPath("");
  }
  function removeReferencePath(p: string) {
    setTech({ ...tech, reference_paths: tech.reference_paths.filter((x) => x !== p) });
  }

  async function saveTechStack() {
    await fetch("/api/techstack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tech),
    });
    setTechSaved(true);
    setTimeout(() => setTechSaved(false), 1500);
  }

  async function getRecommendation() {
    setRecommending(true);
    setRecommendError(null);
    setRecommendation(null);
    const res = await fetch("/api/techstack/recommend", { method: "POST" });
    const data = await res.json();
    setRecommending(false);
    if (data.ok) setRecommendation(data.recommendation);
    else setRecommendError(data.error || "추천을 받아오지 못했습니다.");
  }

  // --- 3. 에이전트 선택 (프리셋 + 커스텀) ---
  const [config, setConfig] = useState<Config | null>(null);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [presetKey, setPresetKey] = useState<string>("full-delivery");
  const [savedConfig, setSavedConfig] = useState(false);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((data) => {
      setConfig(data.config);
      setEnabled(data.enabledStages?.length ? data.enabledStages : data.config.presets["full-delivery"].enabledStages);
    });
  }, []);

  function applyPreset(key: string) {
    setPresetKey(key);
    if (key === "custom") {
      // 커스텀을 고르면 일단 전체 에이전트를 다 켜두고, 필요 없는 것만 사람이 끄도록 함
      setEnabled(config!.stages.map((s) => s.id));
    } else {
      setEnabled(config!.presets[key].enabledStages);
    }
  }

  function toggleStage(id: string) {
    setPresetKey("custom");
    setEnabled((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function saveSelection() {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabledStages: enabled }),
    });
    setSavedConfig(true);
    setTimeout(() => setSavedConfig(false), 1500);
  }

  // --- 4. 파이프라인 시작 ---
  const [dryRun, setDryRun] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startMsg, setStartMsg] = useState<string | null>(null);
  const [engineRunning, setEngineRunning] = useState(false);
  const [log, setLog] = useState("");

  async function checkEngine() {
    const res = await fetch("/api/engine/start");
    const data = await res.json();
    setEngineRunning(data.running);
  }
  async function loadLog() {
    const res = await fetch("/api/engine/log", { cache: "no-store" });
    const data = await res.json();
    setLog(data.log || "");
  }
  useEffect(() => {
    checkEngine();
    loadLog();
    const id = setInterval(() => { checkEngine(); loadLog(); }, 4000);
    return () => clearInterval(id);
  }, []);

  async function startPipeline() {
    if (!uploadedFiles.length) {
      setStartMsg("⚠ 먼저 요구사항 파일을 업로드해주세요.");
      return;
    }
    if (tech.project_mode === "existing" && !tech.output_path.trim()) {
      setStartMsg('⚠ "기존 프로젝트 수정" 모드에서는 프로젝트 경로가 필수입니다 — ②에서 입력해주세요.');
      return;
    }
    if (!tech.output_path.trim()) {
      setStartMsg("⚠ 프로젝트가 만들어질 위치(output_path)를 ②에서 입력해주세요.");
      return;
    }
    setStarting(true);
    setStartMsg(null);
    await saveSelection(); // 시작 직전에 선택한 에이전트 구성을 저장
    await saveTechStack(); // 기술 스택 설정도 함께 저장
    const res = await fetch("/api/engine/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun }),
    });
    const data = await res.json();
    setStarting(false);
    if (data.ok) {
      setStartMsg(`✅ 파이프라인이 시작됐습니다 (${dryRun ? "데모/드라이런 모드" : "실제 모드"}). "진행 현황" 탭에서 확인하세요.`);
      checkEngine();
    } else {
      setStartMsg(`⚠ ${data.error || "시작에 실패했습니다."}`);
    }
  }

  if (!config) return <p className="sub">불러오는 중...</p>;

  const dependencyWarnings = config.stages
    .filter((s) => enabled.includes(s.id)) // 켜진 단계 중에서
    .flatMap((s) => {
      const stageDef = config.stages.find((x) => x.id === s.id) as any;
      const missing = (stageDef.dependsOn || []).filter((dep: string) => !enabled.includes(dep));
      return missing.map((dep: string) => {
        const depStage = config.stages.find((x) => x.id === dep);
        return {
          message: `"${s.name}"이 켜져 있는데, 이 단계가 입력으로 쓰는 "${depStage?.name || dep}"은 꺼져 있습니다 — 앞 단계 없이 진행되어 결과물 품질이 떨어지거나 의미 없는 산출물이 나올 수 있습니다.`,
        };
      });
    });
  // 기존 pipeline.config.json의 커스텀 경고(예: 보안검토 없는 배포)도 함께 표시
  const customWarnings = config.dependencyWarnings.filter((w) => {
    const stageOn = enabled.includes(w.if.stage) === w.if.on;
    const missingOff = !enabled.includes(w.andMissing);
    return stageOn && missingOff;
  });
  // 필수로 표시된 단계라도 사람이 원하면 뺄 수 있어야 함 — 막지 않고 경고만 보여준다
  const requiredButOff = config.stages.filter((s) => s.required && !enabled.includes(s.id));

  return (
    <div>
      <p className="sub">순서: ① 요구사항 파일 업로드 → ② 기술 스택 설정 → ③ 실행할 에이전트 선택 → ④ 파이프라인 시작</p>

      {/* 1. 파일 업로드 */}
      <div className="card">
        <h3>① 요구사항 파일 업로드</h3>
        <p style={{ marginBottom: 12 }}>
          스토리보드 · 요구사항 문서를 여러 개 업로드하세요. <b>워드(.docx), 엑셀(.xlsx), 파워포인트(.pptx),
          PDF, 텍스트 등 형식은 자유롭게 섞어도 됩니다</b> — 파일 내용을 여기서 미리 변환하지 않고, 기획
          에이전트(Claude Code)가 각 파일을 직접 열어서 형식에 맞게 분석합니다.
        </p>
        <p className="sub" style={{ margin: "0 0 12px" }}>
          단, 데모(드라이런) 모드에서는 실제 파일을 읽지 않고 파일명만 흉내내어 응답하니, 실제 분석 결과를
          보려면 "실제 모드"로 실행하세요.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => handleUpload(e.target.files)}
        />
        <button className="btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? "업로드 중..." : "파일 선택"}
        </button>

        {uploadedFiles.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {uploadedFiles.map((f) => (
              <div key={f} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontSize: 13 }}>📄 {f}</span>
                <button className="btn" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => removeFile(f)}>삭제</button>
              </div>
            ))}
          </div>
        )}
        {uploadedFiles.length === 0 && <p className="sub" style={{ margin: "10px 0 0" }}>아직 업로드된 파일이 없습니다.</p>}
      </div>

      {/* 2. 기술 스택 설정 */}
      <div className="card">
        <h3>② 기술 스택 설정</h3>
        <p style={{ marginBottom: 14 }}>
          개발 언어 · 프레임워크 · 프로젝트 유형과, 실제 코드가 만들어질(또는 이미 있는) 위치를 지정하세요.
          설계 · 개발 에이전트가 이 설정을 반드시 준수하도록 프롬프트에 포함됩니다.
        </p>

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div
            className={`preset-row ${tech.project_mode === "new" ? "active" : ""}`}
            style={{ flex: 1, margin: 0 }}
            onClick={() => setTech({ ...tech, project_mode: "new" })}
          >
            <div className="radio" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>신규 프로젝트</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>비어있는 위치에 처음부터 새로 생성</div>
            </div>
          </div>
          <div
            className={`preset-row ${tech.project_mode === "existing" ? "active" : ""}`}
            style={{ flex: 1, margin: 0 }}
            onClick={() => setTech({ ...tech, project_mode: "existing" })}
          >
            <div className="radio" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>기존 프로젝트 수정</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>이미 존재하는 코드베이스에 변경사항 반영</div>
            </div>
          </div>
        </div>

        {tech.project_mode === "existing" && (
          <div style={{ background: "var(--human-dim)", borderLeft: "2px solid var(--human)", borderRadius: "0 6px 6px 0", padding: "10px 14px", marginBottom: 16, fontSize: 12.5, color: "#F0CD9A" }}>
            ⚠ 기존 프로젝트 모드에서는 아래 "①에서 업로드한 파일"이 전체 요구사항이 아니라 <b>변경 요청 사항</b>으로 취급됩니다.
            <b> 언어·프레임워크 등을 안 채워도 됩니다</b> — 아래 경로(이미 존재하는 프로젝트 폴더)만 정확히 입력하면,
            에이전트가 그 폴더를 직접 읽어서 사용 중인 언어·프레임워크·컨벤션을 스스로 판단합니다
            (비어있으면 안 되고, 없는 경로면 오류로 멈춥니다). 되도록 Git으로 버전관리 중인 프로젝트를 권장합니다 —
            그래야 에이전트가 변경한 내용을 diff로 검토할 수 있습니다.
          </div>
        )}

        {tech.project_mode === "existing" ? (
          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>
              (선택) 그래도 언어/프레임워크 등을 힌트로 알려주고 싶다면 펼치기
            </summary>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
              <div>
                <div className="field-label" style={{ fontSize: 11, color: "var(--muted-dim)", marginBottom: 4 }}>언어 (선택)</div>
                <input className="tech-input" placeholder="비워두면 자동 판단" value={tech.language}
                  onChange={(e) => setTech({ ...tech, language: e.target.value })} />
              </div>
              <div>
                <div className="field-label" style={{ fontSize: 11, color: "var(--muted-dim)", marginBottom: 4 }}>프레임워크 (선택)</div>
                <input className="tech-input" placeholder="비워두면 자동 판단" value={tech.framework}
                  onChange={(e) => setTech({ ...tech, framework: e.target.value })} />
              </div>
              <div>
                <div className="field-label" style={{ fontSize: 11, color: "var(--muted-dim)", marginBottom: 4 }}>프로젝트 유형 (선택)</div>
                <input className="tech-input" placeholder="비워두면 자동 판단" value={tech.project_type}
                  onChange={(e) => setTech({ ...tech, project_type: e.target.value })} />
              </div>
              <div>
                <div className="field-label" style={{ fontSize: 11, color: "var(--muted-dim)", marginBottom: 4 }}>UI 프레임워크 (선택)</div>
                <input className="tech-input" placeholder="비워두면 자동 판단" value={tech.ui_framework}
                  onChange={(e) => setTech({ ...tech, ui_framework: e.target.value })} />
              </div>
              <div>
                <div className="field-label" style={{ fontSize: 11, color: "var(--muted-dim)", marginBottom: 4 }}>ORM / 데이터베이스 (선택)</div>
                <input className="tech-input" placeholder="비워두면 자동 판단" value={tech.orm}
                  onChange={(e) => setTech({ ...tech, orm: e.target.value })} />
              </div>
            </div>
          </details>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div className="field-label" style={{ fontSize: 11, color: "var(--muted-dim)", marginBottom: 4 }}>언어</div>
              <input className="tech-input" placeholder="예: C#, TypeScript, Python" value={tech.language}
                onChange={(e) => setTech({ ...tech, language: e.target.value })} />
            </div>
            <div>
              <div className="field-label" style={{ fontSize: 11, color: "var(--muted-dim)", marginBottom: 4 }}>프레임워크 / 런타임</div>
              <input className="tech-input" placeholder="예: .NET 8.0, .NET Framework 4.8, Node.js" value={tech.framework}
                onChange={(e) => setTech({ ...tech, framework: e.target.value })} />
            </div>
            <div>
              <div className="field-label" style={{ fontSize: 11, color: "var(--muted-dim)", marginBottom: 4 }}>프로젝트 유형</div>
              <input className="tech-input" placeholder="예: 웹, 데스크톱, CLI, API 서버" value={tech.project_type}
                onChange={(e) => setTech({ ...tech, project_type: e.target.value })} />
            </div>
            <div>
              <div className="field-label" style={{ fontSize: 11, color: "var(--muted-dim)", marginBottom: 4 }}>UI 프레임워크</div>
              <input className="tech-input" placeholder="예: WPF, WinForms, React, 해당없음" value={tech.ui_framework}
                onChange={(e) => setTech({ ...tech, ui_framework: e.target.value })} />
            </div>
            <div>
              <div className="field-label" style={{ fontSize: 11, color: "var(--muted-dim)", marginBottom: 4 }}>ORM / 데이터베이스</div>
              <input className="tech-input" placeholder="예: Entity Framework Core, Prisma, 해당없음" value={tech.orm}
                onChange={(e) => setTech({ ...tech, orm: e.target.value })} />
            </div>
          </div>
        )}

        {/* output_path는 모드와 무관하게 항상 표시 (기존 모드에서는 필수) */}
        <div style={{ marginBottom: 12 }}>
          <div className="field-label" style={{ fontSize: 11, color: "var(--muted-dim)", marginBottom: 4 }}>
            {tech.project_mode === "existing" ? "기존 프로젝트 경로 (이미 존재해야 함, 필수)" : "프로젝트가 만들어질 위치"}
          </div>
          <input className="tech-input"
            placeholder={tech.project_mode === "existing" ? "예: D:\\Projects\\기존서비스 (실제 존재하는 폴더)" : "예: D:\\Projects\\my-app (절대경로 권장)"}
            value={tech.output_path}
            onChange={(e) => setTech({ ...tech, output_path: e.target.value })} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div className="field-label" style={{ fontSize: 11, color: "var(--muted-dim)", marginBottom: 4 }}>
            참고 코드 레퍼런스 (선택) — 스타일 · 패턴만 참고, 직접 수정하지 않음
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input className="tech-input" placeholder="예: D:\Projects\기존모듈-참고용"
              value={newRefPath}
              onChange={(e) => setNewRefPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addReferencePath()} />
            <button className="btn" onClick={addReferencePath}>추가</button>
          </div>
          {tech.reference_paths.map((p) => (
            <div key={p} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "var(--panel-alt)", borderRadius: 6, marginBottom: 4, fontSize: 12.5 }}>
              <span>📁 {p}</span>
              <button className="btn" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => removeReferencePath(p)}>삭제</button>
            </div>
          ))}
          {tech.reference_paths.length === 0 && <p className="sub" style={{ margin: "4px 0 0" }}>없음 — 참고할 기존 코드/프로젝트가 있다면 로컬 경로를 추가하세요.</p>}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div className="field-label" style={{ fontSize: 11, color: "var(--muted-dim)", marginBottom: 4 }}>추가 제약사항 (선택)</div>
          <input className="tech-input" style={{ width: "100%" }} placeholder="예: 사내 코딩 컨벤션 준수, 특정 라이브러리 금지 등"
            value={tech.notes} onChange={(e) => setTech({ ...tech, notes: e.target.value })} />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={saveTechStack}>{techSaved ? "저장됨 ✓" : "기술 스택 저장"}</button>
          <button className="btn" onClick={getRecommendation} disabled={recommending || !uploadedFiles.length}>
            {recommending ? "추천받는 중..." : "AI에게 추천받기 (업로드 파일 기반)"}
          </button>
        </div>
        {!uploadedFiles.length && <p className="sub" style={{ margin: "8px 0 0" }}>추천을 받으려면 먼저 ①에서 파일을 업로드하세요.</p>}
        {recommendError && <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--risk)" }}>⚠ {recommendError}</p>}
        {recommendation && (
          <div style={{ marginTop: 12, background: "var(--panel-alt)", borderRadius: 8, padding: "12px 16px", fontSize: 12.5, whiteSpace: "pre-wrap" }}>
            <div style={{ color: "var(--muted-dim)", fontSize: 11, marginBottom: 6 }}>AI 추천 (참고용 — 위 입력칸에 직접 반영하려면 수동으로 옮겨 적으세요)</div>
            {recommendation}
          </div>
        )}
      </div>

      {/* 3. 에이전트 선택 */}
      <div className="card">
        <h3>③ 실행할 에이전트 선택</h3>
        {Object.entries(config.presets).map(([key, preset]) => (
          <div key={key} className={`preset-row ${presetKey === key ? "active" : ""}`} onClick={() => applyPreset(key)}>
            <div className="radio" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{preset.label}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{preset.description}</div>
            </div>
          </div>
        ))}
        <div className={`preset-row ${presetKey === "custom" ? "active" : ""}`} onClick={() => applyPreset("custom")}>
          <div className="radio" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>커스텀 (전체 실행 후 필요 없는 것만 해제)</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>선택하면 일단 전체 에이전트가 켜집니다 — 아래에서 원하는 것만 끄세요</div>
          </div>
        </div>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
          {config.stages.map((s) => (
            <label key={s.id} className="check-row" style={{ display: "flex" }}>
              <input
                type="checkbox"
                checked={enabled.includes(s.id)}
                onChange={() => toggleStage(s.id)}
              />
              <span>
                {s.id} · {s.name} {s.required && <span className="tag flow" style={{ marginLeft: 8 }}>핵심 단계</span>}
              </span>
            </label>
          ))}
          {requiredButOff.map((s) => (
            <div key={`warn-${s.id}`} className="warn-line">
              ⚠ "{s.name}"은 파이프라인 핵심 단계입니다 — 빼면 뒤 단계가 정상 동작하지 않을 수 있어요 (그래도 원하시면 뺄 수 있습니다).
            </div>
          ))}
          {dependencyWarnings.map((w, i) => (
            <div key={`dep-${i}`} className="warn-line">⚠ {w.message}</div>
          ))}
          {customWarnings.map((w, i) => (
            <div key={`custom-${i}`} className="warn-line">⚠ {w.message}</div>
          ))}
        </div>
        <button className="btn" style={{ marginTop: 12 }} onClick={saveSelection}>{savedConfig ? "저장됨 ✓" : "이 선택 저장"}</button>
      </div>

      {/* 4. 시작하기 */}
      <div className="card" style={{ borderColor: "var(--flow)" }}>
        <h3>④ 파이프라인 시작</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 13 }}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          데모(드라이런) 모드로 시작 — 실제 Claude Code 호출 없이 흐름만 확인
        </label>

        {engineRunning ? (
          <span className="tag ok">● 엔진 실행 중 — "진행 현황" 탭에서 확인하세요</span>
        ) : (
          <button className="btn" onClick={startPipeline} disabled={starting}>
            {starting ? "시작하는 중..." : "선택한 에이전트로 파이프라인 시작"}
          </button>
        )}
        {startMsg && <p style={{ marginTop: 10, fontSize: 13 }}>{startMsg}</p>}

        {(engineRunning || log) && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: "var(--muted-dim)", marginBottom: 6 }}>엔진 로그 (최근)</div>
            <pre style={{
              background: "var(--panel-alt)", border: "1px solid var(--line)", borderRadius: 8,
              padding: 12, fontSize: 11.5, maxHeight: 220, overflowY: "auto", whiteSpace: "pre-wrap", margin: 0,
            }}>{log || "(로그 없음)"}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
