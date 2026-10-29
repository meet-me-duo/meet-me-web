export function roomLink(inviteCode: string): string {
  return `${window.location.origin}/rooms/${inviteCode}`;
}
