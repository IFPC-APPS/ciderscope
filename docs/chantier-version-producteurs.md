# Chantier — CiderScope pour les producteurs

> État des lieux et plan de travail, établi le 7 octobre 2026 à partir de la
> demande client et d'une lecture du code existant.
>
> **Deux contraintes posées :** ne rien retirer de ce qui sert à l'IFPC, et
> **les séances restent créées par l'IFPC**, pas par les cidriers. Les
> producteurs n'administrent pas : ils dégustent.

---

## 1. Ce que le client demande

| # | Demande | Lot |
|---|---|---|
| 1 | Onglet participant : supprimer les créneaux ; les participants rejoignent par QR code / URL la séance de dégustation | 1 et 2 |
| 2 | Onglet admin : supprimer l'onglet créneaux, et la rubrique créneau dans la création de séance | 1 |
| 3 | Échantillons : pouvoir joindre une image au descriptif, affichée **à la fin** de la séance, dans le résumé, à côté du code et du descriptif | 3 |
| 4 | Ajouter la fédération | **fait** |

---

## 2. Le point qui commande tout : le genre de la séance

« Supprimer » ne peut pas vouloir dire retirer le code : l'IFPC continue
d'organiser ses panels avec créneaux. Il faut donc distinguer les deux usages.

**La distinction porte sur la séance, et non sur le compte.** C'est la
conséquence directe du fait que l'IFPC crée les deux sortes : le même compte,
le même animateur, a besoin des créneaux pour un panel et pas pour une
dégustation producteur. Une capacité attachée au compte ne sait pas exprimer
cela — elle vaudrait pour toutes ses séances à la fois.

> Le code porte déjà une capacité `creneaux` (`AdminView.tsx:153`,
> `lib/server/adminAuth.ts:20`), alimentée par les rôles PADOC. Elle reste
> utile pour décider **qui a le droit** d'organiser des créneaux. Elle ne peut
> pas décider **quelle séance** en comporte. Les deux mécanismes se complètent,
> ils ne se remplacent pas.

**Ce qui existe déjà, et pourquoi ça ne suffit pas.** `SessionListItem` porte
`hasSlotSchedule` (`types/index.ts:69`), mais c'est une valeur **déduite** :
`slotDates.length > 0` (`sessionStore.ts:129`). Or à la création d'une séance,
aucun créneau n'existe encore — une séance IFPC toute neuve est donc
indiscernable d'une séance producteur. L'inférence ne peut pas décider ce qu'il
faut afficher au moment où il faut le décider.

**À faire :** déclarer le genre à la création, dans le `config` de la séance
(colonne `jsonb`, rien à migrer) :

```
genre: "panel" | "degustation"
```

- `panel` — l'usage IFPC actuel : créneaux, inscriptions, invitations.
- `degustation` — l'usage producteur : pas de créneaux, entrée par QR code.

Un seul champ, choisi une fois, qui commande ensuite tous les affichages. Les
séances existantes, sans ce champ, sont des `panel` : c'est ce qu'elles sont, et
rien ne change pour l'IFPC.

---

## 3. Lot 1 — Les créneaux, selon le genre de la séance

**À faire :**

1. **Le choix du genre à la création de séance**, en premier, car il commande
   le reste du formulaire.
2. **La rubrique créneau du formulaire** n'apparaît que pour un `panel`.
3. **L'onglet « Créneaux » de l'administration** reste, mais ne liste que les
   `panel`. Le retirer purement et simplement priverait l'IFPC de son outil.
4. **Le panneau créneaux côté participant** (`LandingScreen.tsx:43`) s'affiche
   aujourd'hui selon les **données** : il interroge `/api/public/slots` et se
   montre si la réponse n'est pas vide. Pour une dégustation producteur la
   liste sera vide, donc le panneau disparaîtra — **mais par coïncidence, pas
   par règle**. Dès qu'un panel IFPC et une dégustation producteur coexistent,
   il réapparaît pour tout le monde. À remplacer par une règle explicite.

**Difficulté :** faible. **Risque :** faible, à condition de ne pas confondre
« retirer l'onglet » et « retirer l'onglet pour certaines séances ».

---

## 4. Lot 2 — Rejoindre une séance par QR code ou URL

C'est le vrai travail neuf. Aujourd'hui le participant choisit sa séance dans
une liste ; demain il arrive directement dedans.

**À construire :**

1. **Une adresse d'entrée par séance**, par exemple `/s/<identifiant>`, qui
   place le participant dans la bonne séance sans passer par la liste.
2. **Un jeton dans l'adresse**, et non l'identifiant seul. Les identifiants de
   séance sont devinables ; sans jeton, n'importe qui entre dans une
   dégustation en modifiant l'URL. Un jeton aléatoire par séance, régénérable,
   règle le cas.
3. **Le QR code dans l'écran d'administration**, sur la carte de la séance :
   affichage à l'écran et impression — une dégustation en chai se fait avec une
   feuille posée sur la table, pas avec un lien envoyé par courriel. Aucune
   bibliothèque de QR code n'est présente, il faut en ajouter une.
4. **Le parcours participant** : arriver par l'adresse saute l'écran de choix
   et mène directement à l'identification du dégustateur.

**Décidé avec le client :**

- **Aucune connexion n'est demandée au dégustateur**, et il n'est pas
  nécessairement un utilisateur de PADOC. L'adresse EST le droit d'entrée.
  C'est ce qui rend le jeton obligatoire et non facultatif : il n'y a rien
  d'autre entre le public et la dégustation.
