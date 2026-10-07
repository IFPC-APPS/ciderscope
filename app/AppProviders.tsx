"use client";

import { createContext, useContext, useMemo, useCallback, type ReactNode } from "react";
import { Topbar } from "../components/ui/Topbar";
import { useSenso, type SensoState, type SensoActions } from "../hooks/useSenso";
import { oublierSession, useSession } from "../lib/useSession";

// Contexte d'actions : référence stable, ne se ré-émet jamais après le premier render
// (toutes les actions sont useCallback à deps vides).
type AppActions = SensoActions & { handleLogout: () => void };
const AppActionsContext = createContext<AppActions | null>(null);

// Contexte d'état : ré-émet à chaque changement d'état (mode, screen, ja, …).
// Les composants qui lisent l'état doivent passer par useAppState().
const AppStateContext = createContext<SensoState | null>(null);

const useAppActions = (): AppActions => {
  const ctx = useContext(AppActionsContext);
  if (!ctx) throw new Error("useAppActions() must be used inside <AppProviders>");
  return ctx;
};

const useAppState = (): SensoState => {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState() must be used inside <AppProviders>");
  return ctx;
};

// Vue agrégée rétrocompatible. Tout consommateur de useApp() se ré-rend sur
// chaque changement d'état à cause de l'abonnement au contexte d'état.
export type AppContextValue = SensoState & AppActions;

export const useApp = (): AppContextValue => {
  const state = useAppState();
  const actions = useAppActions();
  return useMemo<AppContextValue>(
    () => ({ ...state, ...actions }),
    [state, actions]
  );
};

export function AppProviders({ children }: { children: ReactNode }) {
  const { state, actions } = useSenso();
  const { session } = useSession();

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem("admin_auth");
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    actions.setAdminAuth(false);
    // Sans cela, le bandeau continuerait d'afficher le nom et la bascule entre
    // espaces d'un compte qui vient de partir.
    oublierSession();
    actions.setMode("home");
    actions.setScreen("landing");
  }, [actions]);

  // Actions étendues : on injecte handleLogout. handleLogout est stable car
  // setAdminAuth est stable et actions est stable, donc useCallback ne se rebuilde
  // qu'au premier render.
  const actionsValue = useMemo<AppActions>(
    () => ({ ...actions, handleLogout }),
    [actions, handleLogout]
  );

  return (
    <AppActionsContext.Provider value={actionsValue}>
      <AppStateContext.Provider value={state}>
        <Topbar
          mode={state.mode}
          online={state.online}
          nomUtilisateur={session?.user?.name ?? session?.user?.email ?? null}
          administrateur={session?.isAdmin === true}
          onModeChange={(m) => {
            actions.setMode(m);
            actions.setScreen("landing");
          }}
          onLogout={session?.authenticated ? handleLogout : undefined}
        />
        <main className="max-w-full overflow-x-clip pt-13 sm:pt-15">{children}</main>
      </AppStateContext.Provider>
    </AppActionsContext.Provider>
  );
}
