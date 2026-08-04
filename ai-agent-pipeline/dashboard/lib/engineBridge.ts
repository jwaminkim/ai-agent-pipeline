/**
 * 엔진(engine/lib/*)의 CommonJS 모듈을 대시보드(Next.js API 라우트)에서 그대로 재사용하기 위한 브릿지.
 *
 * 왜 이렇게 하나: engine과 dashboard는 별도 프로세스지만 같은 로컬 파일시스템 위에 있고,
 * Next.js API 라우트는 Node.js 런타임에서 실행되므로 CommonJS .js 파일을 경로로 그냥 require()할 수
 * 있다. dashboard가 engine/config/pipeline.config.json, engine/prompts/cto.md를 이미 경로로 직접
 * 읽고 있던 것과 같은 패턴이다. 이렇게 하면 claudeClient.js / usageMonitor.js / authCheck.js를
 * dashboard용으로 따로 복제해서 유지보수 시 한쪽만 고치고 잊어버리는 위험(예전에 실제로 있었음 —
 * README 6번 섹션 참고)을 원천적으로 없앤다.
 */
import path from "path";

const ENGINE_LIB_DIR = path.join(process.cwd(), "..", "engine", "lib");

// eslint-disable-next-line @typescript-eslint/no-var-requires
export const claudeClient = require(path.join(ENGINE_LIB_DIR, "claudeClient.js"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const usageMonitor = require(path.join(ENGINE_LIB_DIR, "usageMonitor.js"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const authCheck = require(path.join(ENGINE_LIB_DIR, "authCheck.js"));