- **Une séance peut être rejouée.** Le jeton ne doit donc pas être à usage
  unique ni expirer à la clôture : la même feuille imprimée doit resservir.
  Il reste régénérable à la demande, pour le cas où une adresse aurait fuité.
- **Le serveur refuse**, et pas seulement l'interface : un jeton absent ou
  faux fait répondre une erreur, quelle que soit la page affichée.

**Conséquence sur l'écran d'entrée.** Une version intermédiaire de cet écran
faisait de la connexion IFPC la seule porte : un dégustateur arrivé sur la
racine — QR mal scanné, retour en arrière, adresse tapée de mémoire — se
retrouvait devant un formulaire qui ne le concernait pas, sans recours.
L'action principale y est donc « Rejoindre une dégustation », sans compte, et
la connexion par compte est devenue le lien discret des animateurs.

**Difficulté :** moyenne. **Risque :** le jeton. Sans lui, la fonctionnalité
est une faille — et elle l'est d'autant plus qu'aucune connexion ne la
protège par ailleurs.

---

## 5. Lot 3 — Une photo par échantillon

**Le modèle actuel :** `Product { code: string; label?: string }`
(`types/index.ts:49`). Les échantillons vivent dans le `config` de la séance,
une colonne `jsonb` (`db/install-postgres.sql:168`).

**Où la photo doit apparaître :** `AnalyseSynthese.tsx:79` affiche déjà le code
et, à côté, le descriptif. C'est là qu'elle se place.

**Où stocker les images — trois options, une recommandation :**

| | Verdict |
|---|---|
| **Une table dédiée, en `bytea`** | **Recommandé.** Même comportement sur Vercel et sur la VM, sauvegardée avec la base, aucun service à ajouter |
| Un service d'objets (Vercel Blob) | Fonctionne sur Vercel, pas sur la VM : le comportement divergerait selon l'hébergement |
| En `data:` dans le `config` | Le plus simple à écrire, le pire à l'usage : le `config` est relu à chaque chargement de séance et pèserait alors plusieurs mégaoctets |

**Deux précautions :**

- **Réduire l'image dans le navigateur avant l'envoi.** Une photo de téléphone
  fait 3 à 5 Mo ; 1 200 px de large suffisent pour un bandeau de résumé. Sans
  cela la base grossit vite, et l'envoi échoue sur le réseau d'un chai.
- **Plafonner la taille côté serveur et refuser proprement.** Un téléversement
  qui échoue sans message est le plus sûr moyen de faire renoncer quelqu'un.

**Décidé avec le client : la photo est montrée aux participants, à la fin de
la séance.** C'est le moment où on leur révèle ce qu'ils ont dégusté, et c'est
là qu'une image a le plus de valeur. Elle apparaît donc dans le résumé que le
participant consulte depuis `DoneScreen`, et pas seulement dans celui de
l'animateur.

Cela déplace une contrainte : l'image est servie à tout le panel en même
temps, en fin de séance, souvent sur le réseau d'un chai. La réduction avant
envoi n'est plus un confort, c'est ce qui décide si le résumé s'affiche.

**Difficulté :** moyenne. **Risque :** le stockage, si on choisit mal.

---

## 6. Lot 4 — Fédération : fait

Un compte PADOC ouvre CiderScope, l'espace est choisi selon le compte, et
l'habilitation reste un acte d'administration. Il reste à **configurer la
production** — variables côté Railway et Vercel.

---

## 7. Un point à surveiller, sans urgence

Toute personne administratrice voit toutes les séances :
`lib/server/sessionStore.ts:88` les liste sans filtre, et la table `sessions`
n'a pas de colonne propriétaire.

**Tant que l'IFPC seule crée les séances, c'est cohérent** — une équipe, un jeu
de séances — et il n'y a rien à faire.

Cela cesserait de l'être le jour où un cidrier créerait ses propres
dégustations : chacun verrait et pourrait modifier celles des autres. À garder
en tête si la demande évolue dans ce sens ; PADOC a déjà mis en place ce
cloisonnement pour ses cuves et ses lots, la démarche y est éprouvée.

---

## 8. Ordre proposé

1. **Le genre de séance** (§2). Un champ, mais tout le reste s'y adosse.
2. **Les créneaux conditionnés** (§3). Court et visible, une fois §1 posé.
3. **L'entrée par QR code** (§4). C'est ce qui change le quotidien des
   participants, et le gros du travail.
4. **La photo d'échantillon** (§5). Indépendante du reste, livrable à part et
   en parallèle si plusieurs personnes travaillent.

---

## 9. Décisions prises

| Question | Réponse |
|---|---|
| La photo est-elle vue par le participant ? | **Oui**, à la fin de la séance |
| Le QR code demande-t-il une connexion ? | **Non.** Ni compte, ni appartenance à PADOC — l'adresse est le droit d'entrée |
| Une séance est-elle rejouable ? | **Oui.** Le jeton survit à la clôture et la feuille imprimée resert |
| Les créneaux doivent-ils être refusés côté serveur ? | **Oui**, et pas seulement masqués dans l'interface |

### Ce qui reste ouvert

1. Le QR code doit-il être imprimable par séance seulement, ou aussi par poste
   de dégustation ?
2. Faut-il un moyen de rejoindre sans scanner — un code court à saisir — pour
   le dégustateur dont le téléphone ne lit pas les QR codes ?
