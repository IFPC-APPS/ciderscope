"use client";
import React, { useEffect, useMemo, useState, Dispatch, SetStateAction } from "react";
import dynamic from "next/dynamic";
import { FiChevronLeft, FiChevronRight, FiEdit2, FiCopy, FiX, FiCheck, FiArrowLeft, FiPlus, FiBarChart2, FiList, FiPieChart, FiGrid } from "react-icons/fi";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Badge } from "../../ui/Badge";
import { DangerGhostButton, ConfirmDialog } from "../../ui/ViewPrimitives";
import { SessionConfig, SessionListItem, AllAnswers, CSVRow, AppScreen } from "../../../types";
import type { AdminSlotListItem } from "../../../types/slots";
import { adminFieldGridClass, chipRemoveButtonClass } from "./utils";
import { addDays, getWeekCalendarDays, getWeekStart, weekLabel } from "../../../lib/slots/dates";

// Import subcomponents
import { ParticipantsTab } from "./ParticipantsTab";
import { QuestionBuilder } from "./QuestionBuilder";
import { SlotAdminView } from "./SlotAdminView";
import { AdminHelpNotifications } from "./AdminHelpNotifications";
import { SessionMergeCard } from "./SessionMergeCard";
import { avecCreneaux, genreDe, GENRES } from "../../../lib/genreSeance";
import { QrSeance } from "../../features/QrSeance";

const adminShellClass = "mx-auto max-w-full overflow-x-clip px-[22px] py-7 pb-[60px] sm:max-w-[95%] supports-[not(overflow-x:clip)]:overflow-x-hidden";
const sessionCardClass = "mb-2.5 flex max-w-full min-w-0 flex-wrap items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] px-5 py-[18px] shadow-[var(--shadow)] transition-[box-shadow,border-color] duration-150 hover:border-[rgba(30,46,46,.18)] hover:shadow-[0_3px_16px_rgba(30,46,46,.09)]";
const sessionListClass = "grid gap-2 min-[721px]:grid-cols-2 min-[721px]:gap-2.5 min-[901px]:gap-2 xl:grid-cols-3 min-[1600px]:grid-cols-4";
const adminEditHeaderClass = "sticky top-[60px] z-40 mb-3 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--paper2)] px-0.5 pt-2 pb-3.5 min-[481px]:gap-3.5 min-[481px]:px-1 min-[481px]:pt-2.5 min-[481px]:pb-[18px]";
const editTabsClass = "mb-[22px] flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--paper2)] p-1 min-[481px]:gap-1.5 min-[481px]:p-1.5";
const editTabClass = (active: boolean) => [
  "inline-flex min-h-10 flex-1 basis-auto cursor-pointer items-center justify-center gap-2 rounded-lg border border-transparent bg-transparent px-3 py-[9px] text-[13px] font-semibold text-[var(--mid)] transition-[background,color,border-color] duration-100 hover:bg-[var(--paper)] hover:text-[var(--ink)] max-[480px]:min-w-0 max-[480px]:[&>svg]:hidden min-[481px]:min-h-11 min-[481px]:min-w-[140px] min-[481px]:px-4 min-[481px]:py-[11px] min-[481px]:text-sm",
  active ? "border-[var(--border-strong)] bg-[var(--paper)] text-[var(--ink)] shadow-[0_1px_3px_rgba(0,0,0,.08)] [&>svg]:text-[var(--accent)]" : "",
].filter(Boolean).join(" ");

type SaveSessionResult = {
  success: boolean;
  sessionId?: string;
  sessionName?: string;
  wasCreated?: boolean;
};

type SaveNotice = {
  title: string;
  text: string;
};

type SessionDateParts = {
  year: number;
  month: number;
  day: number;
  time: number;
};

type SessionGroup = {
  key: string;
  title: string;
  sessions: SessionListItem[];
  order: number;
};

const sessionGroupClass = "grid gap-3";
const sessionGroupHeaderClass = "flex items-center gap-3 border-b border-[var(--border)] pb-2";

const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long" });

const parseSessionDate = (value: string): SessionDateParts | null => {
  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoMatch) {
    const year = Number.parseInt(isoMatch[1], 10);
    const month = Number.parseInt(isoMatch[2], 10);
    const day = Number.parseInt(isoMatch[3], 10);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return { year, month, day, time: date.getTime() };
    }
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    time: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
  };
};

