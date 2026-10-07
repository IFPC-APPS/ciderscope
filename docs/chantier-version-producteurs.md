# Chantier — CiderScope pour les producteurs

> État des lieux et plan de travail, établi le 7 octobre 2026 à partir de la
> demande client et d'une lecture du code existant.
>
> **Contrainte posée par le client :** ne rien supprimer de ce qui sert à
> l'IFPC. Les deux publics doivent cohabiter.

---

## 1. Ce que le client demande

| # | Demande | Lot |
|---|---|---|
| 1 | Onglet participant : supprimer les créneaux ; les participants rejoignent par QR code / URL la séance créée par le cidrier | 1 et 2 |
| 2 | Onglet admin : supprimer l'onglet créneaux, et la rubrique créneau dans la création de séance | 1 |
| 3 | Échantillons : pouvoir joindre une image au descriptif, affichée **à la fin** de la séance, dans le résumé, à côté du code et du descriptif | 3 |
| 4 | Ajouter la fédération | **fait** |

---

## 2. Le point qui commande tout : une version, deux publics

« Supprimer » ne peut pas vouloir dire retirer le code, puisque l'IFPC continue
d'utiliser les créneaux. Il faut donc un moyen de distinguer les deux publics.

**Trois mécanismes possibles, et une recommandation.**

| | Comment | Verdict |
|---|---|---|
| **Par capacité de compte** | Le compte qui se connecte porte, ou non, la capacité `creneaux` | **Recommandé** |
| Par séance | Chaque séance est marquée « producteur » ou « IFPC » | Déplace le problème : qui choisit, et au nom de quoi ? |
| Par déploiement | Deux instances, deux configurations | Double l'hébergement, la base et la maintenance pour une différence d'affichage |

**Le mécanisme recommandé existe déjà.** `AdminView.tsx:153` lit
`peutCreneaux = !capacites || capacites.includes("creneaux")`, et les capacités
viennent des rôles PADOC chargés à l'ouverture de session
(`hooks/useSenso.ts:230`). Le rôle se donne déjà par le script d'habilitation
de PADOC.

Un animateur IFPC reçoit `animateur` **et** `creneaux`. Un cidrier ne reçoit
que `animateur`. Rien d'autre à construire, et la décision reste traçable là où
sont déjà gérés les accès.

> **Attention au défaut en place.** `!capacites` rend `true` : tant que les
> capacités ne sont pas chargées, tout est montré. Pour un affichage c'est le
> bon choix — une interface qui s'ampute puis se remplit paraît cassée — mais
> cela veut dire que **le serveur doit refuser de son côté**, et pas seulement
> l'interface. `requireCapacite` existe déjà (`lib/server/adminAuth.ts:198`) ;
> il faut vérifier qu'il couvre bien toutes les routes de créneaux.

---

## 3. Lot 1 — Retirer les créneaux aux producteurs

**Déjà en place :** l'onglet « Créneaux » de l'administration est conditionné
par la capacité.

**À faire :**

1. **La rubrique créneau dans la création de séance** n'est pas conditionnée.
   À reprendre dans l'éditeur de séance, sur le même test que l'onglet.
2. **Le panneau créneaux côté participant** (`LandingScreen.tsx:43`) s'affiche
   selon les **données** : il appelle `/api/public/slots` et se montre si la
   réponse n'est pas vide. Pour un producteur, cette liste sera vide — le
   panneau disparaîtra donc tout seul. C'est une coïncidence heureuse, pas une
   règle : si un jour une séance IFPC et une séance producteur coexistent, le
   panneau réapparaîtrait pour tout le monde. **À remplacer par une règle
   explicite**, portée par la séance rejointe.
3. **Vérifier les routes serveur** : chaque route de créneau doit refuser un
   compte sans la capacité, indépendamment de ce que montre l'interface.

**Difficulté :** faible. **Risque :** faible.

---

## 4. Lot 2 — Rejoindre une séance par QR code ou URL

C'est le vrai travail neuf du chantier. Aujourd'hui le participant choisit sa
séance dans une liste ; demain il arrive directement dedans.

**À construire :**

1. **Une adresse d'entrée par séance**, par exemple `/s/<identifiant>`, qui
   place le participant dans la bonne séance sans passer par la liste.
2. **Un jeton dans l'adresse**, et non l'identifiant seul. Les identifiants de
   séance sont devinables ; sans jeton, n'importe qui peut entrer dans la
   dégustation d'un producteur en modifiant l'URL. Un jeton aléatoire par
   séance, régénérable, règle le cas.
3. **Le QR code dans l'écran d'administration**, sur la carte de la séance :
   affichage à l'écran, et impression. Aucune bibliothèque de QR code n'est
   présente — il faut en ajouter une, ou produire le SVG soi-même.
