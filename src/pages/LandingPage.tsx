import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarRange, Clock3, Layers3, Link2, MessageSquare, ShieldCheck, Sparkles, Users } from "lucide-react";
import { z } from "zod";
import { api, errorMessage } from "../api/client";
import type { CreateRoomBody, MeetingMode } from "../api/types";
import { localSeoulToIso } from "../utils/time";

const schema = z.object({
  hostName: z.string().trim().min(1, "이름을 입력해 주세요.").max(50, "50자 이하로 입력해 주세요."),
  purpose: z.string().trim().min(1, "모임 목적을 입력해 주세요.").max(500, "500자 이하로 입력해 주세요."),
  meetingMode: z.enum(["EITHER", "IN_PERSON", "REMOTE"]),
  searchStart: z.string(),
  searchEnd: z.string(),
  useExpected: z.boolean(),
  expectedParticipants: z.string(),
  useDeadline: z.boolean(),
  deadline: z.string(),
  manualOnly: z.boolean(),
}).superRefine((value, context) => {
  if (Boolean(value.searchStart) !== Boolean(value.searchEnd)) context.addIssue({ code: "custom", path: ["searchEnd"], message: "시작일과 종료일을 함께 선택해 주세요." });
  if (value.searchStart && value.searchEnd) {
    const days = (new Date(value.searchEnd).getTime() - new Date(value.searchStart).getTime()) / 86_400_000;
    if (days < 1 || days > 31) context.addIssue({ code: "custom", path: ["searchEnd"], message: "탐색 기간은 1일 이상 31일 이하여야 해요." });
  }
  if (!value.useExpected && !value.useDeadline && !value.manualOnly) context.addIssue({ code: "custom", path: ["manualOnly"], message: "마감 방식을 하나 이상 선택해 주세요." });
  if (value.manualOnly && (value.useExpected || value.useDeadline)) context.addIssue({ code: "custom", path: ["manualOnly"], message: "직접 마감은 자동 마감 방식과 함께 사용할 수 없어요." });
  if (value.useExpected && (Number(value.expectedParticipants) < 2 || Number(value.expectedParticipants) > 50)) context.addIssue({ code: "custom", path: ["expectedParticipants"], message: "2명 이상 50명 이하로 입력해 주세요." });
  if (value.useDeadline && !value.deadline) context.addIssue({ code: "custom", path: ["deadline"], message: "마감 시각을 선택해 주세요." });
  if (value.useDeadline && value.deadline && new Date(`${value.deadline}:00+09:00`).getTime() <= Date.now()) context.addIssue({ code: "custom", path: ["deadline"], message: "현재보다 뒤의 시간을 선택해 주세요." });
});

type FormValues = z.infer<typeof schema>;

const MODE_OPTIONS: { value: MeetingMode; label: string; detail: string }[] = [
  { value: "EITHER", label: "상관없음", detail: "대면·비대면 모두" },
  { value: "IN_PERSON", label: "대면", detail: "만날 장소도 함께 조율" },
  { value: "REMOTE", label: "비대면", detail: "온라인으로 진행" },
];

