import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, ArrowRight, X } from "lucide-react";
import { forgetRoom, roomLink, type RecentRooms as RecentRoomsState } from "../utils/recentRooms";

export function RecentRooms({ recent }: { recent: RecentRoomsState }) {
  const [message, setMessage] = useState("");
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  if (!recent.rooms.length && !recent.unavailable && !message) return null;

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(roomLink(code));
      setManualCopy(null);
      setMessage("초대 링크를 복사했어요. 링크만으로 주최자 권한이 이전되지는 않아요.");
    } catch {
      setManualCopy(code);
      setMessage("링크를 자동으로 복사하지 못했어요. 아래 링크를 선택해 직접 복사해 주세요.");
    }
  };
  const remove = (code: string) => {
    if (forgetRoom(code)) {
      if (manualCopy === code) setManualCopy(null);
      setMessage("이 브라우저의 목록에서 지웠어요. 실제 모임은 삭제되지 않았어요.");
      heading.current?.focus();
    } else setMessage("목록을 변경하지 못했어요. 이 브라우저의 저장 설정을 확인해 주세요.");
  };

  return <section id="recent-rooms" className="recent-rooms glass-card" aria-labelledby="recent-rooms-title" tabIndex={-1}>
    <h2 id="recent-rooms-title" ref={heading} tabIndex={-1}>이 기기의 최근 모임</h2>
    <p className="recent-note">만들거나 참여한 모임 주소를 이 브라우저에만 보관해요. 최근 연 모임부터 최대 10개, 마지막으로 연 뒤 30일 동안 표시해요.</p>
    <p className="recent-note">시크릿 모드 종료·브라우저 데이터 삭제·다른 기기에서는 기록이나 참여 권한이 이어지지 않을 수 있어요. 주최자 기능은 모임을 만든 브라우저에서 사용할 수 있어요.</p>
    {recent.unavailable && <p className="alert warning">이 브라우저의 목록을 불러오지 못했어요. 보관한 초대 링크로 모임을 열어 주세요.</p>}
    <ul className="recent-list">{recent.rooms.map(room => <li key={room.inviteCode}>
      <div className="recent-room-info"><h3>{room.title || "이름 없는 모임"}</h3><small>최근 열람 {new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(room.lastOpenedAt)}</small></div>
      <div className="recent-actions">
        <Link className="button secondary" to={`/rooms/${room.inviteCode}`} aria-label={`${room.title || "이름 없는 모임"} 다시 열기`}>다시 열기 <ArrowRight size={16} /></Link>
        <button className="button secondary" onClick={() => copy(room.inviteCode)} aria-label={`${room.title || "이름 없는 모임"} 링크 복사`}><Copy size={16} /> 링크 복사</button>
        <button className="button secondary" onClick={() => remove(room.inviteCode)} aria-label={`${room.title || "이름 없는 모임"} 목록에서 지우기`}><X size={16} /> 목록에서 지우기</button>
      </div>
      {manualCopy === room.inviteCode && <label className="field recent-copy"><span>직접 복사할 모임 링크</span><input autoFocus readOnly value={roomLink(room.inviteCode)} onFocus={event => event.currentTarget.select()} /></label>}
    </li>)}</ul>
    <p className="recent-note">목록에서 지우기는 이 브라우저의 기록만 지워요. 실제 모임을 삭제하지 않아요. 보관 기간은 참여 권한의 유효기간을 보장하지 않아요.</p>
    <p role="status" className="recent-message">{message}</p>
  </section>;
}
