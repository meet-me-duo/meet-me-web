import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../api/client";
import type { RecommendationList, RecommendationOption, Room } from "../api/types";
import { sameRecommendationInstant } from "../utils/recommendationTime";
import { viewerContext } from "../api/recovery";
import { RecommendationChoices } from "./RecommendationChoices";
import type { RecommendationSelection } from "./recommendationView";

export const RECOMMENDATION_PROTOCOL = "diverse-time-v1";

function presentation(option: RecommendationOption, position: number) {
  return { id: option.option_id, rank: option.rank ?? position, variants: option.variants.map(variant => ({
    id: variant.variant_id, startAt: option.time_range.start_at, endAt: option.time_range.end_at,
    attendanceCount: variant.attendance_count, totalParticipants: variant.total_participants,
    meetingMode: variant.meeting_mode, place: variant.place?.display_name ?? null,
  })) };
}

export function RecommendationsPanel({ room, onAccessDenied }: { room: Room; onAccessDenied: (error: ApiError) => void }) {
  const client = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [generation, setGeneration] = useState(0);
  const context = viewerContext(room);
  const key = ["recommendations", room.invite_code, room.analysis_id, context] as const;
  const current = useCallback(() => {
    const snapshot = client.getQueryData<Room>(["room", room.invite_code]);
    return mounted.current && !!snapshot && snapshot.analysis_id === room.analysis_id && viewerContext(snapshot) === context && snapshot.recommendation_protocol === RECOMMENDATION_PROTOCOL;
  }, [client, room.invite_code, room.analysis_id, context]);
  const compatible = (data: RecommendationList) => data.protocol === RECOMMENDATION_PROTOCOL && data.analysis_id === room.analysis_id;
  const primary = useQuery({ queryKey: [...key, "primary"], queryFn: ({ signal }) => api.getRecommendations(room.invite_code, signal), retry: false, enabled: !!room.analysis_id });
  const pages = useInfiniteQuery({
    queryKey: [...key, "alternatives", generation], enabled: false, retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const data = await api.getRecommendationAlternatives(room.invite_code, { analysis_id: room.analysis_id!, limit: 20, ...(pageParam === undefined ? {} : { cursor: pageParam }) }, signal);
      if (!compatible(data)) throw new ApiError(409, { code: "STALE_ANALYSIS", detail: "최신 추천 시간을 다시 확인해 주세요" });
      // A repeated cursor cannot advance; do not loop or interpret its contents.
      if (data.next_cursor !== null && data.next_cursor === pageParam) throw new Error("다른 가능한 시간을 갱신하지 못했어요. 다시 시도해 주세요.");
      return data;
    },
    getNextPageParam: page => page.next_cursor ?? undefined,
  });
  const refetchPrimary = primary.refetch;
  const reload = useCallback(async () => {
    if (!current()) return;
    setGeneration(value => value + 1);
    await client.cancelQueries({ queryKey: ["recommendations", room.invite_code, room.analysis_id, context, "alternatives"] });
    if (!current()) return;
    client.removeQueries({ queryKey: ["recommendations", room.invite_code, room.analysis_id, context, "alternatives"] });
    await client.invalidateQueries({ queryKey: ["room", room.invite_code] });
    if (current()) await refetchPrimary();
  }, [current, client, room.invite_code, room.analysis_id, context, refetchPrimary]);
  const confirm = useMutation({
    mutationKey: ["recommendations", room.invite_code], retry: false,
    mutationFn: (selection: RecommendationSelection) => api.confirmRecommendation(room.invite_code, selection.optionId, { analysis_id: room.analysis_id!, variant_id: selection.variantId, start_at: selection.startAt, end_at: selection.endAt }),
    onSuccess: async (result, selected) => {
      if (!current()) return;
      const saved = result.selection;
      if (!saved || saved.protocol !== RECOMMENDATION_PROTOCOL || saved.analysis_id !== room.analysis_id || saved.option_id !== selected.optionId || saved.variant_id !== selected.variantId || !sameRecommendationInstant(saved.start_at, selected.startAt) || !sameRecommendationInstant(saved.end_at, selected.endAt)) {
        await reload(); return;
      }
      await client.invalidateQueries({ queryKey: ["result", room.invite_code] });
      if (current()) await client.invalidateQueries({ queryKey: ["room", room.invite_code] });
    },
    onError: async error => {
      if (!current() || !(error instanceof ApiError)) return;
      if ([401, 403, 404].includes(error.status)) onAccessDenied(error);
      else if (error.status === 409) await reload();
    },
  });
  useEffect(() => {
    const error = [primary.error, pages.error].find(value => value instanceof ApiError && [401, 403, 404].includes(value.status));
    if (current() && error instanceof ApiError && [401, 403, 404].includes(error.status)) onAccessDenied(error);
    // Stale pages discard the complete paging/selection session before refreshing.
    else if (current() && pages.error instanceof ApiError && pages.error.status === 409) void reload();
  }, [primary.error, pages.error, current, onAccessDenied, reload]);
  if (primary.isPending) return <p role="status">추천 시간을 불러오고 있어요.</p>;
  if (!primary.data || (primary.error instanceof ApiError && primary.error.status === 409)) return <div className="alert error" role="alert"><p>{errorMessage(primary.error)}</p><button className="button secondary" onClick={() => void reload()}>다시 시도</button></div>;
  if (primary.data.protocol !== RECOMMENDATION_PROTOCOL) return <div className="center-state glass-card"><h2>추천 화면 업데이트가 필요해요</h2><p>새로고침해 최신 화면을 확인해 주세요.</p></div>;
  if (!compatible(primary.data)) return <div className="center-state glass-card"><h2>최신 추천 시간을 다시 확인해 주세요</h2><button className="button secondary" onClick={() => void reload()}>다시 시도</button></div>;
  const seen = new Set(primary.data.options.map(option => option.option_id));
  const alternatives = (pages.data?.pages ?? []).flatMap(page => page.options).filter(option => { if (seen.has(option.option_id)) return false; seen.add(option.option_id); return true; });
  const lastPage = pages.data?.pages.at(-1);
  return <section className="results-section">
    <div className="section-heading centered"><h2>{primary.data.options.length ? "함께할 수 있는 추천 시간이에요" : "선택할 수 있는 추천 시간이 없어요"}</h2><p>가능한 범위를 확인한 뒤 실제 시작·종료 시간을 선택해 주세요.</p></div>
    {primary.isError && <div className="alert warning" role="status"><p>추천 시간을 갱신하지 못했어요. 마지막으로 확인한 추천과 입력을 유지했어요.</p><p>{errorMessage(primary.error)}</p><button className="button secondary" disabled={primary.isFetching} onClick={() => void primary.refetch()}>추천 시간 다시 확인</button></div>}
    {primary.data.quality === "PARTIAL" && <div className="alert warning" role="status">일부 입력이 반영되지 않아 반영 가능한 조건으로 만든 결과예요.</div>}
    <RecommendationChoices contextKey={JSON.stringify([...key, generation])} options={primary.data.options.map((option, index) => presentation(option, index + 1))} alternatives={alternatives.map((option, index) => presentation(option, index + 1))} timeZone={room.time_zone_id} canConfirm={room.viewer.role === "HOST" && !!room.capabilities?.can_confirm && !!room.analysis_id} pending={confirm.isPending} onConfirm={async selection => { await confirm.mutateAsync(selection); }} hasMore={lastPage ? lastPage.next_cursor !== null : primary.data.has_alternatives} loadingMore={pages.isFetching} onLoadMore={async () => { await pages.fetchNextPage(); }} />
    {confirm.isError && <div className="alert error" role="alert">{errorMessage(confirm.error)}</div>}
    {pages.isError && <div className="alert error" role="alert">{errorMessage(pages.error)}</div>}
  </section>;
}