export default function LandingPage() {
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { hostName: "", purpose: "", meetingMode: "EITHER", searchStart: "", searchEnd: "", useExpected: true, expectedParticipants: "4", useDeadline: false, deadline: "", manualOnly: false },
  });
  const mutation = useMutation({
    mutationFn: api.createRoom,
    onSuccess: (room) => navigate(`/rooms/${room.invite_code}`, { replace: true }),
  });
  const values = form.watch();

  const next = async () => {
    if (await form.trigger(["hostName", "purpose", "meetingMode", "searchStart", "searchEnd"])) setStep(2);
  };
  const submit = form.handleSubmit((value) => {
    const body: CreateRoomBody = {
      host_display_name: value.hostName.trim(),
      purpose: value.purpose.trim(),
      meeting_mode: value.meetingMode,
      expected_participants: value.useExpected ? Number(value.expectedParticipants) : null,
      submission_deadline: value.useDeadline ? localSeoulToIso(value.deadline) : null,
      manual_only: value.manualOnly,
      search_start_date: value.searchStart || null,
      search_end_date: value.searchEnd || null,
    };
    mutation.mutate(body);
  });

  if (!creating) return (
    <div className="landing page-width">
      <section className="hero">
        <div className="eyebrow"><Sparkles size={16} /> 자연어 조건 입력 & 스마트 조율</div>
        <h1>조건만 말하세요,<br />결정은 <span>Meet me</span>가 할게요</h1>
        <p>일정 색칠하기와 눈치게임은 이제 그만.<br />각자의 조건을 비공개로 모아 최적의 약속 플랜을 제안해요.</p>
        <button className="button primary hero-cta" onClick={() => setCreating(true)}>모임 만들기 <ArrowRight size={20} /></button>
      </section>
      <section className="feature-grid" aria-label="Meet me 주요 기능">
        <Feature icon={<MessageSquare />} title="말하듯 조건 작성" description="“화·목 저녁 봉천역 근처”처럼 일상 언어로 편하게 입력하세요." />
        <Feature icon={<ShieldCheck />} title="블라인드 일정 입력" description="서로의 조건은 후보가 나오기 전까지 누구에게도 공개되지 않아요." />
        <Feature icon={<Layers3 />} title="Plan A·B·C 제안" description="복잡한 비교 대신 우선순위가 정해진 후보 중 하나만 고르면 돼요." />
      </section>
      <section className="how-card">
        <h2>링크 하나로 시작하는 일정 조율</h2>
        <div><How number="1" icon={<Link2 />} title="방 생성 & 공유" /><How number="2" icon={<CalendarRange />} title="각자 조건 제출" /><How number="3" icon={<Sparkles />} title="플랜 선택 & 확정" /></div>
      </section>
    </div>
  );

  return (
    <div className="form-page page-width narrow">
      <div className="glass-card create-card">
        <div className="progress-head"><span>Step {step} of 2</span><button className="text-button" onClick={() => { setCreating(false); setStep(1); form.reset(); }}>취소</button></div>
        <div className="progress-track"><div style={{ width: `${step * 50}%` }} /></div>
        {step === 1 ? (
          <div className="form-step">
            <div className="section-heading"><h1>모임 기본 정보를 입력해 주세요</h1><p>참여자들이 링크에서 확인하게 될 정보예요.</p></div>
            <Field label="주최자 이름" error={form.formState.errors.hostName?.message}><input autoFocus maxLength={50} placeholder="예: 김민수" {...form.register("hostName")} /></Field>
            <Field label="모임 목적 / 이름" error={form.formState.errors.purpose?.message}><input maxLength={500} placeholder="예: 프로젝트 킥오프 미팅" {...form.register("purpose")} /></Field>
            <fieldset className="field"><legend>선호 모임 방식</legend><div className="mode-grid">{MODE_OPTIONS.map((option) => <button type="button" key={option.value} className={values.meetingMode === option.value ? "selected" : ""} onClick={() => form.setValue("meetingMode", option.value)}><strong>{option.label}</strong><small>{option.detail}</small></button>)}</div></fieldset>
            <fieldset className="field"><legend>후보 탐색 기간 <small>미선택 시 오늘부터 14일</small></legend><div className="two-columns"><label>시작일<input type="date" {...form.register("searchStart")} /></label><label>종료일(포함하지 않음)<input type="date" {...form.register("searchEnd")} /></label></div><ErrorText text={form.formState.errors.searchEnd?.message} /></fieldset>
            <div className="actions end"><button type="button" className="button primary" onClick={next}>다음 단계 <ArrowRight size={18} /></button></div>
          </div>
        ) : (
          <form className="form-step" onSubmit={submit}>
            <div className="section-heading"><h1>언제 입력을 마감할까요?</h1><p>인원과 시간 방식은 함께 선택할 수 있어요. 직접 마감은 자동 조건 없이 단독으로 사용해요.</p></div>
            <Policy icon={<Users />} checked={values.useExpected} title="목표 인원이 모두 제출하면" detail="주최자를 포함한 제출 인원 기준" onChange={(checked) => { form.setValue("useExpected", checked); if (checked) form.setValue("manualOnly", false); }}>{values.useExpected && <Field label="예상 참여 인원" error={form.formState.errors.expectedParticipants?.message}><input type="number" min={2} max={50} {...form.register("expectedParticipants")} /></Field>}</Policy>
            <Policy icon={<Clock3 />} checked={values.useDeadline} title="정해진 시간이 되면" detail="한국 시간 기준으로 자동 마감" onChange={(checked) => { form.setValue("useDeadline", checked); if (checked) form.setValue("manualOnly", false); }}>{values.useDeadline && <Field label="제출 마감" error={form.formState.errors.deadline?.message}><input type="datetime-local" {...form.register("deadline")} /></Field>}</Policy>
            <Policy icon={<ShieldCheck />} checked={values.manualOnly} title="자동 마감 없이 직접 마감" detail="주최자가 원하는 시점에 마감" onChange={(checked) => { form.setValue("manualOnly", checked); if (checked) { form.setValue("useExpected", false); form.setValue("useDeadline", false); } }} />
            <ErrorText text={form.formState.errors.manualOnly?.message} />
            {mutation.isError && <div className="alert error" role="alert">{errorMessage(mutation.error)}</div>}
            <div className="actions between"><button type="button" className="button secondary" onClick={() => setStep(1)}><ArrowLeft size={18} /> 이전</button><button className="button primary" disabled={mutation.isPending}>{mutation.isPending ? "방 만드는 중…" : "방 만들기"}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

function Feature({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) { return <article className="glass-card feature"><span>{icon}</span><h2>{title}</h2><p>{description}</p></article>; }
function How({ number, icon, title }: { number: string; icon: React.ReactNode; title: string }) { return <div className="how-step"><b>{number}</b><span>{icon}</span><strong>{title}</strong></div>; }
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}<ErrorText text={error} /></label>; }
function ErrorText({ text }: { text?: string }) { return text ? <small className="field-error">{text}</small> : null; }
function Policy({ icon, checked, title, detail, onChange, children }: { icon: React.ReactNode; checked: boolean; title: string; detail: string; onChange: (value: boolean) => void; children?: React.ReactNode }) { return <div className={`policy-card ${checked ? "selected" : ""}`}><label><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="policy-icon">{icon}</span><span><strong>{title}</strong><small>{detail}</small></span></label>{children && <div className="policy-content">{children}</div>}</div>; }
