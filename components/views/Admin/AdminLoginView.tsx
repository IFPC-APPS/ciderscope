"use client";

import { useEffect, useState } from "react";
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
  echec: "La connexion avec PADOC a échoué. Réessayez dans un instant.",
};

/**
 * Écran d'accès à l'administration.
 *
 * PADOC est l'unique moyen de connexion : plus d'identifiant ni de mot de
 * passe propre à CiderScope. La connexion part par redirection et revient
 * par une nouvelle page ; c'est le chargement de l'application qui relit
 * alors la session auprès du serveur.
 */
export const AdminLoginView = () => {
  // null tant que le serveur n'a pas répondu : évite d'afficher « non
  // configuré » une fraction de seconde avant le bouton.
  const [padocAvailable, setPadocAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let annule = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { padocAvailable?: boolean }) => {
        if (!annule) setPadocAvailable(Boolean(d.padocAvailable));
      })
      .catch(() => { if (!annule) setPadocAvailable(false); });
    return () => { annule = true; };
  }, []);

  const motifPadoc = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("connexion");

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
          <div>
            <a
              href="/api/auth/ifpc/login?returnTo=/&admin=1"
              className="group flex w-full items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--primary-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] active:scale-[0.98]"
            >
              <FiShield />
              <span>Se connecter avec PADOC</span>
              <FiChevronRight className="transition-transform group-hover:translate-x-1" />
            </a>
            <p className="mt-2 text-center text-xs text-[var(--mid)]">
              Votre compte IFPC, sans mot de passe à retenir ici.
            </p>
          </div>
        )}

        {padocAvailable === false && (
          <div className="rounded-md border border-[color-mix(in_srgb,var(--danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-sm font-medium text-[var(--danger)]">
            {MOTIFS_PADOC.indisponible}
          </div>
        )}

        <p className="mt-12 text-center text-xs font-medium uppercase tracking-widest text-[var(--mid)]">
          &copy; {new Date().getFullYear()} CiderScope - Plateforme IFPC
        </p>
      </div>
    </div>
  );
};
