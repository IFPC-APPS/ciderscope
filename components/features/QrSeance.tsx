"use client";

import { useCallback, useEffect, useState } from "react";
import { FiPrinter, FiRefreshCw, FiX } from "react-icons/fi";
import QRCode from "qrcode";

interface QrSeanceProps {
  sessionId: string;
  nomSeance: string;
  onFermer: () => void;
}

/**
 * Le QR code qu'on pose sur la table.
 *
 * Il porte l'adresse d'entrée de la dégustation. Le dégustateur scanne, et il
 * est dedans : ni compte, ni mot de passe, ni séance à choisir dans une liste.
 *
 * Le code est calculé **dans le navigateur**. Passer par un service en ligne
 * reviendrait à confier à un tiers le jeton qui ouvre la séance — c'est-à-dire
 * tout ce qui la protège.
 */
export const QrSeance = ({ sessionId, nomSeance, onFermer }: QrSeanceProps) => {
  const [adresse, setAdresse] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const dessiner = useCallback(async (jeton: string) => {
    const url = `${window.location.origin}/s/${jeton}`;
    setAdresse(url);
    // Correction haute : une feuille posée dans un chai se tache, se corne et
    // se lit sous un mauvais éclairage. Un QR code plus dense mais tolérant
    // vaut mieux qu'un code net qu'une goutte de cidre rend illisible.
    setImage(await QRCode.toDataURL(url, { errorCorrectionLevel: "H", margin: 2, width: 512 }));
  }, []);

  const charger = useCallback(async (regenerer = false) => {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await fetch(`/api/admin/sessions/${sessionId}/jeton`, {
        method: regenerer ? "POST" : "GET",
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok || !d.jeton) throw new Error(d.error || "Jeton indisponible.");
      await dessiner(d.jeton);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Jeton indisponible.");
    } finally {
      setEnCours(false);
    }
  }, [sessionId, dessiner]);

  useEffect(() => { void charger(); }, [charger]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 print:static print:bg-transparent print:p-0">
      {/* « feuille-imprimable » n'est pas décoratif : la feuille de style
          masque absolument tout à l'impression, sauf les blocs portant cette
          classe ou .print-sheet. Sans elle, « Imprimer » sortait une page
          blanche — et rien à l'écran ne l'aurait laissé deviner. */}
      <div className="feuille-imprimable w-full max-w-[480px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--paper)] p-6 shadow-[var(--shadow)] print:max-w-none print:border-0 print:shadow-none">
        <div className="mb-5 flex items-start justify-between gap-4 print:mb-8">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--mid)]">Dégustation</p>
            <h3 className="truncate text-lg font-bold text-[var(--ink)]">{nomSeance}</h3>
          </div>
          <button
            onClick={onFermer}
            className="shrink-0 rounded-lg p-2 text-[var(--mid)] hover:bg-[var(--paper3)] print:hidden"
            aria-label="Fermer"
          >
            <FiX size={18} />
          </button>
        </div>

        {erreur && (
          <p className="mb-4 rounded-lg border border-[rgba(198,40,40,.2)] bg-[rgba(198,40,40,.06)] px-4 py-3 text-sm text-[var(--danger)]">
            {erreur}
          </p>
        )}

        {image && (
          <div className="flex flex-col items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={`QR code d'entrée pour ${nomSeance}`} className="h-auto w-full max-w-[320px]" />
            <p className="text-center text-sm font-semibold text-[var(--ink)]">
              Scannez pour rejoindre la dégustation
            </p>
            {/* L'adresse en toutes lettres : tous les téléphones ne lisent pas
                les QR codes, et une adresse recopiable évite de bloquer
                quelqu'un devant sa table. */}
            <p className="w-full break-all rounded-lg bg-[var(--paper2)] px-3 py-2 text-center font-mono text-[11px] text-[var(--mid)]">
              {adresse}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2 print:hidden">
          <button
            onClick={() => window.print()}
            disabled={!image}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <FiPrinter size={15} /> Imprimer
          </button>
          <button
            onClick={() => void charger(true)}
            disabled={enCours}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--mid)] hover:text-[var(--ink)] disabled:opacity-50"
            title="L'ancienne adresse cessera de fonctionner"
          >
            <FiRefreshCw size={15} /> Nouvelle adresse
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--mid)] print:hidden">
          Cette adresse ouvre la dégustation sans mot de passe. Elle reste
          valable si la séance est rejouée. « Nouvelle adresse » rend aussitôt
          inutilisables les feuilles déjà imprimées.
        </p>
      </div>
    </div>
  );
};
