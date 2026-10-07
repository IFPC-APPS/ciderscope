"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { ParticipantView } from "../components/views/Participant/ParticipantView";
import { AdminLoginView } from "../components/views/Admin/AdminLoginView";
import { HomeScreen } from "../components/views/Home/HomeScreen";
import type { AppMode, AppScreen } from "../types";
import { validateSession } from "../lib/validation";
import { hsh } from "../lib/utils";
import { getStepCompletionKey } from "../lib/sessionSteps";
import { useApp } from "./AppProviders";
import { useSession } from "../lib/useSession";

import { downloadCSV } from "../lib/csv";

// L'admin n'est jamais chargé côté participant — split du bundle.
const AdminView = dynamic(() => import("../components/views/Admin/AdminView").then(m => m.AdminView), {
  ssr: false,
  loading: () => <div className="p-8 text-[var(--mid)]">Chargement...</div>,
});

// AnalyseView (Chart.js) chargée à la demande aussi côté participant pour
// le résumé de fin de séance — ne pèse pas sur le bundle initial.
const AnalyseView = dynamic(() => import("../components/views/Analyse/AnalyseView").then(m => m.AnalyseView), {
  ssr: false,
  loading: () => <div className="p-8 text-[var(--mid)]">Chargement du résumé...</div>,
});

const fingerprint = (cfg: unknown) => hsh(JSON.stringify(cfg));
type AdminSection = "seances" | "creneaux" | "analyse";
type NavigationPoint = { mode: AppMode; screen: AppScreen; adminSection: AdminSection };
type SaveNotice = { title: string; text: string };

const formatSaveError = (error: unknown) => {
  const typed = error as { error?: string; detail?: string; details?: string[] } | undefined;
  return [
    typed?.error,
    typed?.detail,
    typed?.details?.length ? "• " + typed.details.join("\n• ") : "",
  ].filter(Boolean).join("\n");
};

const sameNavigationPoint = (a: NavigationPoint, b: NavigationPoint) => (
  a.mode === b.mode && a.screen === b.screen && a.adminSection === b.adminSection
);

const getHierarchicalBackTarget = ({ mode, screen, adminSection }: NavigationPoint): NavigationPoint => {
  if (mode === "participant") {
    if (screen === "jury") return { mode: "participant", screen: "landing", adminSection };
    if (screen === "poste") return { mode: "participant", screen: "jury", adminSection };
    if (screen === "order") return { mode: "participant", screen: "poste", adminSection };
    if (screen === "summary") return { mode: "participant", screen: "done", adminSection };
    if (screen === "done") return { mode: "participant", screen: "landing", adminSection };
  }
  if (mode === "admin") {
    if (screen === "edit" || adminSection !== "seances") {
      return { mode: "admin", screen: "landing", adminSection: "seances" };
    }
  }
  return { mode: "home", screen: "landing", adminSection };
};

