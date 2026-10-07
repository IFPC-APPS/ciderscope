"use client";

import { useState } from "react";
import {
  FiBarChart2, FiCalendar, FiList, FiLogOut, FiMenu, FiUser, FiUsers, FiX,
} from "react-icons/fi";

interface EntreeProps {
  actif: boolean;
  replie: boolean;
  libelle: string;
  icone: React.ReactNode;
  onClick: () => void;
}

interface BarreLateraleProps {
  section: "seances" | "creneaux" | "analyse";
  onSection: (s: "seances" | "creneaux" | "analyse") => void;
  peutCreneaux: boolean;
  onPassation: () => void;
  nomUtilisateur?: string | null;
  onLogout?: () => void;
  online?: boolean;
}

/**
 * La navigation de l'espace d'animation, dans la forme de celle de PADOC.
 *
 * Même géométrie : repliée à 52 px, dépliée au survol, tiroir sur mobile avec
 * un bandeau supérieur pour l'ouvrir. Quelqu'un qui passe de PADOC à CiderScope
 * retrouve ses repères sans réapprendre.
 *
 * **Elle n'habille que l'espace d'animation.** Le parcours de dégustation garde
 * son bandeau : une barre latérale mangerait la largeur sur un téléphone posé
 * dans un chai, et surtout elle offrirait au dégustateur des portes de sortie
 * au milieu de sa passation — ce que l'écran cherche précisément à éviter.
 */
const Entree = ({ actif, replie, libelle, icone, onClick }: EntreeProps) => (
  <button
    onClick={onClick}
    title={replie ? libelle : undefined}
    aria-current={actif ? "page" : undefined}
    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
      replie ? "justify-center" : ""
    } ${
      actif
        ? "bg-[rgba(98,141,23,.07)] font-semibold text-[var(--primary)]"
        : "text-[var(--mid2)] hover:bg-[var(--paper3)] hover:text-[var(--ink)]"
    }`}
  >
    <span className="shrink-0">{icone}</span>
    {!replie && <span>{libelle}</span>}
  </button>
);

export const BarreLaterale = ({
  section, onSection, peutCreneaux, onPassation,
  nomUtilisateur, onLogout, online = false,
}: BarreLateraleProps) => {
  const [replie, setReplie] = useState(true);
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  const compact = replie && !tiroirOuvert;

  const fermerTiroir = () => setTiroirOuvert(false);
  const aller = (s: "seances" | "creneaux" | "analyse") => { onSection(s); fermerTiroir(); };

  return (
    <>
      {/* Bandeau mobile : la barre latérale y devient un tiroir. */}
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
        <div
          className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={fermerTiroir}
        />
      )}

      <aside
        onMouseEnter={() => setReplie(false)}
        onMouseLeave={() => setReplie(true)}
        className={`fixed left-0 top-0 z-[60] flex h-screen flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--paper)] transition-all duration-300
          ${tiroirOuvert ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
          ${compact ? "lg:w-[52px]" : "w-64 lg:w-56"}`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
          <span className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/log.svg" alt="IFPC" className="h-[30px] w-[30px] shrink-0 object-contain" />
            {!compact && (
              <span className="flex items-baseline gap-1.5">
                <span className="text-[13px] font-bold text-[var(--primary)]">IFPC</span>
                <span className="text-[13px] font-bold text-[var(--ink)]">CiderScope</span>
              </span>
            )}
          </span>
          {tiroirOuvert && (
            <button onClick={fermerTiroir} className="rounded-lg p-2 text-[var(--mid)] lg:hidden" aria-label="Fermer">
              <FiX size={18} />
            </button>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
          <Entree
            actif={section === "seances"} replie={compact} libelle="Séances"
            icone={<FiList size={18} />} onClick={() => aller("seances")}
          />
          {peutCreneaux && (
            <Entree
              actif={section === "creneaux"} replie={compact} libelle="Créneaux"
              icone={<FiCalendar size={18} />} onClick={() => aller("creneaux")}
            />
          )}
          <Entree
            actif={section === "analyse"} replie={compact} libelle="Analyse"
            icone={<FiBarChart2 size={18} />} onClick={() => aller("analyse")}
          />

          <div className="my-2 border-t border-[var(--border)]" />

          <Entree
            actif={false} replie={compact} libelle="Passation"
            icone={<FiUsers size={18} />}
            onClick={() => { onPassation(); fermerTiroir(); }}
          />
        </nav>

        <div className="shrink-0 border-t border-[var(--border)] px-2 py-3">
          {/* L'état est écrit, pas seulement coloré : il doit se lire sans
              distinguer le vert du rouge. */}
          <p className={`mb-2 flex items-center gap-1.5 font-mono text-[11px] ${compact ? "justify-center" : "px-1"} ${
            online ? "text-[var(--primary)]" : "text-[var(--danger)]"
          }`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? "animate-pulse bg-[var(--primary)]" : "bg-[var(--danger)]"}`} aria-hidden="true" />
            {!compact && (online ? "Connecté" : "Local")}
          </p>

          {nomUtilisateur && !compact && (
            <p className="mb-1.5 flex items-center gap-2 px-1 text-[11px] font-semibold text-[var(--mid)]">
              <FiUser size={14} className="shrink-0" />
              <span className="truncate">{nomUtilisateur}</span>
            </p>
          )}

          {onLogout && (
            <button
              onClick={onLogout}
              title={compact ? "Se déconnecter" : undefined}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-[var(--mid2)] transition-colors hover:bg-[rgba(198,40,40,.06)] hover:text-[var(--danger)] ${
                compact ? "justify-center" : ""
              }`}
            >
              <FiLogOut size={14} className="shrink-0" />
              {!compact && "Déconnexion"}
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
