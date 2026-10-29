// Local UI fixtures only. Never imported by src/ or the production build.
import { randomUUID } from 'node:crypto';
export const code = 'abcdefghijklmnopqrstuv';
const root = `/api/rooms/${code}`;
const id = '11111111-1111-4111-8111-111111111111';
const variantId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date().toISOString();
const date = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
export const scenes = {
  landing: ['랜딩 · 비로그인', '/'], login: ['로그인', '/login'], create: ['모임 만들기 · 합성 계정', '/create'],
  history: ['내 모임', '/account/rooms'], empty: ['내 모임 · 빈 목록', '/account/rooms'], security: ['계정 메뉴·보안', '/account/security'],
  collecting: ['조건 입력', `/rooms/${code}`], checking: ['조건 확인 중', `/rooms/${code}`], saved: ['조건 제출 완료', `/rooms/${code}`],
  analyzing: ['분석 중', `/rooms/${code}`], ready: ['추천 시간 3개', `/rooms/${code}`], confirmed: ['확정 결과', `/rooms/${code}`],
  review: ['결과 리뷰', `/rooms/${code}`], no_match: ['일치하는 시간 없음', `/rooms/${code}`], error: ['방 조회 실패', `/rooms/${code}`],
};
const raw = '화요일과 목요일 오후 7시부터 9시까지 온라인으로 가능해요.';
export function fixture(scene) {
  let account = !['landing', 'login'].includes(scene);
  let status = ({ analyzing: 'ANALYZING', ready: 'READY', confirmed: 'CONFIRMED', review: 'CONFIRMED', no_match: 'NO_MATCH' })[scene] ?? 'COLLECTING';
  let purpose = '함께 준비하는 주말 모임';
  let activeCode = code;
  let activeRole = "HOST";
  const titles = [purpose, '팀 프로젝트 회의', '친구들과 저녁 약속', '함께하는 독서 모임', '주말 산책'];
  let submitted = scene === 'saved' || status !== 'COLLECTING';
  let candidateText = raw;
  let checkState = scene === 'checking' ? 'CHECKING' : submitted ? 'CLEAR' : null;
  let reviewDone = false;
  const time = (day, hour) => `${date(day)}T${hour}:00:00Z`;
  const options = [1, 2, 3].map((day, i) => ({ option_id: `33333333-3333-4333-8333-33333333333${i}`, rank: i + 1,
    summary: ['저녁에 여유롭게 만나는 시간', '다음 날 함께할 수 있는 시간', '주말을 준비하는 시간'][i],
    time_range: { start_at: time(day, '10'), end_at: time(day, '12') },
    variants: [{ variant_id: variantId, meeting_mode: 'REMOTE', attendance_count: 4, total_participants: 4, partial_attendance: false, excluded_participants: [], place: null }],
  }));
  let result = { confirmed_at: now(), selection: { protocol: 'diverse-time-v1', analysis_id: id, option_id: options[0].option_id, variant_id: variantId, start_at: time(1, '10'), end_at: time(1, '11') },
    candidate: { candidate_id: null, plan_type: 'A', rank: 1, meeting_mode: 'REMOTE', attendance_count: 4, total_participants: 4, place: null, summary: '모두 함께할 수 있는 온라인 모임', time_ranges: [{ start_at: time(1, '10'), end_at: time(1, '11') }] } };
  const room = () => ({ invite_code: activeCode, purpose, meeting_mode: 'EITHER', time_zone_id: 'Asia/Seoul', search_start_date: date(0), search_end_date: date(7), search_range_source: 'HOST_SPECIFIED', expected_participants: 4, submission_deadline: null, manual_only: false,
    collection_status: status === 'COLLECTING' ? 'COLLECTING' : 'CLOSED', closure_reason: status === 'COLLECTING' ? null : 'MANUAL', closed_at: status === 'COLLECTING' ? null : now(), public_status: status,
    viewer: { joined: true, role: activeRole, display_name: activeRole === 'HOST' ? '합성 주최자' : '합성 참여자', context_id: variantId }, input_disclosure_policy: 'HOST_ON_PARTIAL_RESULT', state_version: 1, revision_generation: 0, revision_round: null,
    analysis_id: id, remaining_correction_analyses: 3, recommendation_protocol: 'diverse-time-v1', submission_protocol: 'PRE_SUBMIT_V1', review_prompt_supported: scene === 'review',
    capabilities: { can_edit_own_submission: status === 'COLLECTING', can_confirm: activeRole === 'HOST' && status === 'READY', can_open_revision: false, can_analyze_revision: false, can_force_reparse: false } });
  const snapshot = () => ({ candidate: checkState ? { revision: 1, raw_text: candidateText, created_at: now(), interpretation_reference_at: now() } : null,
    accepted: submitted ? { revision: 1, raw_text: candidateText, created_at: now(), interpretation_reference_at: now(), confirmation_source: 'PRECHECK' } : null,
    check: checkState ? { id, status: checkState, version: 1, retry_allowed: false, failure_code: null, question: null } : null,
    submission_complete: submitted, applied_to_result: submitted && ['READY', 'CONFIRMED'].includes(status), room: { collection_status: room().collection_status, state_version: 1, submission_deadline: null }, operation_outcome: null });
  return async (method, url, body) => {
    let path = url.pathname;
    const historyIndex = Array.from({ length: 5 }, (_, i) => i ? code.slice(0, -1) + i : code).findIndex(value => path === `/api/rooms/${value}` || path.startsWith(`/api/rooms/${value}/`));
    if (historyIndex >= 0) { activeCode = historyIndex ? code.slice(0, -1) + historyIndex : code; if (scene === 'history') { purpose = titles[historyIndex]; activeRole = historyIndex % 2 ? 'MEMBER' : 'HOST'; } path = path.replace(`/api/rooms/${activeCode}`, root); }
    if (path === '/api/auth/refresh' && method === 'POST') return account ? [200, { accessToken: 'ui-preview-synthetic-token', expiresAt: new Date(Date.now() + 900000).toISOString(), account: { id, displayName: '합성 주최자' } }] : [401, { code: 'AUTH_REFRESH_INVALID' }];
    if (['/api/auth/logout', '/api/auth/logout-all'].includes(path) && method === 'POST') { account = false; return [204, null]; }
    if (/^\/api\/auth\/(google|kakao)\/start$/.test(path)) return [409, { detail: '실제 로그인은 연결하지 않습니다. 화면 목록에서 합성 계정 화면을 선택하세요.' }];
    if (path === '/api/account/rooms' && method === 'GET') {
      const rows = scene === 'empty' ? [] : Array.from({ length: 5 }, (_, i) => ({ invite_code: i ? code.slice(0, -1) + i : code, purpose: titles[i], role: i % 2 ? 'MEMBER' : 'HOST', created_at: now(), expires_at: new Date(Date.now() + 30 * 86400000).toISOString() }));
      const q = url.searchParams;
      return [200, { rooms: rows.filter(row => (!q.get('query') || row.purpose.includes(q.get('query'))) && (!q.get('role') || q.get('role') === row.role) && (!q.get('created_from') || date(0) >= q.get('created_from')) && (!q.get('created_to') || date(0) <= q.get('created_to'))), has_more: false, next_cursor: null }];
    }
    if (path === '/api/rooms' && method === 'POST') { purpose = typeof body.purpose === 'string' ? body.purpose : purpose; status = 'COLLECTING'; submitted = false; checkState = null; return [201, room()]; }
    if (path === root && method === 'GET') return scene === 'error' ? [503, { detail: '미리보기용 조회 실패예요. 화면 목록에서 다른 상태를 선택해 주세요.' }] : [200, room()];
    if (path === root + '/guest-records' && method === 'GET') return [200, { records: [] }];
    if (path === root + '/submission/checks/current' && method === 'GET') return [200, snapshot()];
    if (path === root + '/submission/checks' && method === 'POST') {
      candidateText = String(body.raw_text ?? '').slice(0, 2000); checkState = 'CLEAR'; submitted = true;
      // Deliberately deterministic UI fixture: no interpretation/model call.
      return [200, snapshot()];
    }
    if (path === root + '/submission' && method === 'GET') return [404, { code: 'SUBMISSION_NOT_FOUND' }];
    if (path === root + '/close' && method === 'POST') { status = 'READY'; return [200, room()]; }
    if (path === root + '/recommendations' && method === 'GET') return [200, { protocol: 'diverse-time-v1', analysis_id: id, state_version: 1, quality: 'COMPLETE', total_options: 3, options, has_alternatives: false, next_cursor: null }];
    if (path.startsWith(root + '/recommendations/') && path.endsWith('/confirmation') && method === 'POST') {
      if (!options.some(option => path.includes(option.option_id))) return [404, { detail: '미리보기 후보가 없어요.' }];
      status = 'CONFIRMED'; result = { ...result, selection: { ...result.selection, ...body, option_id: path.split('/').at(-2) }, candidate: { ...result.candidate, time_ranges: [{ start_at: body.start_at, end_at: body.end_at }] } }; return [200, result];
    }
    if (path === root + '/result' && method === 'GET') return [200, result];
    if (path === root + '/candidates/unapplied-inputs' && method === 'GET') return [200, []];
    if (path === root + '/review-prompt' && method === 'POST') return [200, { prompt_id: reviewDone ? null : id, state: reviewDone ? 'SUPPRESSED' : 'PENDING' }];
    if ([root + `/review-prompt/${id}/submission`, root + `/review-prompt/${id}/close`].includes(path) && method === 'POST') { reviewDone = true; return [200, { prompt_id: id, state: path.endsWith('/close') ? 'CLOSED' : 'SUBMITTED' }]; }
    return [501, { code: 'UI_PREVIEW_UNSUPPORTED', detail: '이 동작은 로컬 미리보기에서 제공하지 않아요. 화면 목록에서 상태를 선택해 주세요.' }];
  };
}
export const createId = () => randomUUID();
