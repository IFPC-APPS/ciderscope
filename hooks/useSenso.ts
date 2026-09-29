"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { SessionListItem, SessionConfig, JurorAnswers, SessionStep, AllAnswers, AppMode, AppScreen, SaveStatus, Poste, PosteDay } from "../types";
import { queuePending, clearPending, listPending, countPending } from "../lib/offlineQueue";
import { asRecord, buildSessionSteps, isStepDone, isStepValidated } from "../lib/sessionSteps";
import { appendHelpRequest, createHelpRequest } from "../lib/helpRequests";
import { isPosteDay, isValidPosteNumber } from "../lib/postes";

// Cache mémoire des configs de séance avec TTL : invalidé sur saveSession/deleteSession,
// et automatiquement au-delà de CONFIG_CACHE_TTL_MS pour limiter les divergences avec
// d'autres clients qui auraient modifié la séance entre-temps.
type ConfigCacheEntry = { cfg: SessionConfig; ts: number; revision: number };
const _configCache = new Map<string, ConfigCacheEntry>();
const CONFIG_CACHE_TTL_MS = 60_000;
const PARTICIPANT_TOKEN_PREFIX = "senso_participant_token_v1";

const configCacheKey = (id: string, admin: boolean) => `${admin ? "admin" : "public"}:${id}`;
const participantIdentityKey = (sessionId: string, jurorName: string) => `${sessionId}:${jurorName.trim()}`;
const participantTokenKey = (sessionId: string, jurorName: string) => (
  `${PARTICIPANT_TOKEN_PREFIX}:${encodeURIComponent(sessionId)}:${encodeURIComponent(jurorName.trim())}`
);

const getParticipantToken = (sessionId: string, jurorName: string) => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(participantTokenKey(sessionId, jurorName)) || "";
};

const storeParticipantToken = (sessionId: string, jurorName: string, token: string) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(participantTokenKey(sessionId, jurorName), token);
};

type ParticipantAccessPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  token?: string;
  data?: JurorAnswers;
  revision?: number;
  takenPostes?: Record<string, string>;
};

const accessParticipantAnswers = async (sessionId: string, jurorName: string) => {
  const response = await fetch("/api/public/answers/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      jurorName,
      token: getParticipantToken(sessionId, jurorName) || undefined,
    }),
  });
  const payload = await response.json().catch(() => ({})) as ParticipantAccessPayload;
  if (!response.ok || !payload.ok || !payload.token) {
    throw new Error(payload.message || "Identification impossible.");
  }
  storeParticipantToken(sessionId, jurorName, payload.token);
  return payload;
};

const APP_MODES = ["home", "participant", "admin"] as const satisfies readonly AppMode[];
const APP_SCREENS = ["landing", "jury", "poste", "order", "form", "done", "summary", "edit"] as const satisfies readonly AppScreen[];
const ADMIN_SECTIONS = ["seances", "creneaux", "analyse"] as const;

const isStoredChoice = <T extends string>(value: string | null, choices: readonly T[]): value is T => {
  return !!value && (choices as readonly string[]).includes(value);
};

const parseStoredStep = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const logDataError = (message: string, error: unknown) => {
  console.error(message, error);
};

