import { useEffect, useRef, useState } from "react";

export type GuestIdentity = { kind: "guest" } | { kind: "member"; displayName: string };
export type GuestRecord = { participantId: string; displayName: string };
export type GuestParticipationProps = {
  roomKey: string;
  submissionProtocol?: "PRE_SUBMIT_V1" | "LEGACY";
  identity: GuestIdentity;
  records: readonly GuestRecord[];
  editable: boolean;
  showJoin?: boolean;
  onJoin: (input: { displayName?: string; password?: string }) => Promise<void>;
  onReaccess: (input: { participantId: string; password?: string }) => Promise<"VERIFIED_GUEST" | "REPLACE_ONLY">;
  onReplace: (input: { participantId: string; rawText: string }) => Promise<void>;
  onVerified: () => void;
};

/** roomKey must include the authenticated viewer epoch as well as the room ID. */
export default function GuestParticipation(props: GuestParticipationProps) {
  const identityKey = props.identity.kind === "member" ? `member:${props.identity.displayName}` : "guest";
  return <ParticipationForm key={`${props.roomKey}:${identityKey}`} {...props} />;
}

function ParticipationForm(props: GuestParticipationProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [recordId, setRecordId] = useState("");
  const [recordPassword, setRecordPassword] = useState("");
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const current = useRef(props);
  current.current = props;
  useEffect(() => {
    const activeGeneration = generation;
    mounted.current = true;
    return () => { mounted.current = false; activeGeneration.current++; };
  }, []);
  const isMember = props.identity.kind === "member";
  const selected = props.records.some(record => record.participantId === recordId);
  const nameLength = Array.from(name.trim()).length;
  const text = rawText.trim();
  const validText = Array.from(text).length >= 1 && Array.from(text).length <= 500;
  const validPassword = (value: string) => Array.from(value).length <= 128;

  const run = async (operation: string, action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    const attempt = generation.current;
    setBusy(operation); setError(null); setSaved(false);
    try {
      await action();
    } catch {
      if (mounted.current && attempt === generation.current) setError("요청을 확인하지 못했어요. 입력과 현재 모임 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      if (mounted.current && attempt === generation.current) {
        setPassword(""); setRecordPassword(""); setBusy(null); pending.current = false;
      }
    }
  };

  const join = () => {
    if (!props.editable || (!isMember && (nameLength < 1 || nameLength > 50 || !validPassword(password)))) return;
    void run("join", () => props.onJoin(isMember ? {} : { displayName: name.trim(), ...(password ? { password } : {}) }));
  };
  const reaccess = () => {
    if (!selected || !validPassword(recordPassword)) return;
    const attempt = generation.current;
    const requestedId = recordId;
    void run("access", async () => {
      const result = await props.onReaccess({ participantId: requestedId, ...(recordPassword ? { password: recordPassword } : {}) });
      if (!mounted.current || attempt !== generation.current || !current.current.records.some(record => record.participantId === requestedId)) return;
      if (result === "VERIFIED_GUEST") {
        props.onVerified();
      } else if (result === "REPLACE_ONLY") {
        setRawText(""); setReplaceId(requestedId);
      } else {
        throw new Error("Unknown access scope");
      }
    });
  };
  const replace = () => {
    if (!props.editable || replaceId !== recordId || !selected || !validText) return;
    const attempt = generation.current;
    void run("replace", async () => {
      await props.onReplace({ participantId: recordId, rawText: text });
      if (!mounted.current || attempt !== generation.current) return;
      setRawText(""); setReplaceId(null); setSaved(true);
    });
  };

  return <section className="glass-card join-card">
    <h2>{props.showJoin === false ? "기존 참여 기록에 다시 접근" : isMember ? "계정으로 참여해 주세요" : "이름으로 참여해 주세요"}</h2>
    {isMember ? <p>{props.identity.kind === "member" && props.identity.displayName} 계정으로 참여해요.</p> : <>
      <p id="guest-edit-warning">암호를 설정하지 않으면 다른 기기에서도 누구나 이 기록의 조건을 대체할 수 있어 수정이 보호되지 않아요.</p>
      <p id="guest-read-warning">다른 기기의 암호 없는 기록은 기존 원문을 조회하지 않고 새 조건으로 대체해요.</p>
    </>}
    {props.showJoin !== false && <form onSubmit={event => { event.preventDefault(); join(); }}>
      {!isMember && <>
        <label className="field"><span>이름</span><input required value={name} onChange={event => setName(event.target.value)} autoComplete="off" /></label>
        <label className="field"><span>참여 암호 (선택)</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} aria-describedby="guest-edit-warning guest-read-warning" autoComplete="new-password" /></label>
        {!validPassword(password) && <p>암호는 128자 이하로 입력해 주세요.</p>}
      </>}
      <button className="button primary" disabled={!props.editable || busy !== null || (!isMember && (nameLength < 1 || nameLength > 50 || !validPassword(password)))}>{isMember ? "계정으로 참여" : "참여하기"}</button>
    </form>}
    {!isMember && <div>
      <h3>기존 기록에 다시 접근</h3>
      <p>같은 이름도 서로 다른 기록이에요. 기록 번호를 확인해 선택해 주세요. 암호를 잊은 기록은 초기화하거나 주최자를 통해 복구할 수 없어요.</p>
      <label className="field"><span>다시 접근할 참여 기록</span><select value={recordId} disabled={busy !== null} onChange={event => {
        generation.current++; pending.current = false; setBusy(null); setRecordId(event.target.value); setRecordPassword(""); setReplaceId(null); setRawText(""); setError(null); setSaved(false);
      }}><option value="">기록을 선택해 주세요</option>{props.records.map(record => <option key={record.participantId} value={record.participantId}>{record.displayName} · {record.participantId}</option>)}</select></label>
      <label className="field"><span>기록 암호 (선택)</span><input type="password" value={recordPassword} onChange={event => setRecordPassword(event.target.value)} autoComplete="current-password" /></label>
      <button className="button secondary" disabled={!selected || busy !== null || !validPassword(recordPassword)} onClick={reaccess}>기록에 다시 접근</button>
      {replaceId === recordId && selected && <form onSubmit={event => { event.preventDefault(); replace(); }}>
        <p>기존 조건을 새 입력으로 대체해요. 이전 원문은 불러오지 않아요.</p>
        <label className="field"><span>새 참여 조건</span><textarea value={rawText} onChange={event => setRawText(event.target.value)} disabled={!props.editable || busy !== null} /></label>
        <p>{Array.from(text).length}/500</p>
        <button className="button primary" disabled={!props.editable || busy !== null || !validText}>기존 조건 대체하기</button>
      </form>}
    </div>}
    {!props.editable && <p role="status">입력이 마감되었거나 확정된 모임이에요. 현재는 참여하거나 조건을 대체할 수 없어요.</p>}
    {saved && <p role="status">{props.submissionProtocol === "PRE_SUBMIT_V1" ? "원문만 저장됐어요. 확인이 끝난 뒤 결과에 반영될 수 있어요. 기존 원문 조회 권한은 부여되지 않으며 질문·답변도 조회할 수 없어요." : "새 조건으로 대체했어요. 기존 원문 조회 권한은 부여되지 않아요."}</p>}
    {error && <p className="alert error" role="alert">{error}</p>}
  </section>;
}
