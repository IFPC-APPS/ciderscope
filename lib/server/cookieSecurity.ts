/**
 * Faut-il poser le drapeau `Secure` sur les cookies de session ?
 *
 * Le réglage était lié à `NODE_ENV`, ce qui supposait que « production »
 * implique HTTPS. C'est vrai derrière Vercel, faux sur un déploiement interne
 * qui écoute en clair sur un réseau privé.
 *
 * L'erreur est particulièrement coûteuse à diagnostiquer : le cookie est bien
 * émis, le navigateur l'accepte, mais il refuse de le renvoyer sur une
 * connexion non chiffrée. Le parcours OAuth échoue alors au retour avec le
 * motif « demande expirée » — alors que rien n'a expiré et que tout le reste
 * fonctionne.
 *
 * `PADOC_ALLOW_INSECURE_HTTP=1` désigne exactement ce cas, et sert déjà à
 * autoriser un émetteur PADOC en HTTP. Hors de là, rien ne change.
 *
 * À retirer le jour où un proxy TLS sera en place devant l'application.
 */
export const cookieSecurise = () =>
  process.env.NODE_ENV === "production"
  && process.env.PADOC_ALLOW_INSECURE_HTTP !== "1";
