"use client";
import React, { useEffect, useState } from "react";
import { FiArrowLeft, FiArrowRight, FiShield } from "react-icons/fi";
import { Button } from "../../ui/Button";
import { SessionConfig } from "../../../types";
import { formatSlotDateLong } from "../../../lib/slots/dates";

interface JuryLoginScreenProps {
  curSess: SessionConfig | null;
  jurors: string[];
  onLoginJury: (name: string) => void;
  onGoBack: () => void;
}

type CompteJury = { user: string } | null;

export const JuryLoginScreen = ({ curSess, onLoginJury, onGoBack }: JuryLoginScreenProps) => {
  const [name, setName] = useState("");
  const [compte, setCompte] = useState<CompteJury>(null);
  const [padocAvailable, setPadocAvailable] = useState(false);
  const submit = () => { if (name.trim()) onLoginJury(name.trim()); };

  // La connexion PADOC reste facultative pour un jury : elle pré-remplit le
  // nom et rattache les réponses au compte, mais le prénom seul suffit.
  useEffect(() => {
    let annule = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { authenticated?: boolean; user?: string; padocAvailable?: boolean }) => {
        if (annule) return;
        setPadocAvailable(Boolean(d.padocAvailable));
        if (d.authenticated && d.user) {
          setCompte({ user: d.user });
          setName(prev => prev || d.user || "");
        }
      })
      .catch(() => undefined);
    return () => { annule = true; };
  }, []);

  const seDeconnecter = () => {
    void fetch("/api/auth/logout", { method: "POST" })
      .catch(() => undefined)
      .finally(() => {
        setCompte(null);
        setName("");
      });
  };

  return (
    <div className="mx-auto max-w-[480px] px-7 py-12 text-center max-[480px]:px-3.5 max-[480px]:py-6">
      <h2 className="mb-1.5 text-[26px] font-bold">Identifiez-vous</h2>
      <p className="mb-6 text-[15px] text-[var(--mid)]">{curSess ? formatSlotDateLong(curSess.date) : ""}</p>

      {compte && (
        <p className="mb-4 text-sm text-[var(--mid)]">
          Connecté avec PADOC : <strong className="text-[var(--ink)]">{compte.user}</strong>
          {" · "}
          <button type="button" onClick={seDeconnecter} className="underline hover:text-[var(--ink)]">
            ce n&apos;est pas moi
          </button>
        </p>
      )}

      <input
        type="text"
        placeholder="Votre prénom..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoFocus
        className="mb-4 min-h-[52px] w-full rounded-xl border border-[var(--border)] bg-[var(--paper)] p-4 text-center text-[19px] font-semibold text-[var(--ink)] outline-none transition-[border-color,box-shadow] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--ring)]"
      />
      <Button onClick={submit}>
        Commencer <FiArrowRight />
      </Button>

      {!compte && padocAvailable && (
        <a
          href="/api/auth/ifpc/login?returnTo=/"
          className="mt-4 inline-flex items-center justify-center gap-2 text-sm font-semibold text-[var(--mid)] hover:text-[var(--ink)]"
        >
          <FiShield /> Se connecter avec PADOC
        </a>
      )}

      <div>
        <Button variant="ghost" size="sm" className="mt-4" onClick={onGoBack}><FiArrowLeft /> Retour</Button>
      </div>
    </div>
  );
};
