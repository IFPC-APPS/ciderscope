/**
 * L'URI de redirection, qui doit être identique au départ et au retour.
 *
 * PADOC la compare au caractère près à celles qu'il a enregistrées, et
 * l'échange du code la redemande : la moindre divergence entre les deux
 * requêtes fait échouer le parcours avec un `invalid_grant` peu parlant. D'où
 * ce point unique.
 *
 * `PADOC_REDIRECT_URI` prime, parce que derrière un proxy l'URL vue par le
 * serveur n'est pas celle du navigateur. Le repli sur l'adresse de la requête
 * sert au développement local.
 */
export const callbackUrlFor = (request: Request) => {
  const configuree = process.env.PADOC_REDIRECT_URI;
  if (configuree) return configuree;
  return new URL("/api/auth/ifpc/callback", new URL(request.url).origin).toString();
};

/**
 * Origine publique de l'application, pour les redirections de fin de parcours.
 *
 * `new URL(request.url).origin` renvoie l'adresse sur laquelle le serveur écoute
 * — « http://localhost:3000 » dans un conteneur — et non celle par laquelle
 * l'utilisateur est arrivé. L'utilisateur se retrouvait donc renvoyé vers une
 * adresse qui n'existe que dans le conteneur.
 *
 * On part de PADOC_REDIRECT_URI, qui désigne forcément l'adresse publique :
 * elle est comparée au caractère près par PADOC, elle ne peut donc pas être
 * fausse. À défaut, on retombe sur l'origine de la requête, ce qui convient au
 * développement local.
 */
export const appOrigin = (request: Request) => {
  const configuree = process.env.PADOC_REDIRECT_URI;
  if (configuree) {
    try {
      return new URL(configuree).origin;
    } catch {
      // URI mal formée : le repli vaut mieux qu'une exception ici.
    }
  }
  return new URL(request.url).origin;
};
