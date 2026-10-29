import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarRange, Clock3, Link2, LockKeyhole, MessageSquare, Sparkles, Users } from "lucide-react";
import { api, ApiError, errorMessage } from "../api/client";
import type { MeetingMode } from "../api/types";
import { createRoomBody, createRoomSchema, defaultSearchDates, type CreateRoomValues } from "../utils/createRoom";
import { LandingStory } from "../components/LandingStory";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { LoginGate } from "../auth/AccountViews";
import { useAccountSession } from "../auth/useAccount";

const MODE_OPTIONS: { value: MeetingMode; label: string; detail: string }[] = [
  { value: "EITHER", label: "상관없음", detail: "대면·비대면 모두" },
  { value: "IN_PERSON", label: "대면", detail: "만날 장소도 함께 조율" },
  { value: "REMOTE", label: "비대면", detail: "온라인으로 진행" },
];

export default function LandingPage({ creating = false }: { creating?: boolean }) {
  const accountSession = useAccountSession();
  const [step, setStep] = useState(1);
  const [now, setNow] = useState(() => new Date());
  const heading = useRef<HTMLHeadingElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const creatingRoom = useRef(false);
  const form = useForm<CreateRoomValues>({
    resolver: zodResolver(createRoomSchema),
    defaultValues: { hostName: accountSession?.account.displayName ?? "", purpose: "", meetingMode: "EITHER", customSearch: false, searchStart: "", searchEnd: "", useExpected: true, expectedParticipants: "4", useDeadline: false, deadline: "", manualOnly: false },
  });
  const mutation = useMutation({ mutationFn: api.createRoom });
  const creationUncertain = !(mutation.error instanceof ApiError) || mutation.error.status >= 500 || mutation.error.status === 408;
  const values = form.watch();
  const defaultDates = defaultSearchDates(now);
  const count = Number(values.expectedParticipants);
  const expectedLabel = Number.isInteger(count) && count >= 2 && count <= 50 ? `${count}명` : "목표 인원";
  useEffect(() => {
    if (!creating) return;
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [creating]);
  useEffect(() => { if (step === 2) heading.current?.focus(); }, [step]);

  const changePeriod = () => {
    if (!values.customSearch) {
      const dates = defaultSearchDates();
      form.setValue("searchStart", dates.start);
      form.setValue("searchEnd", dates.last);
    }
    form.setValue("customSearch", !values.customSearch);
    form.clearErrors(["searchStart", "searchEnd"]);
  };

  const next = async () => {
    if (await form.trigger(["hostName", "purpose", "meetingMode", "searchStart", "searchEnd"])) setStep(2);
  };
  const submit = form.handleSubmit((value) => {
    if (creatingRoom.current) return;
    creatingRoom.current = true;
    mutation.mutate(createRoomBody(value), {
      onSuccess: (room) => {
        queryClient.setQueryData(["room", room.invite_code], room);
        navigate(`/rooms/${room.invite_code}`, { replace: true });
      },
      onSettled: () => { creatingRoom.current = false; },
    });
  });

  if (!creating) return (
    <div className="landing page-width">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="hero-kicker">함께할 시간을 찾는 더 편한 방법</p>
          <h1 id="hero-title"><span className="hero-line">조건만 말하세요,</span><span className="hero-line">함께할 시간을 <span className="hero-accent">찾아요.</span></span></h1>
          <p className="hero-description">각자의 시간·장소 조건을 비공개로 모아<br className="hero-break" /> 함께할 수 있는 시간을 제안해요.</p>
          <div className="hero-actions">
            <Button className="hero-cta" onClick={() => navigate("/create")}>모임 만들기 <ArrowRight size={18} aria-hidden="true" /></Button>
            <a className="button secondary hero-guide" href="#how-it-works">이용 방법 보기</a>
          </div>
          <p className="hero-note"><LockKeyhole size={14} aria-hidden="true" /> 초대받은 참여자는 로그인 없이 참여할 수 있어요.</p>
        </div>
        <aside className="hero-example" aria-label="자연어 조건 입력 예시">
          <div className="example-heading"><span><MessageSquare size={16} aria-hidden="true" /> 내 조건 입력</span><span className="example-label">예시</span></div>
          <blockquote>“화요일이나 목요일 저녁에 가능해요.<br />봉천역 근처면 좋겠어요.”</blockquote>
          <div className="example-tags" aria-hidden="true"><span>시간 조건</span><span>장소 조건</span></div>
          <div className="example-divider" />
          <p><LockKeyhole size={16} aria-hidden="true" /><span>다른 참여자에게는 원문을 공개하지 않아요.</span></p>
          <small>주최자는 분석에 반영되지 않은 조건을 확인할 수 있어요.</small>
        </aside>
      </section>
      <div className="landing-details" id="how-it-works" tabIndex={-1}>
        <div className="landing-intro">
          <p className="section-kicker">말하기부터 약속까지</p>
          <h2>일정 조율을 단순하게.</h2>
          <p>각자의 조건을 모으고, 가능한 시간을 함께 살펴보세요.</p>
        </div>
        <LandingStory />
        <section className="how-card">
          <h2>링크 하나로 시작하는 일정 조율</h2>
          <div><How number="1" icon={<Link2 />} title="방 생성 & 공유" /><How number="2" icon={<CalendarRange />} title="각자 조건 제출" /><How number="3" icon={<Sparkles />} title="시간 선택 & 확정" /></div>
        </section>
      </div>
    </div>
  );

  if (!accountSession) return <LoginGate returnTo="/create" />;

  return (
    <div className="form-page page-width narrow">
      <Card className="create-card">
        <div className="progress-head"><span>Step {step} of 2</span><button className="text-button" disabled={mutation.isPending} onClick={() => navigate("/")}>취소</button></div>
        <div className="progress-track"><div style={{ width: `${step * 50}%` }} /></div>
        {step === 1 ? (
          <div className="form-step">
            <div className="section-heading"><h1>모임 기본 정보</h1><p>참여자들이 링크에서 확인하게 될 정보예요.</p></div>
            <p className="create-hint">{accountSession.account.displayName} 님의 모임으로 만들어져요.</p>
            <Field label="모임 목적 / 이름" error={form.formState.errors.purpose?.message}><input autoFocus maxLength={500} placeholder="예: 프로젝트 킥오프 미팅" {...form.register("purpose")} /></Field>
            <fieldset className="field"><legend>선호 모임 방식</legend><div className="create-choice mode-choices">{MODE_OPTIONS.map((option) => <label key={option.value}><input type="radio" value={option.value} {...form.register("meetingMode")} /><span>{option.label}</span></label>)}</div><p className="create-hint">{MODE_OPTIONS.find(option => option.value === values.meetingMode)?.detail}</p></fieldset>
            <fieldset className="field search-period"><legend>후보 탐색 기간</legend>
              {!values.customSearch && <div className="period-summary"><strong>{defaultDates.start} ~ {defaultDates.last}</strong><p className="create-hint">오늘부터 14일 · 마지막 날 포함 · 한국 시간</p></div>}
              <button type="button" className="text-button period-toggle" aria-expanded={values.customSearch} aria-controls="search-dates" onClick={changePeriod}>{values.customSearch ? "기본 14일로 되돌리기" : "기간 변경"}</button>
              {values.customSearch && <div id="search-dates"><div className="two-columns"><label>시작일<input type="date" aria-invalid={Boolean(form.formState.errors.searchEnd)} aria-describedby="search-date-help search-date-error" {...form.register("searchStart")} /></label><label>마지막 날 (포함)<input type="date" aria-invalid={Boolean(form.formState.errors.searchEnd)} aria-describedby="search-date-help search-date-error" {...form.register("searchEnd")} /></label></div><p id="search-date-help" className="create-hint">마지막 날을 포함해 최대 31일 · 한국 시간</p><ErrorText id="search-date-error" text={form.formState.errors.searchEnd?.message} /></div>}
            </fieldset>
            <div className="actions end"><Button onClick={next}>다음 단계 <ArrowRight size={18} aria-hidden="true" /></Button></div>
          </div>
        ) : (
          <form className="form-step" onSubmit={submit}>
            <div className="section-heading"><h1 ref={heading} tabIndex={-1}>언제 입력을 마감할까요?</h1><p>마감 방식을 선택해 주세요. 내 시간·장소 조건은 방을 만든 뒤 입력해요.</p></div>
            <fieldset className="field" disabled={mutation.isPending}><legend>입력 마감 방식</legend><div className="create-choice"><label><input type="radio" name="closure-mode" checked={!values.manualOnly} onChange={() => { form.setValue("manualOnly", false); form.clearErrors(["manualOnly", "expectedParticipants", "deadline"]); }} /><span>자동 마감</span></label><label><input type="radio" name="closure-mode" checked={values.manualOnly} onChange={() => { form.setValue("manualOnly", true); form.clearErrors(["manualOnly", "expectedParticipants", "deadline"]); }} /><span>직접 마감</span></label></div></fieldset>
            {!values.manualOnly && <fieldset className="field automatic-policies" disabled={mutation.isPending}><legend>자동 마감 조건 <small>하나 이상 선택</small></legend>
              <Policy icon={<Users />} checked={values.useExpected} title="목표 인원이 모두 제출하면" detail="주최자를 포함한 제출 인원 기준" onChange={checked => form.setValue("useExpected", checked)}>{values.useExpected && <Field label="예상 참여 인원" error={form.formState.errors.expectedParticipants?.message}><input type="number" min={2} max={50} step={1} aria-invalid={Boolean(form.formState.errors.expectedParticipants)} {...form.register("expectedParticipants")} /></Field>}</Policy>
              <Policy icon={<Clock3 />} checked={values.useDeadline} title="정해진 시간이 되면" detail="한국 시간 기준" onChange={checked => form.setValue("useDeadline", checked)}>{values.useDeadline && <Field label="제출 마감 (한국 시간)" error={form.formState.errors.deadline?.message}><input type="datetime-local" aria-invalid={Boolean(form.formState.errors.deadline)} {...form.register("deadline")} /></Field>}</Policy>
              <ErrorText text={form.formState.errors.manualOnly?.message} />
            </fieldset>}
            <div className="closure-summary" role="status"><strong>적용되는 마감</strong><p>{values.manualOnly ? "자동 마감 없이 주최자가 직접 마감해요." : values.useExpected && values.useDeadline ? `주최자를 포함해 ${expectedLabel} 제출 또는 지정 시각 중 먼저 충족되면 마감해요.` : values.useExpected ? `주최자를 포함한 ${expectedLabel}이 모두 제출하면 마감해요.` : values.useDeadline ? "지정 시각이 되면 마감해요." : "자동 마감 조건을 선택해 주세요."}{!values.manualOnly && values.useDeadline && values.deadline && ` (${values.deadline.replace("T", " ")} 한국 시간)`}</p></div>
            {mutation.isError && <div className="alert error" role="alert"><p>{creationUncertain ? "방 생성 결과를 확인하지 못했어요. 이미 만들어졌을 수 있어요. 다시 시도하면 새 모임이 추가될 수 있어요." : "방 생성 요청이 거절됐어요."}</p>{errorMessage(mutation.error)}</div>}
            <div className="actions between"><Button variant="secondary" disabled={mutation.isPending} onClick={() => { setStep(1); window.setTimeout(() => form.setFocus("purpose"), 0); }}><ArrowLeft size={18} aria-hidden="true" /> 이전</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "방 만드는 중…" : "방 만들기"}</Button></div>
          </form>
        )}
      </Card>
    </div>
  );
}

function How({ number, icon, title }: { number: string; icon: React.ReactNode; title: string }) { return <div className="how-step"><b>{number}</b><span>{icon}</span><strong>{title}</strong></div>; }
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}<ErrorText text={error} /></label>; }
function ErrorText({ text, id }: { text?: string; id?: string }) { return text ? <small id={id} className="field-error" role="alert">{text}</small> : null; }
function Policy({ icon, checked, title, detail, onChange, children }: { icon: React.ReactNode; checked: boolean; title: string; detail: string; onChange: (value: boolean) => void; children?: React.ReactNode }) { return <div className={`policy-card ${checked ? "selected" : ""}`}><label><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="policy-icon">{icon}</span><span><strong>{title}</strong><small>{detail}</small></span></label>{children && <div className="policy-content">{children}</div>}</div>; }
