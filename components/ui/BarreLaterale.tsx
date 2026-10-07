"use client";

import { useState } from "react";
import { FiLogIn, FiLogOut, FiMenu, FiUser, FiX } from "react-icons/fi";

export interface EntreeNav {
  cle: string;
  libelle: string;
  icone: React.ReactNode;
  actif?: boolean;
  onClick: () => void;
}

interface BarreLateraleProps {
  entrees: EntreeNav[];
  nomUtilisateur?: string | null;
  /** Null si la connexion fédérée n'est pas configurée. */
  lienConnexion?: string | null;
  onLogout?: () => void;
  online?: boolean;
}

/**
 * La navigation, dans la forme de celle de PADOC : repliée à 52 px, dépliée au
 * survol, tiroir sur mobile.
 *
 * Elle porte toujours, en pied, l'état du compte. Une version antérieure n'y
 * mettait que la déconnexion : un visiteur sans compte n'avait alors aucun
 * moyen de se connecter depuis cette barre, et comme le mode de l'application
 * est mémorisé d'une visite à l'autre, il ne revoyait jamais l'écran d'entrée.
 * L'impasse était complète après une simple actualisation.
 */
const Entree = ({ entree, replie }: { entree: EntreeNav; replie: boolean }) => (
  <button
    onClick={entree.onClick}
    title={replie ? entree.libelle : undefined}
    aria-current={entree.actif ? "page" : undefined}
    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
      replie ? "justify-center" : ""
    } ${
      entree.actif
        ? "bg-[rgba(98,141,23,.07)] font-semibold text-[var(--primary)]"
        : "text-[var(--mid2)] hover:bg-[var(--paper3)] hover:text-[var(--ink)]"
    }`}
  >
    <span className="shrink-0">{entree.icone}</span>
    {!replie && <span className="truncate">{entree.libelle}</span>}
  </button>
);

export const BarreLaterale = ({
  entrees, nomUtilisateur, lienConnexion, onLogout, online = false,
}: BarreLateraleProps) => {
  const [replie, setReplie] = useState(true);
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  const compact = replie && !tiroirOuvert;
  const fermerTiroir = () => setTiroirOuvert(false);

  const marque = (
    <span className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/log.svg" alt="IFPC" className="h-[30px] w-[30px] shrink-0 object-contain" />
      {!compact && (
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-[13px] font-bold text-[var(--primary)]">IFPC</span>
          <span className="text-lg font-light leading-none text-[var(--border-strong)]">·</span>
          <span className="text-[13px] font-bold text-[var(--ink)]">CiderScope</span>
        </span>
      )}
    </span>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--paper)] px-4 lg:hidden">
        <span className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/log.svg" alt="IFPC" className="h-[26px] w-[26px] object-contain" />
          <span className="text-[13px] font-bold text-[var(--primary)]">IFPC</span>
          <span className="text-lg font-light leading-none text-[var(--border-strong)]">·</span>
          <span className="text-[13px] font-bold text-[var(--ink)]">CiderScope</span>
        </span>
        <button
          onClick={() => setTiroirOuvert(true)}
          className="rounded-lg p-2 text-[var(--mid)] hover:bg-[var(--paper3)]"
          aria-label="Ouvrir le menu"
        >
          <FiMenu size={22} />
        </button>
      </div>

      {tiroirOuvert && (
        <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm lg:hidden" onClick={fermerTiroir} />
      )}

      <aside
        onMouseEnter={() => setReplie(false)}
        onMouseLeave={() => setReplie(true)}
        className={`fixed left-0 top-0 z-[60] flex h-screen flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--paper)] transition-all duration-300
          ${tiroirOuvert ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
          ${compact ? "lg:w-[52px]" : "w-64 lg:w-56"}`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
          {marque}
          {tiroirOuvert && (
            <button onClick={fermerTiroir} className="rounded-lg p-2 text-[var(--mid)] lg:hidden" aria-label="Fermer">
              <FiX size={18} />
            </button>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
          {entrees.map((e) => (
            <Entree
              key={e.cle}
              replie={compact}
              entree={{ ...e, onClick: () => { e.onClick(); fermerTiroir(); } }}
            />
          ))}
        </nav>

        <div className="shrink-0 border-t border-[var(--border)] px-2 py-3">
          {/* « En ligne », et non « Connecté » : cette pastille dit que le
              serveur répond, pas qu'un compte est ouvert. Avec « Connecté »,
              un visiteur sans compte croyait l'être — d'autant plus depuis
              qu'il existe une vraie connexion par compte. */}
          <p className={`mb-2 flex items-center gap-1.5 font-mono text-[11px] ${compact ? "justify-center" : "px-1"} ${
            online ? "text-[var(--mid)]" : "text-[var(--danger)]"
          }`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? "bg-[var(--primary)]" : "bg-[var(--danger)]"}`} aria-hidden="true" />
            {!compact && (online ? "En ligne" : "Hors ligne")}
          </p>

          {nomUtilisateur ? (
            <>
              {!compact && (
                <p className="mb-1.5 flex items-center gap-2 px-1 text-[11px] font-semibold text-[var(--mid)]">
                  <FiUser size={14} className="shrink-0" />
                  <span className="truncate">{nomUtilisateur}</span>
                </p>
              )}
              {onLogout && (
                <button
                  onClick={onLogout}
                  title={compact ? "Se déconnecter" : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-[var(--mid2)] transition-colors hover:bg-[rgba(198,40,40,.06)] hover:text-[var(--danger)] ${compact ? "justify-center" : ""}`}
                >
                  <FiLogOut size={14} className="shrink-0" />
                  {!compact && "Déconnexion"}
                </button>
              )}
            </>
          ) : lienConnexion ? (
            // Toujours présent pour un visiteur sans compte : c'est le seul
            // chemin vers la connexion une fois l'écran d'entrée dépassé.
            <a
              href={lienConnexion}
              title={compact ? "Se connecter" : undefined}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[12px] font-semibold text-[var(--primary)] transition-colors hover:bg-[rgba(98,141,23,.08)] ${compact ? "justify-center" : ""}`}
            >
              <FiLogIn size={15} className="shrink-0" />
              {!compact && "Se connecter"}
            </a>
          ) : null}
        </div>
      </aside>
    </>
  );
};
