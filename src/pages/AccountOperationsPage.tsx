import { createOperationsApi, OperationsError } from "../api/operations";
import { getAccessToken, getSessionVersion } from "../auth/session";
import { useAccountSession } from "../auth/useAccount";
import OperationsPage from "./OperationsPage";

const api = createOperationsApi(() => {
  try { return getAccessToken(true); }
  catch (error) {
    if (error instanceof Error && error.message === "AUTH_ACCESS_EXPIRED") throw new OperationsError(401);
    throw error;
  }
});

export default function AccountOperationsPage() {
  useAccountSession();
  return <OperationsPage api={api} authRevision={getSessionVersion()} />;
}
