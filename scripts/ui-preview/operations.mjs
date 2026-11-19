// Synthetic UI state only; this module never runs in the production browser.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const example = JSON.parse(readFileSync(new URL('../../src/testing/operatorFixture.json', import.meta.url), 'utf8'));
export function operationsFixture() {
  const titles = ['제품 기획 회의', '1월 독서 모임', '금요일 점심 약속', '디자인 리뷰', '프로젝트 킥오프', '새해 회고'];
  const records = titles.map((title, index) => {
    const value = structuredClone(example);
    value.room.id = `0000006e-1111-4111-8111-${String(index + 1).padStart(12, '0')}`;
    value.room.title = title;
    value.diagnostics.room_id = value.room.id;
    for (const execution of value.diagnostics.invocations) execution.room_id = value.room.id;
    if (index === 1) value.room.current_run_status = 'ANALYSIS_DELAYED';
    if (index === 3) value.room.current_run_status = 'DEAD_LETTERED';
    value.history.items[0].status = value.room.current_run_status;
    value.diagnostics.analysis.status = value.room.current_run_status;
    if ([1, 3, 5].includes(index)) value.diagnostics.results = [];
    if ([1, 3].includes(index)) {
      value.diagnostics.invocations = [];
      value.diagnostics.timeline = [];
    }
    if (index === 2) Object.assign(value.room, { collection_status: 'COLLECTING', current_run_status: null, active_analysis_id: null, closed_at: null, closure_reason: null, submitted_participant_count: 2 });
    if (index === 4) value.room.current_analysis_confirmed = true;
    value.roomDetail.room = value.room;
    return value;
  });
  const receipts = new Map();
  return (method, url, body) => {
    const path = url.pathname;
    if (path === '/api/operations/rooms' && method === 'GET') return [200, { items: records.map(value => value.room), next_cursor: null }];
    const match = path.match(/^\/api\/operations\/rooms\/([^/]+)(?:\/(analyses|diagnostics))?$/);
    if (!match) return null;
    const record = records.find(value => value.room.id === match[1]);
    if (!record) return [404, {}];
    if (!match[2] && method === 'GET') return [200, record.roomDetail];
    if (match[2] === 'analyses' && method === 'GET') return [200, record.history];
    if (match[2] === 'analyses' && method === 'POST') {
      const prior = receipts.get(body.request_id);
      if (prior) return JSON.stringify(prior.body) === JSON.stringify(body) && prior.roomId === record.room.id ? [202, prior.receipt] : [409, {}];
      if (record.room.current_analysis_confirmed || record.room.collection_status !== 'CLOSED' || record.room.active_analysis_id !== body.source_analysis_id || record.room.state_version !== body.expected_state_version || ['QUEUED', 'STRUCTURING', 'MATCHING'].includes(record.room.current_run_status)) return [409, {}];
      const analysisId = randomUUID();
      const accepted = new Date(Date.parse(record.history.items[0].created_at) + 60_000).toISOString();
      const receipt = { request_id: body.request_id, source_analysis_id: body.source_analysis_id, analysis_id: analysisId, accepted_state_version: record.room.state_version + 1, accepted_at: accepted, analysis_contract_version: 'schedule-dsl-response-6' };
      receipts.set(body.request_id, { body, roomId: record.room.id, receipt });
      record.history.items.forEach(item => { item.active = false; });
      const run = { ...record.diagnostics.analysis, id: analysisId, status: 'QUEUED', created_at: accepted, fixed_at: accepted, active: true };
      record.history.items.unshift(run);
      Object.assign(record.room, { active_analysis_id: analysisId, state_version: receipt.accepted_state_version, current_run_status: 'QUEUED' });
      record.queued = { run, reads: 0 };
      return [202, receipt];
    }
    if (match[2] === 'diagnostics' && method === 'GET') {
      const selected = url.searchParams.get('analysis_id');
      const value = structuredClone(record.diagnostics);
      if (!selected) {
        Object.assign(value, { scope: 'CURRENT_COLLECTION', analysis: null, invocations: [], timeline: [], results: [] });
        for (const input of value.inputs) input.stored_interpretation = null;
        return [200, value];
      }
      const run = record.history.items.find(item => item.id === selected);
      if (!run) return [404, {}];
      value.analysis = { ...run };
      if (record.queued?.run.id === selected) {
        record.queued.reads++;
        // A new run must never borrow the original run's execution IDs.
        value.invocations = [];
        value.timeline = [{ kind: 'ANALYSIS_CREATED', at: run.created_at, status: 'RECORDED' }];
        if (record.queued.reads < 2) value.results = [];
        else {
          run.status = 'COMPLETED'; value.analysis.status = 'COMPLETED'; record.room.current_run_status = 'COMPLETED';
          value.timeline.push({ kind: 'INTERPRETATION_STORED', at: new Date(Date.parse(run.created_at) + 1000).toISOString(), status: 'RECORDED' });
        }
      }
      if (!run.active) {
        value.invocations = []; value.timeline = []; value.results = [];
        for (const input of value.inputs) {
          input.stored_interpretation = null;
          for (const check of input.checks) for (const attempt of check.attempts) attempt.classification = null;
        }
      }
      return [200, value];
    }
    return [405, {}];
  };
}