4. **Le parcours participant** : arriver par l'adresse doit sauter l'écran de
   choix de séance et mener directement à l'identification du dégustateur.

**À trancher :** que se passe-t-il si la séance est close, ou si le jeton a été
régénéré ? Un message clair, pas une page vide.

**Difficulté :** moyenne. **Risque :** le jeton. Sans lui, la fonctionnalité
est une faille.

---

## 5. Lot 3 — Une photo par échantillon

**Le modèle actuel :** `Product { code: string; label?: string }`
(`types/index.ts:49`). Les échantillons vivent dans le `config` de la séance,
une colonne `jsonb` (`db/install-postgres.sql:168`).

**Où la photo doit apparaître :** `AnalyseSynthese.tsx:79` affiche déjà le code
et, à côté, le descriptif. C'est là que l'image se place.

**Où stocker les images — trois options, une recommandation :**

| | Verdict |
|---|---|
| **Une table dédiée, en `bytea`** | **Recommandé.** Fonctionne à l'identique sur Vercel et sur la VM, sauvegardée avec la base, aucun service à ajouter |
| Un service d'objets (Vercel Blob) | Fonctionne sur Vercel, pas sur la VM : le comportement divergerait selon l'hébergement |
| En `data:` dans le `config` | Le plus simple à écrire, le pire à l'usage : le `config` est relu à chaque chargement de séance, et pèserait alors plusieurs mégaoctets |

**Deux précautions :**

- **Réduire l'image dans le navigateur avant l'envoi.** Une photo de téléphone
  fait 3 à 5 Mo ; 1 200 px de large suffisent largement pour un bandeau de
  résumé. Sans cela, la base grossit vite et l'envoi échoue sur un réseau de
  chai.
- **Plafonner la taille acceptée côté serveur**, et refuser proprement : un
  téléversement qui échoue sans message est le plus sûr moyen de faire
  renoncer un utilisateur.

**À trancher :** la photo doit-elle apparaître aussi dans le résumé que le
**participant** consulte à la fin (`DoneScreen` → résumé), ou seulement dans
celui de l'animateur ? La demande dit « affichée à la fin de la séance » et
décrit le parcours administrateur ; la lecture la plus utile est que le
participant la voie aussi, puisque c'est à ce moment qu'on lui révèle ce qu'il
a dégusté.

**Difficulté :** moyenne. **Risque :** le stockage, si on choisit mal.

---

## 6. Lot 4 — Fédération : fait

Un compte PADOC ouvre CiderScope, l'espace est choisi selon le compte, et
l'habilitation reste un acte d'administration. Il reste à **configurer la
production** — variables côté Railway et Vercel.

---

## 7. Ce que la demande implique sans le dire

**Aujourd'hui, tout administrateur voit toutes les séances.**

`lib/server/sessionStore.ts:88` liste les séances sans aucun filtre, et la
table `sessions` n'a pas de colonne propriétaire.

Tant que les seuls administrateurs étaient les animateurs de l'IFPC, c'était
cohérent : une équipe, un jeu de séances. Dès que plusieurs cidriers créent
leurs propres dégustations sur la même instance, chacun voit celles des autres
— et peut les modifier ou les supprimer.

Ce n'est pas dans la liste du client, mais sa demande ne tient pas sans. **Il
faut un propriétaire par séance**, et une liste filtrée sur lui, les animateurs
IFPC conservant une vue d'ensemble.

C'est le même cloisonnement que PADOC a déjà mis en place pour ses cuves et ses
lots : la démarche y est éprouvée et peut servir de modèle.

**Difficulté :** moyenne. **Risque : élevé si on l'omet.** Un producteur qui
découvre les dégustations d'un concurrent est un incident qu'aucune
fonctionnalité ne rattrape.

---

## 8. Ordre proposé

1. **Le cloisonnement par propriétaire** (§7). Tout le reste s'y adosse, et le
   faire après imposerait de reprendre les écrans déjà livrés.
2. **Les créneaux conditionnés** (§3). Court, visible, sans risque.
3. **L'entrée par QR code** (§4). C'est ce qui change le quotidien des
   participants.
4. **La photo d'échantillon** (§5). Indépendante du reste, livrable à part.

---

## 9. À trancher avant de commencer

1. Un cidrier crée-t-il ses séances lui-même, ou l'IFPC les crée-t-il pour lui ?
   La réponse change entièrement le lot 1 du §8.
2. La photo est-elle montrée au participant, ou seulement à l'animateur ?
3. Combien de producteurs sont attendus sur l'instance, et à quelle échéance ?
   Cela décide de l'urgence du cloisonnement.
4. Les créneaux doivent-ils disparaître **de l'interface** seulement, ou les
   routes doivent-elles aussi refuser l'accès ? (La seconde réponse est la
   bonne, mais elle demande à être confirmée avec le client.)
