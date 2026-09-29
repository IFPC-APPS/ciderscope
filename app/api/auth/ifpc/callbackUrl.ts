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
