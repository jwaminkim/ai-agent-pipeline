export default function PrinciplesTab() {
  return (
    <div>
      <p className="sub">이 프로젝트가 따르는 핵심 설계 원칙입니다. 자세한 논의 배경은 저장소의 <code>docs/requirements.html</code>(원본 요구사항 문서)를 참고하세요.</p>

      <div className="card">
        <h3>자율 해결 우선 원칙 (사람 개입 최소화)</h3>
        <p style={{ marginBottom: 10 }}>사람에게 묻는 것은 최소화하고, 에이전트끼리 최대한 자율적으로 해결하는 것을 기본값으로 합니다.</p>
        <p><span className="tag ok">TIER 1</span> 구현 버그·컨벤션 → 완전 자율 해결 (재시도 루프)</p>
        <p style={{ marginTop: 8 }}><span className="tag flow">TIER 2</span> 모호함 → 합리적 가정 후 진행 + 기록, 정기 체크포인트에서 일괄 검토</p>
        <p style={{ marginTop: 8 }}><span className="tag human">TIER 3</span> 비가역적 변경·고위험 → 즉시 사람에게 (CTO 경유)</p>
      </div>

      <div className="card">
        <h3>PM / CTO 역할 분리</h3>
        <p>PM은 상시 운영 엔진(라우팅, 재시도, 사용량 관리), CTO는 사람이 대화하는 유일한 창구(요약 카드 기반, 가벼움 유지).</p>
      </div>

      <div className="card">
        <h3>순차 개발 실행</h3>
        <p>공유 사용량 풀(5시간/주간 캡) 충돌을 피하기 위해 DB → 백엔드 → 프론트 순차 실행으로 확정.</p>
      </div>

      <div className="card">
        <h3>검증 가능한 게이트</h3>
        <p>자연어 보고 대신 실행 로그 · 커버리지 · 빌드 결과 등 기계적으로 확인 가능한 조건으로만 다음 단계 진행.</p>
      </div>

      <div className="card">
        <h3>사용량 소진 시 라우팅</h3>
        <p><b style={{ color: "var(--text)" }}>5시간 세션 캡</b> — 자동 대기 후 재개.<br />
        <b style={{ color: "var(--text)" }}>주간 캡</b> — 자동 대기하지 않고 즉시 사람에게 알림.</p>
      </div>

      <div className="card">
        <h3>프로젝트 간 지식 재사용</h3>
        <p>이슈 히스토리 → 일반화(고객사 정보 제거) → 지식 베이스 축적 → 다음 프로젝트 조회. 사람이 승인한 패턴만 저장.</p>
      </div>
    </div>
  );
}
