import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarRange, Clock3, Link2, Sparkles, Users } from "lucide-react";
import { api, errorMessage } from "../api/client";
import type { MeetingMode } from "../api/types";
import { createRoomBody, createRoomSchema, defaultSearchDates, type CreateRoomValues } from "../utils/createRoom";
import { LandingStory } from "../components/LandingStory";
import { RecentRooms } from "../components/RecentRooms";
import { useRecentRooms } from "../hooks/useRecentRooms";
import { rememberRoom } from "../utils/recentRooms";

const MODE_OPTIONS: { value: MeetingMode; label: string; detail: string }[] = [
  { value: "EITHER", label: "상관없음", detail: "대면·비대면 모두" },
  { value: "IN_PERSON", label: "대면", detail: "만날 장소도 함께 조율" },
  { value: "REMOTE", label: "비대면", detail: "온라인으로 진행" },
];

export default function LandingPage({ creating = false }: { creating?: boolean }) {
  const [step, setStep] = useState(1);
  const [now, setNow] = useState(() => new Date());
  const heading = useRef<HTMLHeadingElement>(null);
  const navigate = useNavigate();
  const recent = useRecentRooms();
  const form = useForm<CreateRoomValues>({
    resolver: zodResolver(createRoomSchema),
    defaultValues: { hostName: "", purpose: "", meetingMode: "EITHER", customSearch: false, searchStart: "", searchEnd: "", useExpected: true, expectedParticipants: "4", useDeadline: false, deadline: "", manualOnly: false },
  });
  const mutation = useMutation({ mutationFn: api.createRoom });
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
    mutation.mutate(createRoomBody(value), {
      onSuccess: (room) => { rememberRoom(room); navigate(`/rooms/${room.invite_code}`, { replace: true }); },
    });
  });

  if (!creating) return (
    <div className="landing page-width">
      <section className="hero">
        <h1><span className="hero-line">조건만 말하세요,</span><span className="hero-line">결정은 <span className="hero-accent">Meet me</span>가 할게요</span></h1>
        <button className="button primary hero-cta" onClick={() => navigate("/create")}>모임 만들기 <ArrowRight size={20} /></button>
        {recent.rooms.length > 0 && <a className="recent-shortcut" href="#recent-rooms">이 기기의 최근 모임 {recent.rooms.length}개 보기</a>}
      </section>
      <RecentRooms recent={recent} />
      <div className="landing-details">
        <div className="landing-intro">
          <div className="eyebrow"><Sparkles size={16} /> 자연어 조건 입력 & 스마트 조율</div>
          <p><span className="landing-sentence">일정 색칠하기와 눈치게임은 이제 그만.</span><span className="landing-sentence">각자의 조건을 비공개로 모아 최적의 약속 플랜을 제안해요.</span></p>
        </div>
        <LandingStory />
        <section className="how-card">
          <h2>링크 하나로 시작하는 일정 조율</h2>
          <div><How number="1" icon={<Link2 />} title="방 생성 & 공유" /><How number="2" icon={<CalendarRange />} title="각자 조건 제출" /><How number="3" icon={<Sparkles />} title="플랜 선택 & 확정" /></div>
        </section>
      </div>
    </div>
  );

  return (
    <div className="form-page page-width narrow">
      <div className="glass-card create-card">
        <div className="progress-head"><span>Step {step} of 2</span><button className="text-button" disabled={mutation.isPending} onClick={() => navigate("/")}>취소</button></div>
        <div className="progress-track"><div style={{ width: `${step * 50}%` }} /></div>
        {step === 1 ? (
          <div className="form-step">
            <div className="section-heading"><h1>모임 기본 정보</h1><p>참여자들이 링크에서 확인하게 될 정보예요.</p></div>
            <Field label="주최자 이름" error={form.formState.errors.hostName?.message}><input autoFocus maxLength={50} placeholder="예: 김민수" {...form.register("hostName")} /></Field>
            <Field label="모임 목적 / 이름" error={form.formState.errors.purpose?.message}><input maxLength={500} placeholder="예: 프로젝트 킥오프 미팅" {...form.register("purpose")} /></Field>
            <fieldset className="field"><legend>선호 모임 방식</legend><div className="create-choice mode-choices">{MODE_OPTIONS.map((option) => <label key={option.value}><input type="radio" value={option.value} {...form.register("meetingMode")} /><span>{option.label}</span></label>)}</div><p className="create-hint">{MODE_OPTIONS.find(option => option.value === values.meetingMode)?.detail}</p></fieldset>
            <fieldset className="field search-period"><legend>후보 탐색 기간</legend>
              {!values.customSearch && <div className="period-summary"><strong>{defaultDates.start} ~ {defaultDates.last}</strong><p className="create-hint">오늘부터 14일 · 마지막 날 포함 · 한국 시간</p></div>}
              <button type="button" className="text-button period-toggle" aria-expanded={values.customSearch} aria-controls="search-dates" onClick={changePeriod}>{values.customSearch ? "기본 14일로 되돌리기" : "기간 변경"}</button>
              {values.customSearch && <div id="search-dates"><div className="two-columns"><label>시작일<input type="date" aria-invalid={Boolean(form.formState.errors.searchEnd)} aria-describedby="search-date-help search-date-error" {...form.register("searchStart")} /></label><label>마지막 날 (포함)<input type="date" aria-invalid={Boolean(form.formState.errors.searchEnd)} aria-describedby="search-date-help search-date-error" {...form.register("searchEnd")} /></label></div><p id="search-date-help" className="create-hint">마지막 날을 포함해 최대 31일 · 한국 시간</p><ErrorText id="search-date-error" text={form.formState.errors.searchEnd?.message} /></div>}
            </fieldset>
            <div className="actions end"><button type="button" className="button primary" onClick={next}>다음 단계 <ArrowRight size={18} /></button></div>
          </div>
        ) : (
          <form className="form-step" onSubmit={submit}>
            <div className="section-heading"><h1 ref={heading} tabIndex={-1}>언제 입력을 마감할까요?</h1><p>마감 방식을 선택해 주세요.</p></div>
            <fieldset className="field" disabled={mutation.isPending}><legend>입력 마감 방식</legend><div className="create-choice"><label><input type="radio" name="closure-mode" checked={!values.manualOnly} onChange={() => { form.setValue("manualOnly", false); form.clearErrors(["manualOnly", "expectedParticipants", "deadline"]); }} /><span>자동 마감</span></label><label><input type="radio" name="closure-mode" checked={values.manualOnly} onChange={() => { form.setValue("manualOnly", true); form.clearErrors(["manualOnly", "expectedParticipants", "deadline"]); }} /><span>직접 마감</span></label></div></fieldset>
            {!values.manualOnly && <fieldset className="field automatic-policies" disabled={mutation.isPending}><legend>자동 마감 조건 <small>하나 이상 선택</small></legend>
              <Policy icon={<Users />} checked={values.useExpected} title="목표 인원이 모두 제출하면" detail="주최자를 포함한 제출 인원 기준" onChange={checked => form.setValue("useExpected", checked)}>{values.useExpected && <Field label="예상 참여 인원" error={form.formState.errors.expectedParticipants?.message}><input type="number" min={2} max={50} step={1} aria-invalid={Boolean(form.formState.errors.expectedParticipants)} {...form.register("expectedParticipants")} /></Field>}</Policy>
              <Policy icon={<Clock3 />} checked={values.useDeadline} title="정해진 시간이 되면" detail="한국 시간 기준" onChange={checked => form.setValue("useDeadline", checked)}>{values.useDeadline && <Field label="제출 마감 (한국 시간)" error={form.formState.errors.deadline?.message}><input type="datetime-local" aria-invalid={Boolean(form.formState.errors.deadline)} {...form.register("deadline")} /></Field>}</Policy>
              <ErrorText text={form.formState.errors.manualOnly?.message} />
            </fieldset>}
            <div className="closure-summary" role="status"><strong>적용되는 마감</strong><p>{values.manualOnly ? "자동 마감 없이 주최자가 직접 마감해요." : values.useExpected && values.useDeadline ? `주최자를 포함해 ${expectedLabel} 제출 또는 지정 시각 중 먼저 충족되면 마감해요.` : values.useExpected ? `주최자를 포함한 ${expectedLabel}이 모두 제출하면 마감해요.` : values.useDeadline ? "지정 시각이 되면 마감해요." : "자동 마감 조건을 선택해 주세요."}{!values.manualOnly && values.useDeadline && values.deadline && ` (${values.deadline.replace("T", " ")} 한국 시간)`}</p></div>
            {mutation.isError && <div className="alert error" role="alert">{errorMessage(mutation.error)}</div>}
            <div className="actions between"><button type="button" className="button secondary" disabled={mutation.isPending} onClick={() => { setStep(1); window.setTimeout(() => form.setFocus("hostName"), 0); }}><ArrowLeft size={18} /> 이전</button><button className="button primary" disabled={mutation.isPending}>{mutation.isPending ? "방 만드는 중…" : "방 만들기"}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

function How({ number, icon, title }: { number: string; icon: React.ReactNode; title: string }) { return <div className="how-step"><b>{number}</b><span>{icon}</span><strong>{title}</strong></div>; }
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}<ErrorText text={error} /></label>; }
function ErrorText({ text, id }: { text?: string; id?: string }) { return text ? <small id={id} className="field-error" role="alert">{text}</small> : null; }
function Policy({ icon, checked, title, detail, onChange, children }: { icon: React.ReactNode; checked: boolean; title: string; detail: string; onChange: (value: boolean) => void; children?: React.ReactNode }) { return <div className={`policy-card ${checked ? "selected" : ""}`}><label><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="policy-icon">{icon}</span><span><strong>{title}</strong><small>{detail}</small></span></label>{children && <div className="policy-content">{children}</div>}</div>; }
