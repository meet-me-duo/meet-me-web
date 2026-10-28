import { createContext, useContext } from "react";

export const AccountActionsContext = createContext<{
  busy: boolean;
  error: { version: number; message: string } | null;
  logout: (all: boolean, accountId: string) => Promise<void>;
} | null>(null);

export function useAccountActions() {
  const actions = useContext(AccountActionsContext);
  if (!actions) throw new Error("AccountActionsProvider is required");
  return actions;
}
