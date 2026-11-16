// Synthetic saved-run envelope for existing transport/privacy browser contracts.
export function diagnostics(roomId: string, runId: string, execution: unknown) {
  const analysis = { id: runId, status: "COMPLETED", created_at: "2026-10-01T01:02:00Z", fixed_at: "2026-10-01T01:02:00Z", active: true, contract: "DSL_STRUCTURAL_V5" };
  return {
    history: { items: [analysis], next_cursor: null },
    detail: { room_id: roomId, scope: "FROZEN_ANALYSIS", analysis, inputs: [], inputs_truncated: false,
      invocations: [execution], invocations_truncated: false, timeline: [], timeline_truncated: false, results: [], results_truncated: false },
  };
}
