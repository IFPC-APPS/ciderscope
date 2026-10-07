"use client";

import { createContext, useContext, useMemo, useCallback, type ReactNode } from "react";
import { Topbar } from "../components/ui/Topbar";
import { BarreLaterale, type EntreeNav } from "../components/ui/BarreLaterale";
import { FiBarChart2, FiCalendar, FiHome, FiList, FiSettings, FiUsers } from "react-icons/fi";
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

  const nomUtilisateur = session?.user?.name ?? session?.user?.email ?? null;
  // Null quand la fédération n'est pas configurée : proposer une connexion qui
  // ne peut pas aboutir est pire que ne rien proposer.
  const lienConnexion = session?.padocAvailable === false ? null : "/api/auth/ifpc/login";

  // La passation proprement dite, et non l'écran de choix : c'est là que le
  // dégustateur doit rester concentré.
  const enPassation = state.mode === "participant" && state.screen !== "landing";

  const peutCreneaux = !state.capacites?.length || state.capacites.includes("creneaux");

  const entrees: EntreeNav[] = state.mode === "admin"
    ? [
        { cle: "seances", libelle: "Séances", icone: <FiList size={18} />,
          actif: state.adminSection === "seances", onClick: () => actions.setAdminSection("seances") },
        ...(peutCreneaux ? [{
          cle: "creneaux", libelle: "Créneaux", icone: <FiCalendar size={18} />,
          actif: state.adminSection === "creneaux", onClick: () => actions.setAdminSection("creneaux"),
        }] : []),
        { cle: "analyse", libelle: "Analyse", icone: <FiBarChart2 size={18} />,
          actif: state.adminSection === "analyse", onClick: () => actions.setAdminSection("analyse") },
        { cle: "passation", libelle: "Passation", icone: <FiUsers size={18} />,
          onClick: () => { actions.setMode("participant"); actions.setScreen("landing"); } },
      ]
    : [
        { cle: "accueil", libelle: "Accueil", icone: <FiHome size={18} />,
          actif: state.mode === "home",
          onClick: () => { actions.setMode("home"); actions.setScreen("landing"); } },
        { cle: "degustation", libelle: "Rejoindre une dégustation", icone: <FiUsers size={18} />,
          actif: state.mode === "participant",
          onClick: () => { actions.setMode("participant"); actions.setScreen("landing"); } },
        // L'animateur garde l'accès à son espace depuis n'importe où.
        ...(session?.isAdmin ? [{
          cle: "administration", libelle: "Administration", icone: <FiSettings size={18} />,
          onClick: () => { actions.setMode("admin"); actions.setScreen("landing"); },
        }] : []),
      ];

  return (
    <AppActionsContext.Provider value={actionsValue}>
      <AppStateContext.Provider value={state}>
        {/* La barre latérale accompagne la navigation ; elle s'efface pendant
            la passation elle-même. Un dégustateur au milieu de sa séance n'a
            pas à se voir offrir des portes de sortie, et sur un téléphone posé
            dans un chai la largeur est précieuse. Partout ailleurs elle reste,
            car la voir disparaître d'un écran à l'autre déroute. */}
        {enPassation ? (
          <>
            <Topbar
              mode={state.mode}
              online={state.online}
              nomUtilisateur={nomUtilisateur}
              administrateur={session?.isAdmin === true}
              lienConnexion={lienConnexion}
              onModeChange={(m) => { actions.setMode(m); actions.setScreen("landing"); }}
              onLogout={session?.authenticated ? handleLogout : undefined}
            />
            <main className="max-w-full overflow-x-clip pt-13 sm:pt-15">{children}</main>
          </>
        ) : (
          <>
            <BarreLaterale
              entrees={entrees}
              nomUtilisateur={nomUtilisateur}
              lienConnexion={lienConnexion}
              online={state.online}
              onLogout={session?.authenticated ? handleLogout : undefined}
            />
            <main className="max-w-full overflow-x-clip pt-14 lg:pt-0 lg:pl-[52px]">{children}</main>
          </>
        )}
      </AppStateContext.Provider>
    </AppActionsContext.Provider>
  );
}
