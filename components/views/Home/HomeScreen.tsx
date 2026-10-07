"use client";
import React from "react";
import { FiArrowRight, FiUsers } from "react-icons/fi";

interface HomeScreenProps {
  /** Le lien de connexion fédérée est-il utilisable ? */
  padocDisponible: boolean;
  /** Entrer dans la passation sans compte, pour un dégustateur. */
  onRejoindre: () => void;
}

/**
 * Écran d'entrée, pour qui n'est pas encore connecté.
 *
 * Le choix « Participant ou Admin » a été retiré : il demandait à l'utilisateur
 * de déclarer ce qu'il est, alors que son compte le dit déjà. Un animateur
 * arrivait sur l'écran participant par simple inattention.
 *
 * Mais la question posée ici n'est pas la même. Un dégustateur n'a pas de
 * compte et n'en aura pas : il arrive par le QR code d'une séance, et rien ne
 * lui sera jamais demandé. S'il atterrit malgré tout sur cette page — QR mal
 * scanné, retour en arrière, adresse tapée de mémoire — il doit pouvoir
 * entrer. Lui opposer un écran de connexion le laisserait dehors sans recours.
 *
 * L'action principale est donc la sienne. La connexion par compte, discrète,
 * est celle des animateurs.
 */
export const HomeScreen = ({ padocDisponible, onRejoindre }: HomeScreenProps) => (
  <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-[min(94%,560px)] flex-col items-center justify-center px-7 py-14 text-center max-[480px]:px-3.5 max-[480px]:py-6">
    <div className="mb-10">
      <h1 className="mb-3.5 text-[clamp(40px,6.5vw,68px)] font-extrabold leading-[1.02] text-[var(--ink)] max-[480px]:text-3xl">
        Cider<span className="text-[var(--accent)]">Scope</span>
      </h1>
      <p className="font-mono text-[15px] tracking-[0.02em] text-[var(--mid)]">
        Plateforme d&apos;analyse sensorielle&nbsp;- IFPC
      </p>
    </div>

    <button
      type="button"
      onClick={onRejoindre}
      className="group inline-flex w-full items-center justify-center gap-3 rounded-[var(--radius)] bg-[var(--primary)] px-7 py-4 text-[15px] font-semibold text-white shadow-[var(--shadow)] transition-[background,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(30,46,46,.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--primary)]"
    >
      <FiUsers size={18} />
      Rejoindre une dégustation
      <FiArrowRight
        size={18}
        className="transition-transform duration-200 group-hover:translate-x-[3px]"
      />
    </button>
    <p className="mt-4 max-w-[42ch] text-[13px] leading-relaxed text-[var(--mid)]">
      Aucun compte n&apos;est nécessaire. Le plus simple reste de scanner le QR
      code affiché sur votre table.
    </p>

    {padocDisponible && (
      <>
        <div className="my-8 h-px w-full max-w-[280px] bg-[var(--border)]" aria-hidden="true" />
        <a
          href="/api/auth/ifpc/login"
          className="text-[14px] font-semibold text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--primary)]"
        >
          Animateur&nbsp;: se connecter avec mon compte IFPC
        </a>
      </>
    )}
  </div>
);
