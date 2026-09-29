"use client";

import React, { useEffect, useState } from "react";
import { FiChevronRight, FiLock, FiShield } from "react-icons/fi";

/**
 * Ce que l'utilisateur lit quand PADOC l'a renvoyé sans session.
 *
 * Chaque clé correspond à un refus émis par la route de retour. Le détail
 * technique reste au journal : ici on dit ce qu'il faut faire, pas ce qui
 * s'est passé.
 */
const MOTIFS_PADOC: Record<string, string> = {
  "sans-role": "Votre compte PADOC est reconnu, mais il n'a pas encore reçu le droit d'animer des séances sur CiderScope. Demandez-le à un administrateur PADOC.",
  refus: "La connexion a été interrompue. Si votre compte n'a pas accès à CiderScope, un administrateur PADOC doit vous l'accorder.",
  expire: "La demande de connexion a expiré. Relancez-la.",
  invalide: "La demande de connexion n'a pas pu être vérifiée. Relancez-la depuis cette page.",
  incomplet: "Réponse incomplète de PADOC. Relancez la connexion.",
  indisponible: "La connexion PADOC n'est pas configurée sur cette instance.",
  echec: "La connexion avec PADOC a échoué. Réessayez, ou utilisez un identifiant.",
};

interface AdminLoginViewProps {
  onSuccess: () => void;
}

export const AdminLoginView = ({ onSuccess }: AdminLoginViewProps) => {
  const [login, setLogin] = useState("");
  const [mdp, setMdp] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [padocAvailable, setPadocAvailable] = useState(false);

  // Le bouton PADOC n'apparaît que si l'instance est configurée pour :
  // proposer une connexion qui répondra 503 serait pire que ne rien proposer.
  useEffect(() => {
    let annule = false;
    fetch("/api/admin/session", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { padocAvailable?: boolean }) => {
        if (!annule) setPadocAvailable(Boolean(d.padocAvailable));
      })
      .catch(() => undefined);
    return () => { annule = true; };
  }, []);

  const motifPadoc = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("connexion");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setBusy(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password: mdp }),
      });

      if (response.ok) {
        sessionStorage.setItem("admin_auth", "1");
        setError(false);
        onSuccess();
      } else {
        setError(true);
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-52px)] flex-col justify-center bg-[var(--bg)] px-6 py-12 font-sans text-[var(--ink)] sm:min-h-[calc(100dvh-60px)] lg:px-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary)] shadow-lg shadow-[var(--primary)]/20">
          <FiLock className="text-2xl text-white" />
        </div>
        <h2 className="mt-10 text-center text-2xl font-bold tracking-tight text-[var(--ink)]">
          Accès Administration
        </h2>
        <p className="mt-2 text-center text-sm text-[var(--mid)]">
          Identifiez-vous pour gérer les séances CiderScope
        </p>
      </div>

      <div className="mx-auto mt-10 w-full max-w-sm">
        {motifPadoc && (
          <div className="mb-6 rounded-md border border-[color-mix(in_srgb,var(--warn)_30%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-4 py-3 text-sm text-[var(--ink)]">
            {MOTIFS_PADOC[motifPadoc] || MOTIFS_PADOC.echec}
          </div>
        )}

        {padocAvailable && (
          <div className="mb-8">
            <a
              href="/api/auth/ifpc/login?returnTo=/"
              className="group flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--paper)] px-3 py-2.5 text-sm font-semibold text-[var(--ink)] shadow-sm transition-all hover:border-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] active:scale-[0.98]"
            >
              <FiShield className="text-[var(--primary)]" />
              <span>Se connecter avec PADOC</span>
              <FiChevronRight className="transition-transform group-hover:translate-x-1" />
            </a>
            <p className="mt-2 text-center text-xs text-[var(--mid)]">
              Votre compte de la plateforme cidricole, sans mot de passe à retenir ici.
            </p>

            <div className="mt-8 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-[var(--border)]" />
              <span className="text-xs font-medium uppercase tracking-widest text-[var(--mid2)]">ou</span>
              <span className="h-px flex-1 bg-[var(--border)]" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-[var(--ink)]">
              Identifiant
            </label>
            <div className="mt-2">
              <input
                type="text"
                value={login}
                onChange={(e) => {
                  setLogin(e.target.value);
                  setError(false);
                }}
                required
                autoComplete="username"
                autoFocus
                className="block min-h-0 w-full rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 text-base text-[var(--ink)] outline-none ring-0 placeholder:text-[var(--mid2)] transition-[border-color,box-shadow,background] focus:border-[var(--primary)] focus:bg-[var(--paper)] focus:shadow-[0_0_0_3px_rgba(98,141,23,.14)] sm:text-sm"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-[var(--ink)]">
                Mot de passe
              </label>
            </div>
            <div className="mt-2">
              <input
                type="password"
                value={mdp}
                onChange={(e) => {
                  setMdp(e.target.value);
                  setError(false);
                }}
                required
                autoComplete="current-password"
                className="block min-h-0 w-full rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 text-base text-[var(--ink)] outline-none ring-0 placeholder:text-[var(--mid2)] transition-[border-color,box-shadow,background] focus:border-[var(--primary)] focus:bg-[var(--paper)] focus:shadow-[0_0_0_3px_rgba(98,141,23,.14)] sm:text-sm"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-[color-mix(in_srgb,var(--danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-sm font-medium text-[var(--danger)] duration-200">
              Identifiants invalides.
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={busy}
              className="group flex w-full justify-center rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--primary-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <div className="flex items-center gap-2">
                  <span>Se connecter</span>
                  <FiChevronRight className="transition-transform group-hover:translate-x-1" />
                </div>
              )}
            </button>
          </div>
        </form>

        <p className="mt-12 text-center text-xs font-medium uppercase tracking-widest text-[var(--mid)]">
          &copy; {new Date().getFullYear()} CiderScope - Plateforme IFPC
        </p>
      </div>
    </div>
  );
};