export default function CiderScope() {
  const editFingerprintRef = useRef<number | null>(null);
  const [saveNotice, setSaveNotice] = useState<SaveNotice | null>(null);

  const {
    mode, setMode, screen, setScreen,
    sessions,
    curSess, curSessId,
    jurors, cj, ja, cs, setCs,
    takenPostes, handleSelectPoste,
    handleSelectSession, handleLoginJury, handleSetJa, requestHelp,
    editCfg, setEditCfg,
    editSessId, setEditSessId,
    curEditTab, setCurEditTab,
    anSessId, anCfg, curAnT, setCurAnT,
    adminSection, setAdminSection,
    handleAnSessChange,
    rejoindreSeanceEpinglee,
    allAnswers,
    saveSession,
    deleteSession,
    deleteJury,
    listJurorsForSession,
    toggleResultsVisible,
    loadSessions,
    loadSessionConfig,
    saveStatus,
    pendingCount,
    isStepComplete,
    currentSteps,
    completion,
    validatedCompletion,
    flushSave,
    adminAuth, capacites,
    restored,
  } = useApp();

  // L'espace est décidé par le compte, non par un choix fait à l'entrée :
  // un animateur va à l'administration, les autres à la passation. Un
  // animateur peut toujours basculer ensuite depuis le bandeau.
  const { session, chargement: chargementSession } = useSession();

  useEffect(() => {
    if (chargementSession || !session?.authenticated || mode !== "home") return;
    setMode(session.isAdmin ? "admin" : "participant");
    setScreen("landing");
  }, [chargementSession, session, mode, setMode, setScreen]);

  // Entrée par QR code : /s/<jeton> a déposé un cookie, le serveur dit à
  // quelle séance il donne accès, et l'on y va sans passer par l'écran de
  // choix. Le dégustateur n'a rien à sélectionner — il a déjà scanné.
  // Un ref et non un état : ce drapeau ne doit rien réafficher, il empêche
  // seulement de redemander la séance épinglée à chaque rendu.
  const seanceEpingleeTentee = useRef(false);
  useEffect(() => {
    if (seanceEpingleeTentee.current || !restored || mode !== "home") return;
    seanceEpingleeTentee.current = true;
    let vivant = true;
    fetch("/api/public/seance-courante", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : { sessionId: null }))
      .then((d: { sessionId?: string | null }) => {
        if (vivant && d.sessionId) void rejoindreSeanceEpinglee(d.sessionId);
      })
      .catch(() => undefined);
    return () => { vivant = false; };
  }, [restored, mode, rejoindreSeanceEpinglee]);

  const currentNavigation: NavigationPoint = { mode, screen, adminSection };

  if (!restored) {
    return <div className="p-8 text-center text-[var(--mid)]">Initialisation de l&apos;application...</div>;
  }

  const goBack = () => {
    const target = getHierarchicalBackTarget(currentNavigation);
    if (sameNavigationPoint(currentNavigation, target)) return;
    setMode(target.mode);
    setScreen(target.screen);
    setAdminSection(target.adminSection);
  };

  if (mode === "home") {
    // Tant que la session n'est pas connue, on n'affiche rien de définitif :
    // montrer l'écran de connexion puis le remplacer aussitôt donnerait
    // l'impression d'une application qui hésite.
    if (chargementSession) {
      return <div className="p-8 text-center text-[var(--mid)]">Chargement…</div>;
    }
    return (
      <HomeScreen
        padocDisponible={session?.padocAvailable !== false}
        onRejoindre={() => { setMode("participant"); setScreen("landing"); }}
      />
    );
  }

  if (mode === "participant") {
    // Le résumé du panel n'est monté que quand le participant entre l'écran "summary",
    // et seulement si la séance courante a son `resultsVisible` à true. anCfg/allAnswers
    // sont préchargés via handleAnSessChange au clic sur "Voir le résumé".
    const summaryView = (screen === "summary" && anCfg && anSessId === curSessId)
      ? (
        <AnalyseView
          sessions={sessions}
          anSessId={anSessId}
          anCfg={anCfg}
          allAnswers={allAnswers}
          curAnT={curAnT}
          onAnSessChange={() => { /* non interactif côté participant */ }}
          onAnTabChange={setCurAnT}
          participantMode
          currentJuror={cj}
        />
      )
      : null;

    return (
      <ParticipantView
        screen={screen}
        sessions={sessions}
        curSess={curSess}
        curSessId={curSessId}
        jurors={jurors}
        cj={cj}
        ja={ja}
        cs={cs}
        saveStatus={saveStatus}
        pendingCount={pendingCount}
        takenPostes={takenPostes}
        onSelectPoste={handleSelectPoste}
        onSelectSession={handleSelectSession}
        onLoginJury={handleLoginJury}
        onSetJa={handleSetJa}
        onRequestHelp={requestHelp}
        onPrevStep={() => setCs(prev => Math.max(0, prev - 1))}
        onNextStep={() => {
          if (!isStepComplete(cs)) return;
          const completionKey = getStepCompletionKey(currentSteps[cs]);
          const markCurrentStepDone = (prev: typeof ja) => {
            if (!completionKey) return prev;
            const completed = prev._completedSteps || {};
            return { ...prev, _completedSteps: { ...completed, [completionKey]: true } };
          };
          if (cs >= currentSteps.length - 1) {
            handleSetJa(prev => ({ ...markCurrentStepDone(prev), _finished: true }));
            void flushSave();
            setScreen("done");
          } else {
            handleSetJa(markCurrentStepDone);
            void flushSave();
            setCs(prev => Math.min(currentSteps.length - 1, prev + 1));
          }
        }}
        onGoBack={goBack}
        onChangeJury={() => setScreen("jury")}
        onReviewAnswers={() => handleLoginJury(cj, { review: true })}
        onShowSummary={async () => {
          if (!curSessId) return;
          await handleAnSessChange(curSessId);
          setScreen("summary");
        }}
        onStartFromOrder={() => setScreen("form")}
        summaryView={summaryView}
        steps={currentSteps}
        completion={completion}
        validatedCompletion={validatedCompletion}
      />
    );
  }

  if (mode === "admin" && !adminAuth) {
    return <AdminLoginView />;
  }

  return (
    <AdminView
      screen={screen}
      sessions={sessions}
      editCfg={editCfg}
      curEditTab={curEditTab}
      editSessId={editSessId}
      adminSection={adminSection}
      setAdminSection={setAdminSection}
      capacites={capacites}
      onNewSession={() => {
        setEditCfg({ name: "", date: new Date().toISOString().slice(0, 10), products: [], questions: [], presMode: "latin" });
        setEditSessId(null);
        editFingerprintRef.current = null;
        setCurEditTab("session");
        setScreen("edit");
      }}
      onEditSession={async (id) => {
        const cfg = await loadSessionConfig(id);
        setEditCfg(cfg);
        setEditSessId(id);
        editFingerprintRef.current = cfg ? fingerprint(cfg) : null;
        setCurEditTab("session");
        setScreen("edit");
      }}
      onToggleResultsVisible={toggleResultsVisible}
      onDuplicateSession={async (id) => {
        const c = await loadSessionConfig(id);
        if (!c) return;
        const nc = { ...c, name: c.name + " (copie)", date: new Date().toISOString().slice(0, 10) };
        const ni = "s" + Date.now();
        const res = await saveSession(ni, nc, { active: false, jurorCount: 0 });
        if (res.success) await loadSessions();
        else alert(`Erreur lors de la duplication.${res.error ? "\n\n" + formatSaveError(res.error) : ""}`);
      }}
      onDeleteSession={async (id) => {
        await deleteSession(id);
        await loadSessions();
      }}
      onSetEditCfg={setEditCfg}
      onSetEditTab={setCurEditTab}
      onGoBack={goBack}
      onRefreshSessions={loadSessions}
      onSaveEdit={async () => {
        if (!editCfg) return { success: false };
        const errs = validateSession(editCfg);
        if (errs.length > 0) {
          alert("Configuration incomplète :\n\n• " + errs.join("\n• "));
          return { success: false };
        }
        // Verrouillage optimiste : on vérifie que la version serveur n'a pas changé depuis l'ouverture.
        if (editSessId && editFingerprintRef.current !== null) {
          const current = await loadSessionConfig(editSessId, { force: true });
          if (current && fingerprint(current) !== editFingerprintRef.current) {
            const ok = confirm("Cette séance a été modifiée ailleurs depuis que vous l'avez ouverte. Écraser ces modifications ?");
            if (!ok) return { success: false };
          }
        }
        const id = editSessId || "s" + Date.now();
        const wasCreated = !editSessId;
        const existing = sessions.find(s => s.id === id);
        const res = await saveSession(id, editCfg, {
          active: false,
          jurorCount: existing?.jurorCount ?? 0,
          resultsVisible: existing?.resultsVisible ?? false,
        });
        if (res.success) {
          editFingerprintRef.current = fingerprint(editCfg);
          await loadSessions();
          return { success: true, sessionId: id, sessionName: editCfg.name, wasCreated };
        } else {
          alert(`Erreur lors de l'enregistrement.${res.error ? "\n\n" + formatSaveError(res.error) : ""}`);
          return { success: false };
        }
      }}
      onSessionSaved={(result) => {
        setScreen("landing");
        setAdminSection("seances");
        setEditCfg(null);
        setEditSessId(null);
        setCurEditTab("session");
        editFingerprintRef.current = null;
        setSaveNotice({
          title: result.wasCreated ? "Séance créée" : "Séance enregistrée",
          text: result.wasCreated
            ? `La séance "${result.sessionName || "sans nom"}" a bien été créée.`
            : `La séance "${result.sessionName || "sans nom"}" a bien été enregistrée.`,
        });
      }}
      saveNotice={saveNotice}
      onDismissSaveNotice={() => setSaveNotice(null)}
      downloadCSV={downloadCSV}
      listJurorsForSession={listJurorsForSession}
      deleteJury={deleteJury}
      allAnswers={allAnswers}
      anSessId={anSessId}
      anCfg={anCfg}
      curAnT={curAnT}
      onAnSessChange={handleAnSessChange}
      onAnTabChange={setCurAnT}
    />
  );
}
