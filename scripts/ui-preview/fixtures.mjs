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
  nickname_edit: ['닉네임 변경 · 계정 메뉴', '/account/rooms'], nickname_error: ['닉네임 변경 · 저장 오류', '/account/rooms'],
  collecting: ['조건 입력', `/rooms/${code}`], checking: ['조건 확인 중', `/rooms/${code}`], saved: ['조건 제출 완료', `/rooms/${code}`],
  analyzing: ['분석 중', `/rooms/${code}`], ready: ['추천 시간 3개', `/rooms/${code}`], confirmed: ['확정 결과', `/rooms/${code}`],
  participant_statuses: ['참가자별 가능·불가·확인 필요', `/rooms/${code}`], participant_status_modes: ['방식별 참가자 상태 비교', `/rooms/${code}`],
  participant_status_many: ['참가자 7명 · 더보기와 접기', `/rooms/${code}`],
  review: ['결과 리뷰', `/rooms/${code}`], no_match: ['일치하는 시간 없음', `/rooms/${code}`], error: ['방 조회 실패', `/rooms/${code}`],
};
const raw = '화요일과 목요일 오후 7시부터 9시까지 온라인으로 가능해요.';
export function fixture(scene) {
  let account = !['landing', 'login'].includes(scene);
  let accountName = ['nickname_edit', 'nickname_error'].includes(scene) ? '서윤' : '합성 주최자';
  const previewAccount = () => ({ id, displayName: accountName, capabilities: { canViewOperations: ['nickname_edit', 'nickname_error'].includes(scene) } });
  let status = ({ analyzing: 'ANALYZING', ready: 'READY', participant_statuses: 'READY', participant_status_modes: 'READY', participant_status_many: 'READY', confirmed: 'CONFIRMED', review: 'CONFIRMED', no_match: 'NO_MATCH' })[scene] ?? 'COLLECTING';
  let purpose = '함께 준비하는 주말 모임';
  let activeCode = code;
  let activeRole = "HOST";
  let manualOnly = false;
  let expectedParticipants = 4;
  let deadline = null;
  const titles = [purpose, '팀 프로젝트 회의', '친구들과 저녁 약속', '함께하는 독서 모임', '주말 산책'];
  let submitted = scene === 'saved' || status !== 'COLLECTING';
  // Explicit synthetic aggregate, independent of draft/precheck state.
  let submittedParticipantCount = scene === 'saved' ? 2 : status !== 'COLLECTING' ? 4 : 0;
  let candidateText = raw;
  let checkState = scene === 'checking' ? 'CHECKING' : submitted ? 'CLEAR' : null;
  let reviewDone = false;
  const time = (day, hour) => `${date(day)}T${hour}:00:00Z`;
  const options = [1, 2, 3].map((day, i) => ({ option_id: `33333333-3333-4333-8333-33333333333${i}`, rank: i + 1,
    summary: ['저녁에 여유롭게 만나는 시간', '다음 날 함께할 수 있는 시간', '주말을 준비하는 시간'][i],
    time_range: { start_at: time(day, '10'), end_at: time(day, '12') },
    variants: [{ variant_id: variantId, meeting_mode: 'REMOTE', attendance_count: 4, total_participants: 4, partial_attendance: false, excluded_participants: [], place: null }],
  }));
  if (['participant_statuses', 'participant_status_modes', 'participant_status_many'].includes(scene)) {
    // Entirely fictional UI examples, unrelated to real A/B inputs.
    const names = scene === 'participant_status_many' ? ['서윤', '도윤', '지우', '하린', '가람', '나래', '다온'] : ['서윤', '도윤', '지우', '하린'];
    expectedParticipants = submittedParticipantCount = names.length;
    for (const [index, option] of options.entries()) {
      const variant = option.variants[0];
      Object.assign(variant, { attendance_count: names.length, total_participants: names.length });
      variant.participant_statuses = names.map((display_name, position) => ({ participant_ref: `p${position + 1}`, display_name, status: position < names.length - 1 || index === 0 ? 'AVAILABLE' : index === 1 ? 'UNAVAILABLE' : 'UNKNOWN' }));
      variant.available_participant_names = variant.participant_statuses.filter(person => person.status === 'AVAILABLE').map(person => person.display_name);
      if (index === 1) Object.assign(variant, { meeting_mode: 'IN_PERSON', attendance_count: names.length - 1, partial_attendance: true, excluded_participant_names: [names.at(-1)], place: { display_name: '합정역 근처', latitude: null, longitude: null } });
      if (index === 2) Object.assign(variant, { meeting_mode: 'IN_PERSON', attendance_confirmed: false, summary: `${names.length}명의 시간이 맞지만 장소·이동 조건은 확인이 필요해요.` });
    }
    if (scene === 'participant_status_modes') {
      options[0].variants = [options[1].variants[0], { ...options[0].variants[0], variant_id: '44444444-4444-4444-8444-444444444444' }];
      options.splice(1);
    }
  }
  let result = { confirmed_at: now(), selection: { protocol: 'diverse-time-v1', analysis_id: id, option_id: options[0].option_id, variant_id: variantId, start_at: time(1, '10'), end_at: time(1, '11') },
    candidate: { candidate_id: null, plan_type: 'A', rank: 1, meeting_mode: 'REMOTE', attendance_count: 4, total_participants: 4, place: null, summary: '모두 함께할 수 있는 온라인 모임', time_ranges: [{ start_at: time(1, '10'), end_at: time(1, '11') }] } };
  const room = () => ({ invite_code: activeCode, purpose, meeting_mode: 'EITHER', time_zone_id: 'Asia/Seoul', search_start_date: date(0), search_end_date: date(7), search_range_source: 'HOST_SPECIFIED', expected_participants: expectedParticipants, submitted_participant_count: submittedParticipantCount, submission_deadline: deadline, manual_only: manualOnly,
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
    if (path === '/api/auth/refresh' && method === 'POST') return account ? [200, { accessToken: 'ui-preview-synthetic-token', expiresAt: new Date(Date.now() + 900000).toISOString(), account: previewAccount() }] : [401, { code: 'AUTH_REFRESH_INVALID' }];
    if (path === '/api/auth/me' && method === 'PUT') {
      if (!account) return [401, { code: 'AUTH_ACCESS_REQUIRED' }];
      if (scene === 'nickname_error') return [503, { code: 'AUTH_UNAVAILABLE' }];
      if (typeof body.displayName !== 'string' || /\p{Cc}/u.test(body.displayName) || !body.displayName.trim() || Array.from(body.displayName.trim()).length > 50) return [400, { code: 'VALIDATION_FAILED' }];
      accountName = body.displayName.trim(); return [200, previewAccount()];
    }
    if (['/api/auth/logout', '/api/auth/logout-all'].includes(path) && method === 'POST') { account = false; return [204, null]; }
    if (/^\/api\/auth\/(google|kakao)\/start$/.test(path)) return [409, { detail: '실제 로그인은 연결하지 않습니다. 화면 목록에서 합성 계정 화면을 선택하세요.' }];
    if (path === '/api/account/rooms' && method === 'GET') {
      const rows = scene === 'empty' ? [] : Array.from({ length: 5 }, (_, i) => ({ invite_code: i ? code.slice(0, -1) + i : code, purpose: titles[i], role: i % 2 ? 'MEMBER' : 'HOST', created_at: now(), expires_at: new Date(Date.now() + 30 * 86400000).toISOString() }));
      const q = url.searchParams;
      return [200, { rooms: rows.filter(row => (!q.get('query') || row.purpose.includes(q.get('query'))) && (!q.get('role') || q.get('role') === row.role) && (!q.get('created_from') || date(0) >= q.get('created_from')) && (!q.get('created_to') || date(0) <= q.get('created_to'))), has_more: false, next_cursor: null }];
    }
    if (path === '/api/rooms' && method === 'POST') { purpose = typeof body.purpose === 'string' ? body.purpose : purpose; manualOnly = body.manual_only === true; expectedParticipants = typeof body.expected_participants === 'number' ? body.expected_participants : null; deadline = typeof body.submission_deadline === 'string' ? body.submission_deadline : null; status = 'COLLECTING'; submitted = false; submittedParticipantCount = 0; checkState = null; return [201, room()]; }
    if (path === root && method === 'GET') return scene === 'error' ? [503, { detail: '미리보기용 조회 실패예요. 화면 목록에서 다른 상태를 선택해 주세요.' }] : [200, room()];
    if (path === root + '/guest-records' && method === 'GET') return [200, { records: [] }];
    if (path === root + '/submission/checks/current' && method === 'GET') return [200, snapshot()];
    if (path === root + '/submission/checks' && method === 'POST') {
      candidateText = String(body.raw_text ?? '').slice(0, 2000); checkState = 'CLEAR'; if (!submitted) submittedParticipantCount++; submitted = true;
      // Deliberately deterministic UI fixture: no interpretation/model call.
      return [200, snapshot()];
    }
    if (path === root + '/submission' && method === 'GET') return [404, { code: 'SUBMISSION_NOT_FOUND' }];
    if (path === root + '/close' && method === 'POST') { status = 'READY'; return [200, room()]; }
    if (path === root + '/recommendations' && method === 'GET') return [200, { protocol: 'diverse-time-v1', analysis_id: id, state_version: 1, quality: 'COMPLETE', total_options: options.length, options, has_alternatives: false, next_cursor: null }];
    if (path.startsWith(root + '/recommendations/') && path.endsWith('/confirmation') && method === 'POST') {
      const option = options.find(option => path.includes(option.option_id));
      const variant = option?.variants.find(variant => variant.variant_id === body.variant_id);
      if (!variant) return [404, { detail: '미리보기 후보가 없어요.' }];
      status = 'CONFIRMED'; result = { ...result, selection: { ...result.selection, ...body, option_id: option.option_id }, candidate: { ...result.candidate, meeting_mode: variant.meeting_mode, attendance_count: variant.attendance_count, total_participants: variant.total_participants, attendance_confirmed: variant.attendance_confirmed ?? true, place: variant.place, summary: variant.summary ?? result.candidate.summary, time_ranges: [{ start_at: body.start_at, end_at: body.end_at }] } }; return [200, result];
    }
    if (path === root + '/result' && method === 'GET') return [200, result];
    if (path === root + '/candidates/unapplied-inputs' && method === 'GET') return [200, []];
    if (path === root + '/review-prompt' && method === 'POST') return [200, { prompt_id: reviewDone ? null : id, state: reviewDone ? 'SUPPRESSED' : 'PENDING' }];
    if ([root + `/review-prompt/${id}/submission`, root + `/review-prompt/${id}/close`].includes(path) && method === 'POST') { reviewDone = true; return [200, { prompt_id: id, state: path.endsWith('/close') ? 'CLOSED' : 'SUBMITTED' }]; }
    return [501, { code: 'UI_PREVIEW_UNSUPPORTED', detail: '이 동작은 로컬 미리보기에서 제공하지 않아요. 화면 목록에서 상태를 선택해 주세요.' }];
  };
}
export const createId = () => randomUUID();
