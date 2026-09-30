# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Documentation interne pour Kubernetes et processus d'intégration.
- Configuration Wiki.
- Fichiers de règles et conventions (CONTRIBUTING, CHANGELOG).
- Synchronisation automatique des désinscriptions Outlook et actualisation des créneaux.
- Quota silencieux de 20 demandes d'inscription quotidiennes par adresse.
- Jetons locaux transparents pour sécuriser la reprise des questionnaires.
- Connexion PADOC (IFPC) pour tous les utilisateurs : les jurys peuvent s'identifier avec leur compte, les comptes locaux sont créés à la première connexion (`app_users`).

### Changed
- L'administration n'est plus accessible que par PADOC, avec le rôle `animateur`. Le mot de passe partagé (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) est supprimé.
- Appels à PADOC forcés en HTTPS : l'instance annonce des adresses `http://` redirigées, ce qui cassait l'échange du code.
- Amélioration des consignes pour les agents IA dans AGENTS.md.
- Mise à jour du README avec structure complète.
- Accès aux séances et réponses déplacés derrière des API serveur protégées.
- Sauvegardes participantes et choix de poste rendus atomiques avec verrouillage optimiste.
- Calculs radar, catalogue des séances et appels Microsoft Graph optimisés.

### Deprecated

### Removed
- Accès Supabase direct depuis le navigateur et ancien endpoint d'activité dupliqué.

### Fixed
- Cohérence des 12 postes entre validation et ordre de présentation.
- Neutralisation des formules dans les exports CSV.
- Écrasements concurrents de réponses et de configuration.

### Security
- RLS fermé sur `sessions` et `answers`, validation/taille des entrées et en-têtes HTTP renforcés.
- Dépendances de développement mises à jour ; audit npm sans vulnérabilité connue.
