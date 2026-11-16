// Synthetic only. Imported by tests and local preview tooling, never by a production entry point.
import source from "./operatorFixture.json";
import type { OperationAnalyses, OperationDiagnostics, OperationRoom, OperationRoomDetail, OperationsApi } from "../api/operations";

export function operatorFixture() {
  return structuredClone(source) as { room: OperationRoom; roomDetail: OperationRoomDetail; history: OperationAnalyses; diagnostics: OperationDiagnostics };
}
export function fixtureOperationsApi(overrides: Partial<OperationsApi> = {}): OperationsApi {
  const data = operatorFixture();
  return {
    rooms: async () => ({ items: [data.room], next_cursor: null }),
    room: async () => data.roomDetail,
    invocation: async () => data.diagnostics.invocations[0]!,
    analyses: async () => data.history,
    diagnostics: async (_room, id) => ({
      ...data.diagnostics,
      scope: id === null ? "CURRENT_COLLECTION" : "FROZEN_ANALYSIS",
      analysis: id === null ? null : data.history.items.find(item => item.id === id) ?? data.history.items[0]!,
    }),
    reanalyze: async (_room, request) => ({
      request_id: request.request_id, source_analysis_id: request.source_analysis_id,
      analysis_id: "00000220-1111-4111-8111-000000000002", accepted_state_version: request.expected_state_version + 1,
      accepted_at: "2027-01-04T01:39:00Z", analysis_contract_version: "schedule-dsl-response-6",
    }),
    ...overrides,
  };
}
