// Development-only browser fixture. No production endpoint, identity, or meeting data.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ReviewPrompt } from "../../src/features/review/ReviewPrompt";
import { reviewApi, type ReviewReceipt } from "../../src/features/review/api";

const call = async (action: string, body: unknown): Promise<ReviewReceipt> => {
  const response = await fetch(`/__review-test/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error("Synthetic fixture unavailable");
  return response.json();
};
reviewApi.claim = (_code, requestId) => call("claim", { request_id: requestId });
reviewApi.submit = (_code, promptId, answer) => call("submit", { prompt_id: promptId, ...answer });
reviewApi.close = (_code, promptId, hide) => call("close", { prompt_id: promptId, hide_for_week: hide });
const away = new URLSearchParams(location.search).has("away");
createRoot(document.getElementById("root")!).render(<StrictMode><main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: "50rem", margin: "auto" }}><h1>{away ? "다른 화면" : "확정 결과 검증용 화면"}</h1><p>합성 데이터로 리뷰 컴포넌트만 검증합니다.</p><button>결과 확인</button>{!away && <ReviewPrompt inviteCode="synthetic-room" viewerKey="synthetic-viewer" />}</main></StrictMode>);