const getMonthGroupTitle = (year: number, month: number) => {
  const label = monthFormatter.format(new Date(year, month - 1, 1));
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${year}`;
};

// AnalyseView (Chart.js, calculs lourds) chargée à la demande.
const AnalyseView = dynamic(() => import("../Analyse/AnalyseView").then(m => m.AnalyseView), {
  ssr: false,
  loading: () => <div className="p-8 text-[var(--mid)]">Chargement de l&apos;analyse…</div>,
});

interface AdminViewProps {
  screen: AppScreen;
  sessions: SessionListItem[];
  editCfg: SessionConfig | null;
  curEditTab: string;
  editSessId: string | null;
  adminSection: "seances" | "creneaux" | "analyse";
  setAdminSection: (v: "seances" | "creneaux" | "analyse") => void;
  /**
   * Capacités de la session, reçues de PADOC.
   *
   * La planification par créneaux et les invitations Outlook servent au panel
   * institutionnel ; un cidrier qui organise sa propre dégustation n'en a pas
   * l'usage et ne les reçoit pas. Masquer n'est qu'un confort : les routes
   * correspondantes exigent la capacité de leur côté.
   */
  capacites?: string[];
  onNewSession: () => void;
  onEditSession: (id: string) => void;
  onToggleResultsVisible: (id: string) => void;
  onDuplicateSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onSetEditCfg: Dispatch<SetStateAction<SessionConfig | null>>;
  onSetEditTab: (tab: string) => void;
  onSaveEdit: () => Promise<SaveSessionResult | void> | SaveSessionResult | void;
  onSessionSaved: (result: SaveSessionResult) => void;
  onRefreshSessions: () => Promise<unknown> | unknown;
  saveNotice: SaveNotice | null;
  onDismissSaveNotice: () => void;
  onGoBack: () => void;
  downloadCSV: (rows: CSVRow[], filename: string) => void;
  listJurorsForSession: (id: string) => Promise<string[]>;
  deleteJury: (sessionId: string, name: string) => Promise<{ success: boolean } | undefined>;
  // Analyse props
  allAnswers: AllAnswers;
  anSessId: string | null;
  anCfg: SessionConfig | null;
  curAnT: string;
  onAnSessChange: (id: string) => void;
  onAnTabChange: (tab: string) => void;
}

export const AdminView = ({
  screen, sessions, editCfg, curEditTab, editSessId,
  adminSection, setAdminSection, capacites,
  onNewSession, onEditSession, onToggleResultsVisible, onDuplicateSession, onDeleteSession,
  onSetEditCfg, onSetEditTab, onSaveEdit, onSessionSaved, onRefreshSessions, saveNotice, onDismissSaveNotice, onGoBack, downloadCSV,
  listJurorsForSession, deleteJury,
  allAnswers, anSessId, anCfg, curAnT, onAnSessChange, onAnTabChange,
}: AdminViewProps) => {
  // Absence de capacités = session d'avant cette évolution, ou mot de passe
  // partagé : on n'enlève rien à une installation en service.
  const peutCreneaux = !capacites || capacites.includes("creneaux");
  // Deux conditions distinctes : le compte a-t-il le droit d'organiser des
  // créneaux, et CETTE séance en comporte-t-elle. La première vient de PADOC,
  // la seconde du genre choisi à la création.
  const seanceAvecCreneaux = avecCreneaux(editCfg);
  const [qrSeance, setQrSeance] = useState<{ id: string; nom: string } | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [skipSlotCreation, setSkipSlotCreation] = useState(false);
  const [selectedSlotDates, setSelectedSlotDates] = useState<Set<string>>(() => new Set());
  const [existingSlots, setExistingSlots] = useState<AdminSlotListItem[]>([]);
  const [slotWeekStart, setSlotWeekStart] = useState(() => getWeekStart(new Date()));
  const [slotMessage, setSlotMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const helpSessionId = screen === "edit" ? editSessId : (adminSection === "analyse" ? anSessId : null);
  const helpSessionName = helpSessionId
    ? (helpSessionId === editSessId ? editCfg?.name : anCfg?.name) || sessions.find(s => s.id === helpSessionId)?.name
    : undefined;
  const slotWeekDays = useMemo(() => getWeekCalendarDays(slotWeekStart), [slotWeekStart]);
  const existingSlotsByDate = useMemo(() => {
    return new Map(existingSlots.map(slot => [slot.slotDate, slot]));
  }, [existingSlots]);

  const groupedSessions = useMemo<SessionGroup[]>(() => {
    const currentYear = new Date().getFullYear();
    const groups = new Map<string, SessionGroup>();
    const datedSessions = sessions.map(session => ({
      session,
      date: parseSessionDate(session.date),
    }));

    datedSessions
      .sort((a, b) => {
        if (a.date && b.date) return b.date.time - a.date.time;
        if (a.date) return -1;
        if (b.date) return 1;
        return a.session.name.localeCompare(b.session.name, "fr");
      })
      .forEach(({ session, date }) => {
        const key = date
          ? date.year === currentYear
            ? `month-${date.year}-${String(date.month).padStart(2, "0")}`
            : `year-${date.year}`
          : "unscheduled";
        const title = date
          ? date.year === currentYear
            ? getMonthGroupTitle(date.year, date.month)
            : String(date.year)
          : "Sans créneau";
        const order = date
          ? date.year === currentYear
            ? date.year * 100 + date.month
            : date.year * 100
          : Number.NEGATIVE_INFINITY;
        const group = groups.get(key);
        if (group) {
          group.sessions.push(session);
        } else {
          groups.set(key, { key, title, sessions: [session], order });
        }
      });

    return Array.from(groups.values()).sort((a, b) => b.order - a.order);
  }, [sessions]);

  const pendingSlotDates = useMemo(() => {
    // Le genre d'abord : des dates ont pu être choisies avant que la séance ne
    // bascule en dégustation, et les créneaux seraient alors créés malgré la
    // carte disparue de l'écran.
    if (!editCfg || !avecCreneaux(editCfg) || skipSlotCreation) return [];
    return Array.from(selectedSlotDates).sort();
  }, [editCfg, selectedSlotDates, skipSlotCreation]);

  useEffect(() => {
    if (screen !== "edit") return;
    let cancelled = false;
    const loadExistingSlots = async () => {
      try {
        const response = await fetch("/api/admin/slots", { cache: "no-store" });
        const payload = await response.json().catch(() => ({})) as { slots?: AdminSlotListItem[] };
        if (!response.ok) throw new Error("Impossible de charger les créneaux.");
        if (!cancelled) setExistingSlots(payload.slots || []);
      } catch (error) {
        console.warn("Chargement des créneaux indisponible:", error);
      }
    };

    void loadExistingSlots();
    return () => {
      cancelled = true;
    };
  }, [screen]);

  const moveSlotWeek = (delta: number) => {
    setSlotWeekStart(prev => addDays(prev, delta * 7));
  };

  const toggleSlotDate = (date: string) => {
    const existingSlot = existingSlotsByDate.get(date);
    if (existingSlot?.sessionId && existingSlot.sessionId !== editSessId) {
      setSlotMessage({ kind: "error", text: "Ce créneau est déjà rattaché à une autre séance." });
      return;
    }

    setSlotMessage(null);
    setSelectedSlotDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const createSlotsForSession = async (sessionId: string, sessionName: string) => {
    if (pendingSlotDates.length === 0) return;
    const response = await fetch("/api/admin/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotDates: pendingSlotDates,
        sessionId,
        sessionName,
      }),
    });
    const payload = await response.json().catch(() => ({})) as {
      ok?: boolean;
      error?: string;
      detail?: string;
      created?: unknown[];
      attached?: unknown[];
      skipped?: unknown[];
    };

    if (!response.ok || !payload.ok) {
      throw new Error(payload.detail || payload.error || "Création des créneaux impossible.");
    }

    const createdCount = payload.created?.length || 0;
    const attachedCount = payload.attached?.length || 0;
    const skippedCount = payload.skipped?.length || 0;
    setSlotMessage({
      kind: "ok",
      text: skippedCount > 0
        ? `${createdCount} créneau(x) créé(s), ${attachedCount} créneau(x) rattaché(s), ${skippedCount} date(s) ignorée(s).`
        : `${createdCount} créneau(x) créé(s), ${attachedCount} créneau(x) rattaché(s).`,
    });
  };

  const handleSaveWithSlots = async () => {
    setSlotMessage(null);

    // Sans la capacité « creneaux », la carte n'est pas affichée : exiger une
    // date bloquerait l'enregistrement sur un champ que l'animateur ne voit
    // pas. On enregistre la séance, sans planification.
    if (!peutCreneaux) {
      const resultat = await onSaveEdit();
      if (resultat?.success) onSessionSaved(resultat);
      return;
    }

    if (!editSessId && !skipSlotCreation && pendingSlotDates.length === 0) {
      setSlotMessage({ kind: "error", text: "Choisissez au moins une date valide pour créer un créneau, ou cochez \"Ne pas assigner de créneau\"." });
      return;
    }

    const result = await onSaveEdit();
    if (!result?.success) return;
    if (skipSlotCreation) {
      onSessionSaved(result);
      return;
    }
    if (!result.sessionId || !result.sessionName) {
      setSlotMessage({ kind: "error", text: "Séance enregistrée, mais impossible de récupérer son identifiant pour créer le créneau." });
      return;
    }
    if (pendingSlotDates.length === 0) {
      onSessionSaved(result);
      return;
    }

    try {
      await createSlotsForSession(result.sessionId, result.sessionName);
      setSelectedSlotDates(new Set());
      await onRefreshSessions();
      onSessionSaved(result);
    } catch (error) {
      setSlotMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Séance enregistrée, mais création des créneaux impossible.",
      });
    }
  };

  if (screen === "landing") {
    return (
      <>
      <AdminHelpNotifications sessionId={helpSessionId} sessionName={helpSessionName} />
      <div className={adminShellClass}>
        {/* Les sections sont portées par la barre latérale. Les laisser aussi
            ici ferait deux navigations pour la même chose, qui finiraient par
            ne plus dire pareil. */}

        {adminSection === "analyse" && (
          <AnalyseView
            sessions={sessions}
            anSessId={anSessId}
            anCfg={anCfg}
            allAnswers={allAnswers}
            curAnT={curAnT}
            onAnSessChange={onAnSessChange}
            onAnTabChange={onAnTabChange}
            downloadCSV={downloadCSV}
            onGoBack={onGoBack}
          />
        )}

        {qrSeance && (
          <QrSeance
            sessionId={qrSeance.id}
            nomSeance={qrSeance.nom}
            onFermer={() => setQrSeance(null)}
          />
        )}

        {adminSection === "creneaux" && peutCreneaux && (
          <SlotAdminView sessions={sessions} />
        )}

        {adminSection === "seances" && (
          <>
            <div className="flex items-center gap-3.5 mb-6 flex-wrap">
              <h2 className="font-extrabold text-[22px]">Séances</h2>
              <div className="flex-1"></div>
              <Button size="sm" onClick={onNewSession}>+ Nouvelle</Button>
            </div>
            <div id="sessList" className="grid gap-7">
              {sessions.length === 0 ? (
                <div className="rounded-[var(--radius)] border-2 border-dashed border-[var(--border)] bg-[var(--paper2)] p-[42px] text-center text-[15px] text-[var(--mid)]">Aucune séance.</div>
              ) : (
                groupedSessions.map(group => (
                  <section key={group.key} className={sessionGroupClass} aria-labelledby={`session-group-${group.key}`}>
                    <div className={sessionGroupHeaderClass}>
                      <h3 id={`session-group-${group.key}`} className="text-[15px] font-extrabold text-[var(--ink)]">
                        {group.title}
                      </h3>
                      <span className="rounded-full border border-[var(--border)] bg-[var(--paper2)] px-2 py-0.5 text-[11px] font-bold text-[var(--mid)]">
                        {group.sessions.length}
                      </span>
                    </div>
                    <div className={sessionListClass}>
                      {group.sessions.map(s => (
                  <div key={s.id} className={sessionCardClass}>
                    <div className="min-w-0">
                      <div className="text-base font-bold">
                        {s.name}
                        {s.active ? (
                          <Badge variant="active">AUJOURD&apos;HUI</Badge>
                        ) : s.hasSlotSchedule ? (
                          <Badge variant="inactive">PLANIFIÉE</Badge>
                        ) : (
                          <Badge variant="inactive">SANS CRÉNEAU</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-[var(--mid)]">
                        {[(s.slotDates?.length ? s.slotDates.join(" / ") : s.date) || "sans créneau", `${s.productCount} éch.`, `${s.questionCount} Q`, `${s.jurorCount} jurys`].join(" · ")}
                      </div>
                    </div>
                    <div className="flex-1"></div>
                    <div className="flex flex-wrap gap-[5px]">
                      <Button
                        variant={s.resultsVisible ? "ok" : "ghost"}
                        size="sm"
                        onClick={() => onToggleResultsVisible(s.id)}
                        title={s.resultsVisible ? "Masquer le résumé aux participants" : "Afficher le résumé aux participants"}
                        aria-label={s.resultsVisible ? "Masquer le résumé aux participants" : "Afficher le résumé aux participants"}
                      >
                        <FiPieChart />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          onAnSessChange(s.id);
                          setAdminSection("analyse");
                        }}
                        title="Voir l'analyse"
                        aria-label="Voir l'analyse de la séance"
                      >
                        <FiBarChart2 />
                      </Button>
                      {s.genre === "degustation" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setQrSeance({ id: s.id, nom: s.name })}
                          title="QR code d'entrée"
                          aria-label="Afficher le QR code d'entrée de la séance"
                        >
                          <FiGrid />
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => onEditSession(s.id)} title="Modifier" aria-label="Modifier la séance"><FiEdit2 /></Button>
                      <Button variant="ghost" size="sm" onClick={() => onDuplicateSession(s.id)} title="Dupliquer" aria-label="Dupliquer la séance"><FiCopy /></Button>
                      {confirmingId === s.id ? (
                        <div className="flex gap-1">
                          <Button variant="danger" size="sm" onClick={() => { onDeleteSession(s.id); setConfirmingId(null); }}>Confirmer ?</Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmingId(null)}>Annuler</Button>
                        </div>
                      ) : (
                        <DangerGhostButton onClick={() => setConfirmingId(s.id)} title="Supprimer" aria-label="Supprimer la séance"><FiX /></DangerGhostButton>
                      )}
                    </div>
                  </div>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          </>
        )}

        {confirmingId && (
          <ConfirmDialog
            title="Supprimer la séance ?"
            confirmLabel="Supprimer"
            onCancel={() => setConfirmingId(null)}
            onConfirm={() => { onDeleteSession(confirmingId); setConfirmingId(null); }}
          >
            Toutes les données et les réponses des participants seront définitivement supprimées.
          </ConfirmDialog>
        )}

        {saveNotice && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-[230] flex items-center justify-center bg-black/35 px-4">
            <div className="w-full max-w-[430px] rounded-xl border border-[var(--border)] bg-[var(--paper)] p-6 shadow-[0_12px_36px_rgba(0,0,0,.18)]">
              <div className="mb-2 text-lg font-extrabold text-[var(--ink)]">{saveNotice.title}</div>
              <div className="text-sm leading-relaxed text-[var(--mid)]">{saveNotice.text}</div>
              <div className="mt-5 flex justify-end">
                <Button variant="ok" size="sm" onClick={onDismissSaveNotice}>OK</Button>
              </div>
            </div>
          </div>
        )}
      </div>
      </>
    );
  }

  if (screen === "edit" && editCfg) {
    const tabs = [
      { id: "session", label: "Session", icon: <FiList /> },
      { id: "questions", label: "Questionnaire", icon: <FiPieChart /> },
      { id: "jurors", label: "Participants", icon: <FiCheck /> },
    ];

    return (
      <>
      <AdminHelpNotifications sessionId={helpSessionId} sessionName={helpSessionName} />
      <div className={adminShellClass}>
        <header className={adminEditHeaderClass}>
          <Button variant="secondary" size="sm" onClick={onGoBack}><FiArrowLeft /> Retour</Button>
          <div className="flex-1">
             <h2 className="truncate text-[17px] font-extrabold leading-[1.2] tracking-[-.2px] min-[481px]:text-xl">{editCfg.name || "Nouvelle séance"}</h2>
          </div>
          <Button onClick={() => void handleSaveWithSlots()}>Enregistrer</Button>
        </header>

        <div className={editTabsClass}>
          {tabs.map(t => (
            <button
              key={t.id}
              className={editTabClass(curEditTab === t.id)}
              onClick={() => onSetEditTab(t.id)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-[18px] pb-8">
          {curEditTab === "session" && (
            <div className="flex flex-col gap-[18px]">
              <Card title="Général">
                <div className={adminFieldGridClass}>
                  <div className="field-wrap full">
                    <label>NOM DE LA SÉANCE</label>
                    <input
                      value={editCfg.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        onSetEditCfg(prev => prev ? { ...prev, name } : prev);
                      }}
                    />
                  </div>

                  {/* Le genre commande le reste du formulaire : il se choisit
                      donc avant tout le reste, et non enfoui plus bas. */}
                  <div className="field-wrap full">
                    <label>USAGE DE LA SÉANCE</label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {GENRES.map(({ valeur, libelle, detail }) => {
                        const actif = genreDe(editCfg) === valeur;
                        return (
                          <label
                            key={valeur}
                            className={`flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2.5 transition-colors ${
                              actif
                                ? "border-[var(--primary)] bg-[rgba(98,141,23,.06)]"
                                : "border-[var(--border)] bg-[var(--paper2)] hover:border-[var(--border-strong)]"
                            }`}
                          >
                            <span className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                              <input
                                type="radio"
                                name="genre-seance"
                                checked={actif}
                                onChange={() => onSetEditCfg(prev => prev ? { ...prev, genre: valeur } : prev)}
                              />
                              {libelle}
                            </span>
                            <span className="pl-6 text-xs leading-snug text-[var(--mid)]">{detail}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Card>

              {peutCreneaux && seanceAvecCreneaux && (
                <Card title="Créneau">
                  <div className="grid gap-3 p-[15px]">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--paper2)] px-3 py-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={skipSlotCreation}
                        onChange={(event) => setSkipSlotCreation(event.target.checked)}
                      />
                      Ne pas assigner de créneau
                    </label>

                    {!skipSlotCreation && (
                      <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--paper2)] p-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--paper)] text-[var(--mid)] hover:border-[var(--border-strong)] hover:text-[var(--ink)]"
                            onClick={() => moveSlotWeek(-1)}
                            aria-label="Semaine precedente"
                            title="Semaine precedente"
                          >
                            <FiChevronLeft />
                          </button>
                          <div className="flex-1 text-center text-sm font-extrabold text-[var(--ink)]">
                            Semaine du {weekLabel(slotWeekStart)}
                          </div>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--paper)] text-[var(--mid)] hover:border-[var(--border-strong)] hover:text-[var(--ink)]"
                            onClick={() => moveSlotWeek(1)}
                            aria-label="Semaine suivante"
                            title="Semaine suivante"
                          >
                            <FiChevronRight />
                          </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {slotWeekDays.map(day => {
                            const selected = selectedSlotDates.has(day.date);
                            const existingSlot = existingSlotsByDate.get(day.date);
                            const isFull = existingSlot ? existingSlot.placesTaken >= existingSlot.capacity : false;
                            const isAttachedElsewhere = !!existingSlot?.sessionId && existingSlot.sessionId !== editSessId;
                            const slotMeta = isAttachedElsewhere
                              ? "occupé"
                              : existingSlot?.sessionId === editSessId
                                ? "lié"
                                : existingSlot
                                  ? `${existingSlot.placesTaken}/${existingSlot.capacity}${existingSlot.waitlistCount > 0 ? ` +${existingSlot.waitlistCount}` : ""}`
                                  : day.month;
                            return (
                              <button
                                key={day.date}
                                type="button"
                                onClick={() => toggleSlotDate(day.date)}
                                className={[
                                  "grid min-h-[58px] rounded-lg border px-1 py-2 text-center transition-colors",
                                  existingSlot && !selected && !isFull ? "border-[rgba(98,141,23,.28)] bg-[rgba(98,141,23,.11)] text-[var(--ink)]" : "",
                                  existingSlot && !selected && isFull ? "border-[rgba(198,40,40,.25)] bg-[rgba(198,40,40,.10)] text-[var(--ink)]" : "",
                                  !existingSlot && !selected ? "border-[var(--border)] bg-[var(--paper)] text-[var(--ink)] hover:border-[var(--border-strong)] hover:bg-[var(--paper)]" : "",
                                  selected ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-[0_1px_4px_rgba(0,0,0,.12)]" : "",
                                  isAttachedElsewhere && !selected ? "cursor-not-allowed opacity-65" : "",
                                ].join(" ")}
                                aria-pressed={selected}
                                title={isAttachedElsewhere
                                  ? "Créneau déjà rattaché à une autre séance."
                                  : existingSlot
                                    ? "Créneau déjà ouvert : la séance sera rattachée à cette date."
                                    : undefined}
                              >
                                <span className="text-[10px] font-bold uppercase leading-none">{day.weekday}</span>
                                <span className="mt-1 text-base font-extrabold leading-none">{day.day}</span>
                                <span className="mt-1 truncate text-[10px] font-semibold uppercase leading-none opacity-75">
                                  {slotMeta}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap gap-3 text-[12px] text-[var(--mid)]">
                          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--primary)]" /> créneau ouvert</span>
                          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--danger)]" /> créneau complet</span>
                          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--paper3)]" /> sans créneau</span>
                        </div>
                      </div>
                    )}

                    {slotMessage && (
                      <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                        slotMessage.kind === "ok"
                          ? "border-[rgba(98,141,23,.24)] bg-[rgba(98,141,23,.09)] text-[var(--primary)]"
                          : "border-[rgba(198,40,40,.22)] bg-[rgba(198,40,40,.08)] text-[var(--danger)]"
                      }`}>
                        {slotMessage.text}
                      </div>
                    )}
                  </div>
                </Card>
              )}

              <Card title="Échantillons">
                <div className="flex flex-col gap-2">
                  {editCfg.products.map((p, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <input
                        value={p.code}
                        onChange={(e) => {
                          const code = e.target.value.toUpperCase();
                          onSetEditCfg(prev => prev ? {
                            ...prev,
                            products: prev.products.map((product, idx) =>
                              idx === i ? { ...product, code } : product
                            ),
                          } : prev);
                        }}
                        className="w-24 font-mono font-bold text-left"
                        placeholder="Code"
                      />
                      <input
                        value={p.label || ""}
                        onChange={(e) => {
                          const label = e.target.value;
                          onSetEditCfg(prev => prev ? {
                            ...prev,
                            products: prev.products.map((product, idx) =>
                              idx === i ? { ...product, label } : product
                            ),
                          } : prev);
                        }}
                        className="flex-1"
                        placeholder="Libellé optionnel"
                      />
                      <button
                        className={`${chipRemoveButtonClass} mt-2`}
                        type="button"
                        title="Retirer cet échantillon"
                        aria-label={`Retirer l'échantillon ${p.code || i + 1}`}
                        onClick={() => onSetEditCfg(prev => prev ? {
                          ...prev,
                          products: prev.products.filter((_, idx) => idx !== i),
                        } : prev)}
                      ><FiX /></button>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start mt-1"
                    onClick={() => {
                      // Tire un code à 3 chiffres (101–999) non encore utilisé
                      // dans la séance, pour éviter les doublons à la saisie.
                      onSetEditCfg(prev => {
                        if (!prev) return prev;
                        const used = new Set(prev.products.map(p => p.code).filter(Boolean));
                        let code = "";
                        for (let attempt = 0; attempt < 50; attempt++) {
                          const n = 101 + Math.floor(Math.random() * 899);
                          const c = String(n);
                          if (!used.has(c)) { code = c; break; }
                        }
                        return { ...prev, products: [...prev.products, { code }] };
                      });
                    }}
                  >
                    <FiPlus /> Ajouter un échantillon
                  </Button>
                </div>
              </Card>

              {editSessId && (
                <SessionMergeCard
                  targetSessionId={editSessId}
                  targetSessionName={editCfg.name}
                  candidates={sessions.filter(session => session.id !== editSessId)}
                  onMerged={async () => { await onRefreshSessions(); }}
                />
              )}

              {/* Option "Williams Design (Carré latin)" masquée à la demande.
                  La logique reste branchée côté hook (presMode peut valoir
                  "latin"/"fixed"/"random") ; on n'expose juste plus le toggle. */}

              {editSessId && (
                <div className="py-6">
                  <Button
                    variant="dangerGhost"
                    size="sm"
                    onClick={() => onDeleteSession(editSessId)}
                  >
                    <FiX /> Supprimer définitivement la séance
                  </Button>
                </div>
              )}
            </div>
          )}

          {curEditTab === "questions" && (
            <div className="flex flex-col gap-[18px]">
              <QuestionBuilder editCfg={editCfg} onSetEditCfg={onSetEditCfg} />
            </div>
          )}

          {curEditTab === "jurors" && (
            <div className="flex flex-col gap-[18px]">
              <ParticipantsTab
                sessionId={editSessId!}
                config={editCfg!}
                listJurorsForSession={listJurorsForSession}
                deleteJury={deleteJury}
              />
            </div>
          )}
        </div>
      </div>
      </>
    );
  }

  return null;
};
