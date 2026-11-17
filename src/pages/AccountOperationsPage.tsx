import { createOperationsApi, OperationsError, operationsMessage } from "../api/operations";
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
  const session = useAccountSession();
  if (session?.account.capabilities?.canViewOperations === false) return <p role="alert">{operationsMessage(new OperationsError(403))}</p>;
  return <OperationsPage api={api} authRevision={getSessionVersion()} />;
}
