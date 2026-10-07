"use client";

import { useEffect, useState } from "react";

export interface SessionUtilisateur {
  authenticated: boolean;
  padocAvailable: boolean;
  /**
   * Nom affichable, en texte — c'est ce que renvoie `/api/auth/session`. Le
   * type annonçait un objet `{ name, email }` : lu ainsi, le nom restait
   * introuvable et une personne connectée se voyait proposer « Se connecter ».
   */
  user?: string;
  roles?: string[];
  isAdmin?: boolean;
}

/**
 * Qui est connecté, et avec quels droits.
 *
 * Trois écrans interrogeaient `/api/auth/session` chacun de leur côté : trois
 * requêtes au chargement, et trois états qui pouvaient diverger. La promesse
 * est donc partagée — le premier appelant déclenche la requête, les suivants
 * attendent la même.
 *
 * Ce n'est qu'un confort d'affichage : savoir quoi proposer. Les routes
 * sensibles vérifient les droits elles-mêmes, et ne font jamais confiance à
 * ce qu'affiche le navigateur.
 */
let enVol: Promise<SessionUtilisateur> | null = null;

function charger(): Promise<SessionUtilisateur> {
  if (!enVol) {
    enVol = fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { authenticated: false, padocAvailable: false }))
      .catch(() => ({ authenticated: false, padocAvailable: false }) as SessionUtilisateur);
  }
  return enVol;
}

/** À appeler après une connexion ou une déconnexion. */
export function oublierSession() {
  enVol = null;
}

export function useSession(): { session: SessionUtilisateur | null; chargement: boolean } {
  const [session, setSession] = useState<SessionUtilisateur | null>(null);

  useEffect(() => {
    let vivant = true;
    charger().then((s) => {
      if (vivant) setSession(s);
    });
    return () => {
      vivant = false;
    };
  }, []);

  return { session, chargement: session === null };
}