export const useSenso = () => {
  const [mode, setMode] = useState<AppMode>("home");
  const [screen, setScreen] = useState<AppScreen>("landing");
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restored, setRestored] = useState(false);
  const [adminAuth, setAdminAuth] = useState(false);
  // Capacités de la session, telles que le serveur les connaît. Sert à ne pas
  // montrer des écrans dont les routes refuseraient l'accès ; la décision
  // elle-même reste côté serveur.
  const [capacites, setCapacites] = useState<string[]>([]);
  const [online, setOnline] = useState(false);
  const [curSessId, setCurSessId] = useState<string | null>(null);
  const [curSess, setCurSess] = useState<SessionConfig | null>(null);
  const [jurors, setJurors] = useState<string[]>([]);
  // Map des postes pris pour la séance courante : "mardi-3" -> juryName.
  const [takenPostes, setTakenPostes] = useState<Record<string, string>>({});
  const [cj, setCj] = useState<string>("");
  const [poste, setPoste] = useState<Poste | null>(null);
  const [ja, setJa] = useState<JurorAnswers>({});
  const [cs, setCs] = useState<number>(0);
  const [editCfg, setEditCfg] = useState<SessionConfig | null>(null);
  const [editSessId, setEditSessId] = useState<string | null>(null);
  const [curEditTab, setCurEditTab] = useState<string>("session");
  const [anSessId, setAnSessId] = useState<string | null>(null);
  const [anCfg, setAnCfg] = useState<SessionConfig | null>(null);
  const [allAnswers, setAllAnswers] = useState<AllAnswers>({});
  const [curAnT, setCurAnT] = useState<string>("profil");
  const [adminSection, setAdminSection] = useState<"seances" | "creneaux" | "analyse">("seances");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Snapshot d'état lu par les handlers stables (useCallback avec deps vides).
  // Mis à jour à chaque render avant l'effect — les callbacks lisent toujours
  // la valeur fraîche via stateRef.current sans avoir à se rebuilder.
  type SensoStateSnapshot = {
    mode: AppMode; screen: AppScreen; sessions: SessionListItem[]; adminAuth: boolean;
    curSessId: string | null; curSess: SessionConfig | null;
    jurors: string[]; takenPostes: Record<string, string>;
    cj: string; poste: Poste | null; ja: JurorAnswers; cs: number;
    editCfg: SessionConfig | null; editSessId: string | null; curEditTab: string;
    anSessId: string | null; anCfg: SessionConfig | null; allAnswers: AllAnswers;
    curAnT: string; adminSection: "seances" | "creneaux" | "analyse";
    saveStatus: SaveStatus; pendingCount: number;
  };
  const stateRef = useRef<SensoStateSnapshot>({
    mode, screen, sessions, adminAuth, curSessId, curSess, jurors, takenPostes,
    cj, poste, ja, cs, editCfg, editSessId, curEditTab,
    anSessId, anCfg, allAnswers, curAnT, adminSection, saveStatus, pendingCount,
  });
  stateRef.current = {
    mode, screen, sessions, adminAuth, curSessId, curSess, jurors, takenPostes,
    cj, poste, ja, cs, editCfg, editSessId, curEditTab,
    anSessId, anCfg, allAnswers, curAnT, adminSection, saveStatus, pendingCount,
  };
  const answerRevisionRef = useRef<Map<string, number>>(new Map());

  // Persistence unifiée : un seul effect debouncé écrit toutes les clés en bloc.
  // Évite la cascade de 11 setItem synchrones à chaque transition d'étape, et coalesce
  // les rafales de mises à jour (changement d'onglet + de session + de jury, etc.).
  const _persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot des dernières valeurs écrites pour ne pas réécrire des clés inchangées.
  const _persistSnapshotRef = useRef<Record<string, string | null>>({});

  useEffect(() => {
    if (!restored) return;
    if (_persistTimerRef.current) clearTimeout(_persistTimerRef.current);
    _persistTimerRef.current = setTimeout(() => {
      _persistTimerRef.current = null;
      const next: Record<string, string | null> = {
        senso_mode: mode,
        senso_screen: screen,
        senso_admin_section: adminSection,
        senso_cj: cj,
        senso_cs: cs.toString(),
        senso_curEditTab: curEditTab,
        senso_curAnT: curAnT,
        senso_curSessId: curSessId,
        senso_editSessId: editSessId,
        senso_anSessId: anSessId,
      };
      const prev = _persistSnapshotRef.current;
      try {
        for (const key in next) {
          const v = next[key];
          if (prev[key] === v) continue;
          if (v == null || v === "") {
            // Valeurs nulles/vides : retirées plutôt que persistées en chaîne vide.
            if (key === "senso_cj" || key === "senso_cs") {
              localStorage.setItem(key, v ?? "");
            } else {
              localStorage.removeItem(key);
            }
          } else {
            localStorage.setItem(key, v);
          }
        }
        _persistSnapshotRef.current = next;
      } catch (err) {
        console.warn("Persistance localStorage échouée:", err);
      }
    }, 200);
    return () => {
      if (_persistTimerRef.current) {
        clearTimeout(_persistTimerRef.current);
        _persistTimerRef.current = null;
      }
    };
  }, [restored, mode, screen, adminSection, cj, cs, curEditTab, curAnT, curSessId, editSessId, anSessId]);

  // Online/offline detection
  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Load session list and restore state on mount
  useEffect(() => {
    const restoreApp = async () => {
      setLoading(true);
      const loadedSessions = await loadSessions(true);
      const joinableSessionIds = new Set(loadedSessions.filter(session => session.active).map(session => session.id));

      const savedMode = localStorage.getItem("senso_mode");
      const savedScreen = localStorage.getItem("senso_screen");
      const savedSessId = localStorage.getItem("senso_curSessId");
      const savedCj = localStorage.getItem("senso_cj");
      const savedCs = localStorage.getItem("senso_cs");
      const savedEditSessId = localStorage.getItem("senso_editSessId");
      const savedEditTab = localStorage.getItem("senso_curEditTab");
      const savedAnSessId = localStorage.getItem("senso_anSessId");
      const savedAnT = localStorage.getItem("senso_curAnT");
      const savedAdminSection = localStorage.getItem("senso_admin_section");

      // Auth admin locale de session. Conservée pour l'affichage immédiat au
      // rechargement ; la vérité vient du serveur, demandée juste après.
      if (sessionStorage.getItem("admin_auth") === "1") setAdminAuth(true);

      void fetch("/api/admin/session", { cache: "no-store" })
        .then(r => r.json())
        .then((d: { authenticated?: boolean; roles?: string[] }) => {
          if (d.authenticated) {
            setAdminAuth(true);
            sessionStorage.setItem("admin_auth", "1");
            setCapacites(Array.isArray(d.roles) ? d.roles : []);
          } else {
            // Session expirée côté serveur : le drapeau local mentait.
            sessionStorage.removeItem("admin_auth");
            setAdminAuth(false);
            setCapacites([]);
          }
        })
        .catch(() => undefined);

      if (isStoredChoice(savedMode, APP_MODES)) setMode(savedMode);
      if (isStoredChoice(savedScreen, APP_SCREENS)) setScreen(savedScreen);
      if (isStoredChoice(savedAdminSection, ADMIN_SECTIONS)) setAdminSection(savedAdminSection);

      const promises: Promise<unknown>[] = [];

      if (savedEditSessId) {
        setEditSessId(savedEditSessId);
        promises.push(loadSessionConfig(savedEditSessId).then(cfg => {
          if (cfg) setEditCfg(cfg);
        }));
      }
      if (savedEditTab) setCurEditTab(savedEditTab);
      if (savedAnT) setCurAnT(savedAnT);
      const savedStep = parseStoredStep(savedCs);
      if (savedStep !== null) setCs(savedStep);

      if (savedSessId && joinableSessionIds.has(savedSessId)) {
        const restoredSession = loadedSessions.find(session => session.id === savedSessId);
        setCurSessId(savedSessId);
        promises.push(loadSessionData(savedSessId, restoredSession?.slotDate || restoredSession?.date).then(async () => {
          if (savedCj) {
            setCj(savedCj);
            await reloadJuryData(savedSessId, savedCj);
          }
        }));
      } else if (savedSessId) {
        localStorage.removeItem("senso_curSessId");
        localStorage.removeItem("senso_screen");
        setCurSessId(null);
        setCurSess(null);
        setScreen("landing");
      }

      if (savedAnSessId) {
        promises.push(handleAnSessChange(savedAnSessId));
      }
      
      await Promise.all(promises);
      
      setRestored(true);
      setLoading(false);
    };

    void restoreApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadJuryData = useCallback(async (sessionId: string, jurorName: string) => {
    try {
      const payload = await accessParticipantAnswers(sessionId, jurorName);
      const answers = payload.data || {};
      answerRevisionRef.current.set(participantIdentityKey(sessionId, jurorName), payload.revision || 0);
      setJa(answers);
      setTakenPostes(payload.takenPostes || {});
      const p = readPoste(answers);
      if (p) setPoste(p);
    } catch (error) {
      logDataError("Erreur lors de la reprise du questionnaire:", error);
      setCj("");
      setJa({});
      setPoste(null);
      setScreen("jury");
    }
  }, []);

  const loadSessions = useCallback(async (keepLoading?: boolean): Promise<SessionListItem[]> => {
    if (!keepLoading) setLoading(true);
    try {
      const savedMode = typeof window !== "undefined" ? localStorage.getItem("senso_mode") : null;
      const admin = stateRef.current.mode === "admin" || (stateRef.current.mode === "home" && savedMode === "admin");
      const response = await fetch(admin ? "/api/admin/sessions" : "/api/public/sessions", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({})) as { sessions?: SessionListItem[]; error?: string };
      if (!response.ok || !payload.sessions) throw new Error(payload.error || "Chargement impossible.");
      const next = payload.sessions;
      setOnline(true);
      setSessions(prev => {
        if (prev.length === next.length) {
          let same = true;
          for (let i = 0; i < prev.length; i++) {
            const a = prev[i], b = next[i];
            if (a.id !== b.id || a.name !== b.name || a.date !== b.date ||
                a.active !== b.active || a.jurorCount !== b.jurorCount ||
                a.productCount !== b.productCount || a.questionCount !== b.questionCount ||
                a.resultsVisible !== b.resultsVisible ||
                a.hasSlotSchedule !== b.hasSlotSchedule ||
                a.slotDate !== b.slotDate ||
                (a.slotDates || []).join("|") !== (b.slotDates || []).join("|")) {
              same = false;
              break;
            }
          }
          if (same) return prev;
        }
        return next;
      });
      if (!keepLoading) setLoading(false);
      return next;
    } catch (error) {
      logDataError("Erreur lors du chargement des séances:", error);
      setOnline(false);
      if (!keepLoading) setLoading(false);
      return [];
    }
  }, []);

  // Lecture du cache : on accepte une entrée fraîche (< TTL) sauf si `force` est demandé.
  // Les entrées expirées sont supprimées pour ne pas grossir la map indéfiniment.
  const loadSessionConfig = useCallback(async (
    id: string,
    opts?: { force?: boolean }
  ): Promise<SessionConfig | null> => {
    const savedMode = typeof window !== "undefined" ? localStorage.getItem("senso_mode") : null;
    const admin = stateRef.current.mode === "admin" || (stateRef.current.mode === "home" && savedMode === "admin");
    const cacheKey = configCacheKey(id, admin);
    const cached = _configCache.get(cacheKey);
    const now = Date.now();
    if (!opts?.force && cached && (now - cached.ts) < CONFIG_CACHE_TTL_MS) {
      return cached.cfg;
    }
    if (cached && (now - cached.ts) >= CONFIG_CACHE_TTL_MS) {
      _configCache.delete(cacheKey);
    }
    const endpoint = admin
      ? `/api/admin/sessions/${encodeURIComponent(id)}`
      : `/api/public/sessions/${encodeURIComponent(id)}`;
    const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json().catch(() => ({})) as {
      config?: SessionConfig;
      revision?: number;
      takenPostes?: Record<string, string>;
      error?: string;
    };
    if (!response.ok || !payload.config) {
      logDataError("Erreur lors du chargement de la config:", payload.error || response.statusText);
      return null;
    }
    const cfg = payload.config;
    _configCache.set(cacheKey, { cfg, ts: now, revision: payload.revision || 0 });
    if (!admin && payload.takenPostes) setTakenPostes(payload.takenPostes);
    return cfg;
  }, []);

  const posteKey = (p: Poste) => `${p.day}-${p.num}`;
  const readPoste = (jaData: JurorAnswers | null | undefined): Poste | null => {
    const meta = asRecord(jaData?.["_poste"]);
    const day = meta.day;
    const num = meta.num;
    if (isPosteDay(day) && isValidPosteNumber(num)) {
      return { day, num };
    }
    return null;
  };
  const loadSessionData = useCallback(async (id: string, displayDateOverride?: string | null) => {
    const cfg = await loadSessionConfig(id);
    if (!cfg) return null;
    const listedSession = stateRef.current.sessions.find(session => session.id === id);
    const displayDate = displayDateOverride || listedSession?.slotDate || listedSession?.date || cfg.date;
    setCurSess({ ...cfg, date: displayDate });
    setJurors([]);
    return cfg;
  }, [loadSessionConfig]);

  const handleSelectSession = useCallback(async (id: string) => {
    let session = stateRef.current.sessions.find(item => item.id === id);
    if (!session?.active) {
      const refreshed = await loadSessions(true);
      session = refreshed.find(item => item.id === id);
    }
    if (!session?.active) {
      setCurSessId(null);
      setCurSess(null);
      setScreen("landing");
      return;
    }
    const cfg = await loadSessionData(id, session.slotDate || session.date);
    if (!cfg) return;
    setCurSessId(id);
    setScreen("jury");
  }, [loadSessionData, loadSessions]);

  const buildSteps = useCallback((cfg: SessionConfig, jurorName: string, jurorList?: string[], posteOverride?: Poste | null) => {
    const jl = jurorList || stateRef.current.jurors;
    const effectivePoste = (posteOverride !== undefined) ? posteOverride : stateRef.current.poste;
    return buildSessionSteps(cfg, { jurorName, jurorList: jl, poste: effectivePoste });
  }, []);

  const handleLoginJury = useCallback(async (name: string, opts?: { review?: boolean }) => {
    const { curSessId, curSess, jurors } = stateRef.current;
    if (!name || !curSessId || !curSess) return;
    let payload: ParticipantAccessPayload;
    try {
      payload = await accessParticipantAnswers(curSessId, name);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Identification impossible.";
      alert(message);
      return;
    }
    const answers = payload.data || {};
    setCj(name);
    setJa(answers);
    setTakenPostes(payload.takenPostes || {});
    answerRevisionRef.current.set(participantIdentityKey(curSessId, name), payload.revision || 0);

    // Si le jury a déjà finalisé sa séance, on l'envoie directement sur l'écran
    // "Terminé !" plutôt que sur le dernier échantillon. La relecture ("Revoir
    // mes réponses") force l'entrée dans le formulaire via opts.review.
    if (!opts?.review && answers["_finished"] === true) {
      const existing = readPoste(answers);
      if (existing) setPoste(existing);
      setScreen("done");
      return;
    }

    // Si le jury a déjà un poste enregistré (reprise), on saute l'écran de sélection.
    const existing = readPoste(answers);
    if (existing) {
      setPoste(existing);
      const jl = jurors.includes(name) ? jurors : [...jurors, name];
      const steps = buildSteps(curSess, name, jl, existing);
      let firstIncomplete = 0;
      for (let i = 0; i < steps.length; i++) {
        if (!isStepValidated(steps[i], answers)) {
          firstIncomplete = i;
          break;
        }
        if (i === steps.length - 1) firstIncomplete = i;
      }
      setCs(firstIncomplete);
      setScreen("form");
      return;
    }

    setPoste(null);
    setScreen("poste");
  }, [buildSteps]);

  const handleSelectPoste = useCallback(async (day: PosteDay, num: number) => {
    const { curSess, curSessId, cj, ja, takenPostes } = stateRef.current;
    if (!curSess || !curSessId || !cj) return;
    const p: Poste = { day, num };
    const key = posteKey(p);
    if (takenPostes[key] && takenPostes[key] !== cj) return; // déjà pris par un autre
    const token = getParticipantToken(curSessId, cj);
    const identity = participantIdentityKey(curSessId, cj);
    const response = await fetch("/api/public/answers/poste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: curSessId,
        jurorName: cj,
        token,
        revision: answerRevisionRef.current.get(identity) || 0,
        day,
        num,
      }),
    });
    const payload = await response.json().catch(() => ({})) as ParticipantAccessPayload;
    if (!response.ok || !payload.ok) {
      if (payload.takenPostes) setTakenPostes(payload.takenPostes);
      alert(payload.message || "Ce poste n'est plus disponible.");
      return;
    }
    const next = payload.data || { ...ja, _poste: { day, num } as Record<string, string | number> };
    answerRevisionRef.current.set(identity, payload.revision || 0);
    setPoste(p);
    setJa(next);
    setTakenPostes(payload.takenPostes || { ...takenPostes, [key]: cj });
    setCs(0);
    // L'écran "order" affiche l'ordre de service personnel avant le questionnaire.
    setScreen("order");
  }, []);

  // Upsert différé : on agrège les saisies rapides (sliders, drag) en une seule requête.
  const _saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const _pendingJaRef = useRef<JurorAnswers | null>(null);
  const _saveInFlightRef = useRef<Promise<void> | null>(null);

  const flushSave = useCallback(async () => {
    if (_saveTimerRef.current) {
      clearTimeout(_saveTimerRef.current);
      _saveTimerRef.current = null;
    }
    if (_saveInFlightRef.current) {
      await _saveInFlightRef.current;
      return;
    }

    const run = async () => {
      while (_pendingJaRef.current) {
        const newJa = _pendingJaRef.current;
        _pendingJaRef.current = null;
        const { cj, curSessId } = stateRef.current;
        if (!cj || !curSessId) continue;
        const identity = participantIdentityKey(curSessId, cj);
        const token = getParticipantToken(curSessId, cj);
        setSaveStatus("saving");

        let saved = false;
        let failure: unknown = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await fetch("/api/public/answers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: curSessId,
                jurorName: cj,
                token,
                revision: answerRevisionRef.current.get(identity) || 0,
                data: newJa,
              }),
            });
            const payload = await response.json().catch(() => ({})) as ParticipantAccessPayload;
            if (response.status === 409 && payload.code === "revision_conflict" && typeof payload.revision === "number") {
              answerRevisionRef.current.set(identity, payload.revision);
              continue;
            }
            if (!response.ok || !payload.ok) throw new Error(payload.message || "Enregistrement impossible.");
            answerRevisionRef.current.set(identity, payload.revision || 0);
            saved = true;
            break;
          } catch (error) {
            failure = error;
            break;
          }
        }

        if (!saved) {
          console.warn("Enregistrement échoué, mise en file d'attente locale:", failure);
          queuePending(curSessId, cj, newJa);
          setPendingCount(countPending());
          setSaveStatus("pending");
          continue;
        }
        clearPending(curSessId, cj);
        setPendingCount(countPending());
        setSaveStatus("saved");
        setJurors(prev => prev.includes(cj) ? prev : [...prev, cj]);
      }
    };

    const promise = run().finally(() => { _saveInFlightRef.current = null; });
    _saveInFlightRef.current = promise;
    await promise;
  }, []);

  // Accepte soit un objet `JurorAnswers` complet, soit un updater fonctionnel
  // (à la `useState`). Le mode fonctionnel résout une race courante : le
  // cleanup d'un useEffect (par ex. l'enregistrement du `_timing` du step)
  // s'exécute pendant le commit de démontage avec un état précédent figé
  // du render précédent — il écrasait alors `_finished: true` posé juste
  // avant `setScreen("done")`. En lisant `stateRef.current.ja`, on récupère
  // toujours la version la plus récente.
  type JaUpdater = JurorAnswers | ((prev: JurorAnswers) => JurorAnswers);
  const handleSetJa = useCallback((updater: JaUpdater) => {
    const prev = stateRef.current.ja;
    const newJa = typeof updater === "function" ? (updater as (p: JurorAnswers) => JurorAnswers)(prev) : updater;
    setJa(newJa);
    const { cj, curSessId } = stateRef.current;
    if (!cj || !curSessId) return;
    _pendingJaRef.current = newJa;
    if (_saveTimerRef.current) clearTimeout(_saveTimerRef.current);
    _saveTimerRef.current = setTimeout(() => { void flushSave(); }, 400);
  }, [flushSave]);

  const requestHelp = useCallback(async () => {
    const { curSessId, cj, cs } = stateRef.current;
    if (!curSessId || !cj) return { success: false };
    const request = createHelpRequest(cs);
    handleSetJa(prev => appendHelpRequest(prev, request));
    await flushSave();
    return { success: true };
  }, [handleSetJa, flushSave]);

  // Flush de la file d'attente hors-ligne dès qu'on est en ligne (montage + bascule online).
  const flushPending = useCallback(async () => {
    const entries = listPending();
    if (entries.length === 0) { setPendingCount(0); return; }
    const results = await Promise.all(entries.map(async e => {
      try {
        const access = await accessParticipantAnswers(e.sessionId, e.jurorName);
        const response = await fetch("/api/public/answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: e.sessionId,
            jurorName: e.jurorName,
            token: access.token,
            revision: access.revision || 0,
            data: e.data,
          }),
        });
        const payload = await response.json().catch(() => ({})) as ParticipantAccessPayload;
        if (!response.ok || !payload.ok) throw new Error(payload.message || "Synchronisation impossible.");
        answerRevisionRef.current.set(
          participantIdentityKey(e.sessionId, e.jurorName),
          payload.revision || 0
        );
        return { e, error: null };
      } catch (error) {
        return { e, error };
      }
    }));
    let ok = 0;
    for (const { e, error } of results) {
      if (!error) { clearPending(e.sessionId, e.jurorName); ok++; }
    }
    setPendingCount(countPending());
    if (ok > 0 && stateRef.current.saveStatus !== "saving") setSaveStatus("saved");
  }, []);

  useEffect(() => {
    setPendingCount(countPending());
  }, []);

  useEffect(() => {
    if (online) void flushPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // Rafraîchissement périodique de la liste des séances tant qu'on regarde
  // le tableau (landing participant ou liste admin). Sans cela, le compteur
  // de jurys reste figé à la valeur lue au montage ; les arrivées d'autres
  // postes ne remontent jamais à l'écran. On étend aussi ce polling à l'écran
  // "Terminé !" (intervalle 5 s) pour que le bouton "Voir les résultats" se
  // débloque sans rechargement dès que l'animateur l'autorise. On évite de
  // tourner si l'onglet est masqué (visibilitychange) pour ne pas générer de
  // trafic inutile.
  useEffect(() => {
    if (!restored) return;
    if (screen !== "landing" && screen !== "done") return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      void loadSessions(true);
    };
    const intervalMs = screen === "done" ? 5_000 : 10_000;
    const id = setInterval(tick, intervalMs);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [restored, screen, loadSessions]);

  // Flush la sauvegarde différée à chaque changement d'étape (sécurité supplémentaire).
  useEffect(() => {
    if (_pendingJaRef.current) void flushSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cs]);

  // Flush au démontage pour éviter les pertes lors d'une navigation.
  useEffect(() => {
    return () => { if (_pendingJaRef.current) void flushSave(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Masque le statut "saved" après 1,5s ; "error" reste affiché (l'utilisateur doit voir).
  useEffect(() => {
    if (saveStatus !== "saved") return;
    const t = setTimeout(() => setSaveStatus("idle"), 1500);
    return () => clearTimeout(t);
  }, [saveStatus]);

  // Steps mémoïsés pour le jury courant — recalculés quand l'identité de
  // présentation change. Le poste doit faire partie des dépendances : sinon
  // l'ordre calculé avant sa sélection reste affiché jusqu'au rechargement.
  const currentSteps = useMemo<SessionStep[]>(() => {
    if (!curSess || !cj) return [];
    return buildSteps(curSess, cj, jurors, poste);
  }, [curSess, cj, jurors, poste, buildSteps]);

  // Vérifie la complétion d'un step donné contre un état de réponses.
  // Pour les questions "scale" on exige une validation explicite : le jury
  // doit avoir tapé/glissé le pouce du curseur (drapeau `_touched` posé par
  // ScaleInput). Le format ancien (valeur brute number) est considéré comme
  // déjà validé pour la rétrocompatibilité.
  // Tableau de complétion par étape — calculé une seule fois par changement de ja/steps.
  const completion = useMemo<boolean[]>(
    () => currentSteps.map(s => isStepDone(s, ja)),
    [currentSteps, ja]
  );
  const validatedCompletion = useMemo<boolean[]>(
    () => currentSteps.map(s => isStepValidated(s, ja)),
    [currentSteps, ja]
  );

  // Indique si l'étape courante est complète (gate Suivant). Référence stable :
  // lit completion via une ref synchronisée pour ne pas se rebuilder à chaque render.
  const completionRef = useRef<boolean[]>(completion);
  completionRef.current = completion;
  const isStepComplete = useCallback((stepIdx: number): boolean => {
    return completionRef.current[stepIdx] ?? true;
  }, []);

  const handleAnSessChange = useCallback(async (id: string) => {
    setAnSessId(id);
    const participantMode = stateRef.current.mode === "participant";
    const endpoint = participantMode
      ? `/api/public/sessions/${encodeURIComponent(id)}/summary`
      : `/api/admin/sessions/${encodeURIComponent(id)}/answers`;
    const [cfg, response] = await Promise.all([
      participantMode ? Promise.resolve(null) : loadSessionConfig(id),
      fetch(endpoint, { cache: "no-store", credentials: "same-origin" }),
    ]);
    const payload = await response.json().catch(() => ({})) as {
      config?: SessionConfig;
      answers?: AllAnswers;
      error?: string;
    };
    if (!response.ok || !payload.answers) {
      logDataError("Erreur lors du chargement des réponses:", payload.error || response.statusText);
      setAllAnswers({});
      return;
    }
    setAnCfg(participantMode ? payload.config || null : cfg);
    setAllAnswers(payload.answers);
  }, [loadSessionConfig]);

  const saveSession = useCallback(async (id: string, cfg: SessionConfig, meta: Partial<SessionListItem>) => {
    const cacheKey = configCacheKey(id, true);
    const expectedRevision = _configCache.get(cacheKey)?.revision;
    const response = await fetch("/api/admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ id, cfg, meta, expectedRevision }),
    });
    const payload = await response.json().catch(() => ({})) as {
      ok?: boolean;
      error?: string;
      detail?: string;
      details?: string[];
      revision?: number | string;
    };

    if (!response.ok || !payload.ok) {
      if (response.status === 401) {
        sessionStorage.removeItem("admin_auth");
        setAdminAuth(false);
      }
      logDataError("Erreur lors de l'enregistrement de la séance:", payload);
      return { success: false, error: payload };
    }
    _configCache.set(cacheKey, { cfg, ts: Date.now(), revision: Number(payload.revision || 0) });
    return { success: true };
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    const response = await fetch(`/api/admin/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      logDataError("Erreur lors de la suppression de la séance:", payload);
    }
    _configCache.delete(configCacheKey(id, true));
    _configCache.delete(configCacheKey(id, false));
  }, []);

  const listJurorsForSession = useCallback(async (sessionId: string): Promise<string[]> => {
    const response = await fetch(`/api/admin/sessions/${encodeURIComponent(sessionId)}/answers`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const payload = await response.json().catch(() => ({})) as { answers?: AllAnswers; error?: string };
    if (!response.ok || !payload.answers) {
      logDataError("Erreur lors du listage des jurys:", payload.error || response.statusText);
      return [];
    }
    return Object.keys(payload.answers);
  }, []);

  const deleteJury = useCallback(async (sessionId: string, name: string) => {
    if (!sessionId) return { success: false };
    const response = await fetch(`/api/admin/sessions/${encodeURIComponent(sessionId)}/answers`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ jurorName: name }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      logDataError("Erreur lors de la suppression du jury:", payload);
      return { success: false };
    }
    const { curSessId, jurors, cj } = stateRef.current;
    if (sessionId === curSessId) {
      const newJurors = jurors.filter(j => j !== name);
      setJurors(newJurors);
      if (cj === name) { setCj(""); setJa({}); }
    }
    const remaining = await listJurorsForSession(sessionId);
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, jurorCount: remaining.length } : s
    ));
    // Remove from in-memory allAnswers if loaded
    setAllAnswers(prev => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    return { success: true };
  }, [listJurorsForSession]);

  // Bascule l'affichage du résumé d'analyse côté participant. Stocké en
  // colonne dédiée pour pouvoir être basculé sans réécrire `config`, et lu
  // par le polling de la liste : tous les jurys verront le bouton passer
  // au vert dans la fenêtre de polling suivante.
  const toggleResultsVisible = useCallback(async (id: string) => {
    const { sessions } = stateRef.current;
    const s = sessions.find(x => x.id === id);
    if (!s) return;
    const next = !s.resultsVisible;
    const response = await fetch(`/api/admin/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ resultsVisible: next }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      logDataError("Erreur lors de la modification de la visibilité des résultats:", payload);
      return;
    }
    setSessions(prev => prev.map(x => x.id === id ? { ...x, resultsVisible: next } : x));
  }, []);

  // csvData a été extrait dans `lib/csv.ts` (`buildCsvData`) et est désormais
  // calculé à la demande dans AnalyseView via un useMemo local. Le maintenir
  // ici forçait un recalcul à chaque saisie participante alors que personne
  // ne le consommait hors de l'écran d'analyse.

  // Groupe "actions" : toutes les références sont stables (useState setters ou
  // useCallback à deps vides), donc ce useMemo ne se ré-évalue jamais après le
  // premier render. Permet à AppProviders d'exposer un contexte d'actions séparé
  // dont les consommateurs ne se ré-rendront pas sur les changements d'état.
  const actions = useMemo(() => ({
    setMode, setScreen, setAdminAuth, setCs,
    setEditCfg, setEditSessId, setCurEditTab,
    setAnSessId, setCurAnT, setAdminSection,
    loadSessionConfig, loadSessions,
    handleSelectSession, handleLoginJury, handleSelectPoste,
    handleSetJa, requestHelp, handleAnSessChange,
    saveSession, deleteSession, deleteJury,
    listJurorsForSession, toggleResultsVisible,
    isStepComplete,
    flushPending, flushSave,
    // Les useState setters sont stables par contrat React et n'ont pas besoin
    // d'être listés en deps.
  }), [
    loadSessionConfig, loadSessions,
    handleSelectSession, handleLoginJury, handleSelectPoste,
    handleSetJa, requestHelp, handleAnSessChange,
    saveSession, deleteSession, deleteJury,
    listJurorsForSession, toggleResultsVisible,
    isStepComplete, flushPending, flushSave,
  ]);

  // Groupe "state" : valeurs réactives + dérivées. Bust à chaque changement d'état,
  // ce qui est attendu — les consommateurs qui n'ont pas besoin de l'état peuvent
  // s'abonner uniquement à `actions`.
  const state = useMemo(() => ({
    mode, screen, sessions, loading, restored, adminAuth, capacites, online,
    curSessId, curSess,
    jurors, cj, ja, cs,
    poste, takenPostes,
    editCfg, editSessId, curEditTab,
    anSessId, anCfg, allAnswers, curAnT,
    adminSection, saveStatus, pendingCount,
    currentSteps, completion, validatedCompletion,
  }), [
    mode, screen, sessions, loading, restored, adminAuth, capacites, online,
    curSessId, curSess,
    jurors, cj, ja, cs,
    poste, takenPostes,
    editCfg, editSessId, curEditTab,
    anSessId, anCfg, allAnswers, curAnT,
    adminSection, saveStatus, pendingCount,
    currentSteps, completion, validatedCompletion,
  ]);

  return { state, actions };
};

// Types publics pour les consommateurs et les contextes.
export type SensoState = ReturnType<typeof useSenso>["state"];
export type SensoActions = ReturnType<typeof useSenso>["actions"];
