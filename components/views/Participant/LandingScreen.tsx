"use client";
import React, { useEffect, useState } from "react";
import { FiCalendar, FiClipboard } from "react-icons/fi";
import { SessionCard } from "../../features/SessionCard";
import { SessionListItem } from "../../../types";
import { SlotSignupView } from "./SlotSignupView";
import { formatSlotDateLong } from "../../../lib/slots/dates";

interface LandingScreenProps {
  sessions: SessionListItem[];
  onSelectSession: (id: string) => void;
}

type ParticipantLandingPanel = "sessions" | "slots";

const panelButtonClass = (active: boolean) => [
  "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition-[background,border-color,color,box-shadow] duration-150",
  active
    ? "border-[var(--primary)] bg-[rgba(98,141,23,.10)] text-[var(--primary)] shadow-[var(--shadow)]"
    : "border-[var(--border)] bg-[var(--paper)] text-[var(--mid)] hover:border-[var(--border-strong)] hover:text-[var(--ink)]",
].join(" ");

export const LandingScreen = ({ sessions, onSelectSession }: LandingScreenProps) => {
  const [activePanel, setActivePanel] = useState<ParticipantLandingPanel>("sessions");
  const activeSessions = sessions.filter(s => s.active);

  /**
   * Le panneau d'inscription n'apparaît que si des créneaux existent.
   *
   * Le jury n'est pas authentifié : contrairement à l'espace d'animation, il
   * n'y a ici aucun rôle sur lequel se fonder. Le critère est donc la réalité
   * des données — une cidrerie qui invite ses dégustateurs par lien ou QR code
   * n'ouvre jamais de créneau, et ne verra jamais ce panneau ; un panel
   * institutionnel en ouvre, et le retrouve.
   *
   * L'avantage sur un réglage : rien à configurer, et aucune façon de se
   * tromper.
   */
  const [creneauxDisponibles, setCreneauxDisponibles] = useState(false);

  useEffect(() => {
    let annule = false;
    fetch("/api/public/slots", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : { slots: [] }))
      .then((d: { slots?: unknown[] }) => {
        if (!annule) setCreneauxDisponibles(Array.isArray(d.slots) && d.slots.length > 0);
      })
      .catch(() => undefined);
    return () => { annule = true; };
  }, []);

  return (
    <div className="mx-auto max-w-[min(94%,1500px)] px-7 py-12 text-center max-[480px]:px-3.5 max-[480px]:py-6">
      <h1 className="mb-2.5 text-4xl font-extrabold leading-[1.08] tracking-normal text-[var(--ink)] max-[480px]:text-2xl max-[480px]:leading-tight">
        Bienvenue sur<br /><span className="text-[var(--accent)]">CiderScope</span>
      </h1>
      <p className="mb-6 text-[15px] text-[var(--mid)] max-[480px]:mb-5 max-[480px]:text-[13px]">
        Choisissez votre action.
      </p>

      <div className="mx-auto mb-8 flex max-w-[760px] flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--paper2)] p-1.5 sm:flex-row">
        <button
          type="button"
          className={panelButtonClass(activePanel === "sessions")}
          onClick={() => setActivePanel("sessions")}
        >
          <FiClipboard /> Rejoindre une séance
        </button>
        {creneauxDisponibles && (
          <button
            type="button"
            className={panelButtonClass(activePanel === "slots")}
            onClick={() => setActivePanel("slots")}
          >
            <FiCalendar /> S&apos;inscrire ou annuler un créneau
          </button>
        )}
      </div>

      {activePanel === "slots" && creneauxDisponibles && <SlotSignupView />}

      {activePanel === "sessions" && (
        <>
          <div className="mb-4 text-left">
            <h2 className="text-xl font-extrabold text-[var(--ink)]">Questionnaire en cours</h2>
          </div>
          <div className="text-left md:grid md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] md:gap-2.5 lg:grid-cols-[repeat(auto-fill,minmax(270px,1fr))] lg:gap-3 xl:grid-cols-[repeat(auto-fill,minmax(290px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
            {activeSessions.length === 0 ? (
              <div className="rounded-[var(--radius)] border-2 border-dashed border-[var(--border)] bg-[var(--paper2)] p-10 text-center text-[15px] text-[var(--mid)]">
                <FiClipboard size={36} className="mx-auto mb-2 block text-[var(--mid)]" />
                <strong>Aucune séance active</strong>
              </div>
            ) : (
              activeSessions.map(s => (
                <SessionCard
                  key={s.id}
                  name={formatSlotDateLong(s.date)}
                  date=""
                  jurorCount={s.jurorCount}
                  productCount={s.productCount}
                  questionCount={s.questionCount}
                  onClick={() => onSelectSession(s.id)}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
