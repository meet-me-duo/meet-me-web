import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { RecoveryRoom } from "../api/recovery";
import { getSessionVersion } from "../auth/session";
import { useAccountSession } from "../auth/useAccount";
import GuestParticipation from "./GuestParticipation";

export type GuestAccessPanelProps = {
  room: RecoveryRoom;
  roomKey: string;
  onJoined: (room: RecoveryRoom) => void;
  onVerified: () => Promise<void>;
};

export default function GuestAccessPanel(props: GuestAccessPanelProps) {
  return <GuestAccessForm key={props.roomKey} {...props} />;
}

function GuestAccessForm({ room, roomKey, onJoined, onVerified }: GuestAccessPanelProps) {
  const account = useAccountSession();
  const mounted = useRef(true);
  const currentKey = useRef(roomKey);
  currentKey.current = roomKey;
  const [verificationError, setVerificationError] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const records = useQuery({
    queryKey: ["guest-records", room.invite_code, roomKey],
    queryFn: ({ signal }) => api.getGuestRecords(room.invite_code, signal),
    enabled: !account,
    retry: false,
  });
  const isCurrent = (startedVersion: number) => mounted.current && currentKey.current === roomKey && getSessionVersion() === startedVersion;
  const editable = room.public_status === "COLLECTING" && room.collection_status === "COLLECTING";
  return <>
    <GuestParticipation
      roomKey={roomKey}
      submissionProtocol={room.submission_protocol}
      identity={account ? { kind: "member", displayName: account.account.displayName } : { kind: "guest" }}
      records={(records.data?.records ?? []).map(record => ({ participantId: record.participant_id, displayName: record.display_name }))}
      editable={editable}
      showJoin={editable}
      onJoin={async input => {
        const startedVersion = getSessionVersion();
        const joined = await api.joinRoom(room.invite_code, input.displayName, input.password);
        if (!isCurrent(startedVersion)) return;
        onJoined(joined);
      }}
      onReaccess={async input => {
        const startedVersion = getSessionVersion();
        setVerificationError(false);
        const result = await api.reaccessGuest(room.invite_code, { participant_id: input.participantId, ...(input.password !== undefined ? { password: input.password } : {}) });
        if (!isCurrent(startedVersion) || result.participant_id !== input.participantId || !["VERIFIED_GUEST", "REPLACE_ONLY"].includes(result.level)) throw new Error("Guest access could not be verified");
        return result.level;
      }}
      onReplace={async input => {
        const startedVersion = getSessionVersion();
        const result = await api.replaceGuestSubmission(room.invite_code, input.participantId, { raw_text: input.rawText });
        if (!isCurrent(startedVersion) || result.replaced !== true) throw new Error("Guest replacement could not be verified");
      }}
      onVerified={() => {
        const startedVersion = getSessionVersion();
        if (!isCurrent(startedVersion)) return;
        void onVerified().catch(() => { if (isCurrent(startedVersion)) setVerificationError(true); });
      }}
    />
    {records.isError && !account && <div className="alert error" role="alert">참여 기록을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.<button className="button secondary" onClick={() => void records.refetch()} disabled={records.isFetching}>기록 다시 확인</button></div>}
    {verificationError && <div className="alert error" role="alert">접근 후 모임 상태를 확인하지 못했어요. 현재 모임에서 다시 시도해 주세요.</div>}
  </>;
}
