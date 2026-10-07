"use client";
import React from "react";
import { FiArrowRight, FiLock } from "react-icons/fi";

interface HomeScreenProps {
  /** Le lien de connexion fédérée est-il utilisable ? */
  padocDisponible: boolean;
}

/**
 * Écran d'entrée, pour qui n'est pas encore connecté.
 *
 * Le choix « Participant ou Admin » a été retiré : il demandait à l'utilisateur
 * de déclarer ce qu'il est, alors que son compte le dit déjà. Un animateur
 * arrivait sur l'écran participant par simple inattention, et un panéliste se
 * voyait proposer une porte qui n'était pas la sienne.
 *
 * Désormais la connexion décide, et il n'y a plus qu'une action possible.
 */
export const HomeScreen = ({ padocDisponible }: HomeScreenProps) => (
  <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-[min(94%,560px)] flex-col items-center justify-center px-7 py-14 text-center max-[480px]:px-3.5 max-[480px]:py-6">
    <div className="mb-10">
      <h1 className="mb-3.5 text-[clamp(40px,6.5vw,68px)] font-extrabold leading-[1.02] text-[var(--ink)] max-[480px]:text-3xl">
        Cider<span className="text-[var(--accent)]">Scope</span>
      </h1>
      <p className="font-mono text-[15px] tracking-[0.02em] text-[var(--mid)]">
        Plateforme d&apos;analyse sensorielle&nbsp;- IFPC
      </p>
    </div>

    {padocDisponible ? (
      <>
        <a
          href="/api/auth/ifpc/login"
          className="group inline-flex w-full items-center justify-center gap-3 rounded-[var(--radius)] bg-[var(--primary)] px-7 py-4 text-[15px] font-semibold text-white shadow-[var(--shadow)] transition-[background,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(30,46,46,.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--primary)]"
        >
          Se connecter avec mon compte IFPC
          <FiArrowRight
            size={18}
            className="transition-transform duration-200 group-hover:translate-x-[3px]"
          />
        </a>
        <p className="mt-5 max-w-[42ch] text-[13px] leading-relaxed text-[var(--mid)]">
          Le même compte que sur PADOC. Votre mot de passe reste connu de l&apos;IFPC
          seul&nbsp;: CiderScope ne le voit jamais.
        </p>
      </>
    ) : (
      <div className="flex w-full flex-col items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] px-7 py-8 shadow-[var(--shadow)]">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--paper2)] text-[var(--mid)]">
          <FiLock size={24} />
        </span>
        <p className="text-[15px] font-semibold text-[var(--ink)]">Connexion indisponible</p>
        <p className="max-w-[40ch] text-[13px] leading-relaxed text-[var(--mid)]">
          La connexion par compte IFPC n&apos;est pas configurée sur cette
          installation. Contactez un administrateur.
        </p>
      </div>
    )}
  </div>
);
