<p align="center">
  <img src="public/assets/logo.png" alt="Logo CiderScope" width="160" />
</p>

# CiderScope

[![CI](https://github.com/ciderscope/ciderscope/actions/workflows/ci.yml/badge.svg)](https://github.com/ciderscope/ciderscope/actions/workflows/ci.yml)

CiderScope est une application web pour creer des seances d'analyse sensorielle, guider les jurys pendant la degustation, collecter leurs reponses et analyser les reponses d'un panel.

Le projet est associe a une plateforme d'analyse sensorielle IFPC. Il expose deux parcours principaux : un parcours participant pour rejoindre une seance active et repondre au questionnaire, et un parcours administration pour configurer les seances, suivre les jurys et exploiter les resultats.

Cette application a été codée en partie par IA (Claude/GPT).

## Valorisation produit et informations du projet

| Element | Statut dans le depot | Ou le mettre ou le verifier |
| --- | --- | --- |
| Nom produit | `CiderScope` | Titre du README, champ `metadata.title` dans `app/layout.tsx`, page d'accueil. |
| Positionnement | Plateforme d'analyse sensorielle IFPC | Description courte GitHub, README, documentation utilisateur. |
| Logo / icone | `public/assets/logo.png`, `public/Logo.jpg`, `public/Logo.ico`, `app/favicon.ico` | README, favicon Next.js, section GitHub "About" si un visuel externe est utilise. |
| Application | URL indiquee sur GitHub : `https://ciderscope.vercel.app` | Section GitHub "About" puis lien dans le README apres confirmation de production. |
| Documentation | `docs/wiki/overview.md`, `docs/wiki/getting-started.md`, `docs/integrations.md`, `docs/auto-devops.md`, `k8s/README.md` | Section "Documentation" du README et Wiki GitHub si publie. |
| Licence | GNU GPL v3.0 | Voir LICENCE |
| Version applicative | `0.1.0` dans `package.json` | Releases GitHub, changelog, package metadata. |
| Pipeline qualite | GitHub Actions via `.github/workflows/ci.yml` | Onglet Actions GitHub et badge CI du README. |
| Deploiement | Vercel prevu via `vercel.json`; templates Kubernetes disponibles dans `k8s/` | Vercel pour l'application courante, Kubernetes seulement apres adaptation des templates. |
| Contact / support | lucas.semaan@ifpc.eu | Section GitHub "About", README, documentation interne. |

## Ce que permet CiderScope

- Creer, dupliquer, activer, desactiver et supprimer des seances de degustation.
- Declarer les echantillons par code et libelle optionnel.
- Composer un questionnaire avec des questions par produit, globales ou autonomes.
- Gerer les participants par nom de jury et par poste de degustation.
- Afficher l'ordre de service personnel des echantillons avant le questionnaire.
- Enregistrer les reponses dans Supabase, avec file d'attente locale si une sauvegarde echoue hors-ligne.
- Consulter une synthese d'analyse par seance et exporter les donnees.
- Autoriser ou masquer le resume des resultats cote participant apres la seance.

## Types de questions

Les types de questions disponibles sont definis dans `types/index.ts` et construits dans l'administration :

| Type | Usage |
| --- | --- |
| `scale` | Note numerique, avec sous-criteres possibles. |
| `radar` | Toile d'araignee avec groupes, familles, classes et descripteurs. |
| `classement` | Classement d'echantillons. |
| `seuil` | Question de seuil par rang. |
| `seuil-bet` | Seuil 3-AFC avec niveaux de concentration et calcul BET. |
| `text` | Commentaire libre. |
| `qcm` | Choix simple ou multiple. |
| `triangulaire` | Test triangulaire. |
| `duo-trio` | Test duo-trio. |
| `a-non-a` | Test A / non-A. |

## Analyses et exports

L'ecran d'analyse est charge a la demande et s'appuie sur Chart.js. Selon le questionnaire, il peut afficher :

- une synthese des criteres les plus marques par echantillon ;
- les moyennes et ecarts-types des questions d'echelle ;
- les toiles d'araignee, analyses HRATA, ACP et performance jury pour les questions radar ;
- les tests de Friedman, comparaisons post-hoc de Nemenyi et concordance de Kendall pour les classements et seuils ;
- les analyses des tests discriminatifs, dont triangulaire, duo-trio et A / non-A ;
- le seuil 3-AFC BET selon la logique documentee dans l'interface ;
- un nuage de mots pour les reponses texte ;
- une vue par jury et une table des donnees brutes.

Deux exports CSV sont disponibles depuis l'administration :

- CSV standard au format base de donnée ;
- CSV FactoMineR/R pour les donnees en mode tableau.

## Parcours utilisateur

### Participant

1. Selectionner une seance active.
2. S'identifier par prenom ; la reprise sur le meme navigateur est automatique et ne demande aucun mot de passe. La connexion PADOC est proposee en option : elle pre-remplit le nom et rattache les reponses au compte.
3. Choisir un poste de degustation disponible.
4. Lire l'ordre de service personnalise.
5. Remplir les questions et valider chaque etape complete.
6. Consulter le resume du panel uniquement si l'animateur l'a autorise.

### Administration

1. Se connecter a l'espace admin avec PADOC (compte IFPC portant le role `animateur`).
2. Gerer les seances et leurs statuts.
3. Configurer les echantillons et le questionnaire.
4. Suivre ou supprimer les jurys associes a une seance.
5. Ouvrir les analyses et exporter les resultats.

### Authentification (PADOC / IFPC)

CiderScope ne gère ni comptes ni mots de passe : la connexion passe exclusivement par la fédération OpenID Connect d'IFPC (« PADOC »), en Authorization Code + PKCE, comme client confidentiel. Le guide d'intégration IFPC fait référence.

- Chaque utilisateur doit être **habilité sur CiderScope** par un administrateur IFPC ; sinon IFPC affiche « Accès non accordé ».
- Les rôles reçus dans `https://ifpc.eu/claims/roles` sont ceux de CiderScope, à communiquer tels quels à l'administrateur IFPC :
  - `animateur` : accès à l'espace d'administration ;
  - `creneaux` : planification par créneaux et invitations Outlook (en plus d'`animateur`) ;
  - aucun rôle : utilisateur classique (jury identifié), sans accès à l'administration.
- Un compte local est créé à la première connexion dans `app_users`, rattaché par le `sub` IFPC — jamais par l'e-mail, qui n'est pas vérifié par IFPC.
- Les URI de redirection sont comparées au caractère près : faire enregistrer `https://<domaine>/api/auth/ifpc/callback` pour chaque environnement (et `http://localhost:3000/api/auth/ifpc/callback` en développement).
- La session CiderScope est un cookie HTTP-only signé (8 h). La déconnexion ferme la session CiderScope, pas celle d'IFPC.

## Documentation

- [Overview](docs/wiki/overview.md) : objectif du projet et stack technique.
- [Getting Started](docs/wiki/getting-started.md) : installation locale et lancement.
- [Integrations](docs/integrations.md) : Supabase, Vercel et GitHub Actions.
- [Auto DevOps](docs/auto-devops.md) : notes preparatoires pour un pipeline automatise.
- [Kubernetes](k8s/README.md) : templates documentaires de deploiement Kubernetes.
- [Contributing](CONTRIBUTING.md) : workflow de contribution et regles de qualite.
- [Changelog](CHANGELOG.md) : changements notables du projet.

## Stack

- Next.js 16 avec App Router
- React 19
- TypeScript strict
- Tailwind CSS
  - Supabase via les routes serveur
- Chart.js et react-chartjs-2
- Vitest
- GitHub Actions
- Vercel

## Prerequis

- Node.js 22 recommande
- npm
- Un projet Supabase avec les tables decrites dans `supabase-schema.sql`

## Installation

```bash
npm install
npm run dev
```

L'application locale est accessible sur [http://localhost:3000](http://localhost:3000).

## Variables d'environnement

Creer un fichier `.env.local` a la racine :

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
DIRECT_URL=

ADMIN_SESSION_SECRET=

PADOC_ISSUER=http://spectacular-happiness-production-28b4.up.railway.app
PADOC_CLIENT_ID=
PADOC_CLIENT_SECRET=
PADOC_REDIRECT_URI=
PADOC_SCOPES=

MICROSOFT_GRAPH_TENANT_ID=
MICROSOFT_GRAPH_CLIENT_ID=
MICROSOFT_GRAPH_CLIENT_SECRET=
OUTLOOK_ORGANIZER_EMAIL=lucas.semaan@ifpc.eu
OUTLOOK_WEBHOOK_NOTIFICATION_URL=https://votre-domaine.vercel.app/api/outlook/webhook
OUTLOOK_WEBHOOK_CLIENT_STATE=
CRON_SECRET=
```

Option de developpement :

```env
NEXT_PUBLIC_ENABLE_TEST_DATA=1
```

Cette option affiche le bouton de generation de participants fictifs dans l'administration pour lancer des tests.

### Inscriptions aux creneaux

La fonctionnalite d'inscription utilise les routes serveur Next.js. Elles utilisent d'abord le service role Supabase,
puis basculent en local sur `DIRECT_URL` ou `DATABASE_URL` si `SUPABASE_SERVICE_ROLE_KEY` n'est pas renseignee. Appliquer la migration
`supabase/migrations/202606161130_session_slots.sql`, puis `supabase/migrations/202607021200_outlook_calendar_invitations.sql`
et `supabase/migrations/202607021330_remove_ics_fallback.sql`, puis
`supabase/migrations/202607021500_immediate_outlook_invitations.sql`, puis
`supabase/migrations/202607021700_slot_waitlist.sql`, puis
`supabase/migrations/202607021730_promote_waitlist_on_cancel.sql`, puis
`supabase/migrations/202607021800_outlook_decline_webhook.sql`, puis
`supabase/migrations/202607171200_security_hardening.sql`, puis
`supabase/migrations/202608031000_merge_sessions.sql`, avant d'utiliser la fusion de séances, puis
`supabase/migrations/202609301200_app_users.sql` pour les comptes créés à la connexion PADOC.

- `SUPABASE_SERVICE_ROLE_KEY` reste uniquement cote serveur et permet aux API de faire respecter les controles metier.
- La migration de durcissement ferme l'accès navigateur direct aux séances/réponses, ajoute un jeton local transparent pour la reprise et limite à 20 les demandes d'inscription quotidiennes par adresse.
- `ADMIN_SESSION_SECRET` signe le cookie de session HTTP-only (administrateurs et jurys connectés).
- `PADOC_ISSUER`, `PADOC_CLIENT_ID` et `PADOC_CLIENT_SECRET` activent la connexion PADOC ; sans les trois, aucune connexion n'est possible. `PADOC_ISSUER` est l'émetteur exact annoncé par IFPC (sans `/` final) : toutes les autres adresses sont lues dans son document de découverte, et appelées en HTTPS.
- `PADOC_REDIRECT_URI` (facultatif) fixe l'URI de retour enregistrée chez IFPC, utile derrière un proxy ; par défaut `<origine>/api/auth/ifpc/callback`.
- `PADOC_SCOPES` (facultatif) remplace les portées demandées, `openid profile email` par défaut ; mettre `openid` si IFPC répond `invalid_scope`.
- Si Microsoft Graph est configure, chaque inscription cree immediatement une invitation Outlook dediee dans le calendrier de `OUTLOOK_ORGANIZER_EMAIL`.
- Si un creneau est complet, l'inscription reste possible en liste d'attente et l'invitation Outlook est envoyee en provisoire.
- Quand une inscription confirmee est annulee, la premiere personne en liste d'attente est automatiquement confirmee.
- L'application Entra doit avoir la permission Microsoft Graph `Calendars.ReadWrite` en application permission, avec admin consent.
- `OUTLOOK_WEBHOOK_NOTIFICATION_URL` doit pointer vers l'URL publique HTTPS `/api/outlook/webhook`.
- Le cron Vercel `/api/cron/outlook-webhook` renouvelle une fois par jour l'abonnement Graph aux changements du calendrier Outlook.
- Les participants acceptent ou refusent l'invitation depuis Outlook. Les suppressions de creneau cote admin annulent les invitations Outlook.
- Si un participant refuse l'invitation Outlook, le webhook Graph annule son inscription Senso et les écrans se réactualisent automatiquement.
- Le rappel Outlook natif est configure 24 heures avant le creneau. Microsoft Graph ne permet qu'un rappel natif par evenement.
- L'ancien fallback de fichier calendrier a ete retire : les inscriptions aux creneaux utilisent uniquement les invitations Outlook.

## Base de donnees

Le schema Supabase est documente dans `supabase-schema.sql`. Il cree :

- `sessions` : configuration, statut actif, compteur de jurys et visibilite des resultats ;
- `answers` : reponses par couple seance / jury.
- `session_slots`, `slot_registrations` et `email_domain_whitelist` via la migration des creneaux d'inscription ;
- `app_users` : comptes crees a la premiere connexion PADOC (cle = `sub` IFPC), et `answers.juror_subject` pour rattacher les reponses d'un jury connecte.

Les politiques publiques historiques de `sessions` et `answers` sont retirées par la migration de durcissement. Les accès sensibles passent par les API serveur protégées.

## Commandes

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```

Validation CI locale :

```bash
npm run ci
```

La CI GitHub execute `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test` et `npm run build` sur les push vers `main` et les pull requests.

## Deploiement

Le depot contient `vercel.json` avec le framework `nextjs`, ce qui indique un deploiement Vercel.

Les fichiers `k8s/deployment.yaml`, `k8s/service.yaml` et `k8s/ingress.yaml` sont des templates documentaires. Ils doivent etre adaptes avant un deploiement reel, notamment avec une image Docker, une registry, un `ConfigMap` et un `Secret`.


## Structure du depot

- `app/` : layout, page principale, providers et routage applicatif Next.js.
- `components/features/` : composants metier du questionnaire et des cartes de seance.
- `components/views/Home/` : ecran d'accueil.
- `components/views/Participant/` : parcours participant.
- `components/views/Admin/` : gestion des seances, questions, jurys et acces admin.
- `components/views/Analyse/` : analyses statistiques, visualisations et exports.
- `components/ui/` : primitives d'interface partagees.
- `hooks/` : orchestration d'etat applicatif avec `useSenso`.
- `lib/` : client Supabase, calculs statistiques, CSV, validation, file hors-ligne et logique de steps.
- `types/` : types TypeScript publics du domaine.
- `docs/` : documentation projet et integrations.
- `k8s/` : manifests Kubernetes a adapter.
- `public/` : logos, icones et assets statiques.
- `.github/workflows/` : pipeline CI.

## Contribution et qualite

Les contributions passent par pull request vers `main`. Avant de pousser, executer :

```bash
npm run ci
```

Consulter [CONTRIBUTING.md](CONTRIBUTING.md) pour les conventions de developpement.

## Securite

- Ne jamais commiter de secrets Supabase ou de fichiers `.env.local`.
- Verifier les politiques RLS Supabase avant toute exposition publique.
- Remplacer l'authentification admin locale actuelle par une solution configuree avant production.
- Documenter le contact de signalement de vulnerabilite lorsque le projet est ouvert a des tiers.

## Licence

Ce projet est distribué sous licence GNU GPL v3.0.

Vous pouvez utiliser, modifier et redistribuer ce logiciel, à condition que les versions redistribuées restent sous licence GPL et que le code source reste disponible conformément aux termes de la licence.

Voir le fichier `LICENSE` pour le texte complet.
