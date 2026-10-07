export type QuestionType = "scale" | "radar" | "classement" | "seuil" | "seuil-bet" | "text" | "qcm" | "triangulaire" | "duo-trio" | "a-non-a";

// Niveau d'un test de seuil BET (3-AFC) : concentration + 3 codes + réponse correcte.
export interface BetLevel {
  label: string;        // libellé libre (ex. "0,1 g/L")
  concentration: number; // valeur numérique pour calcul BET (unité cohérente dans la série)
  codes: [string, string, string];
  correctAnswer: string; // code de l'échantillon "différent"
}

// Un axe d'un radar = un critère noté 0→max.
// Arbre de décision : chaque nœud peut avoir des enfants (sous-critères de plus en plus fins).
// Les feuilles (sans `children`) sont les descripteurs ultimes (ex: "Anis", "Noix").
export interface RadarAxis {
  label: string;
  children?: RadarAxis[];   // sous-arbre récursif
  subCriteria?: string[];   // legacy (ancienne liste plate) — conservé pour compat lecture
}

export interface RadarGroup {
  id: string;           // stable key (ex: "main", "fruits", "autres")
  title: string;        // titre du radar (affiché au participant)
  axes: RadarAxis[];
}

export interface Question {
  id: string;
  type: QuestionType;
  label: string;
  scope: "per-product" | "global" | "standalone";
  min?: number;
  max?: number;
  labelMin?: string;
  labelMax?: string;
  placeholder?: string;
  options?: string[];
  multiple?: boolean;
  rankInstruction?: string;
  correctOrder?: string[];
  codes?: string[];
  correctAnswer?: string;
  refCode?: string;
  betLevels?: BetLevel[];
  subCriteria?: string[];   // scale: sous-critères pour évaluation fine
  questionText?: string;    // duo-trio, a-non-a: consigne personnalisée
  radarGroups?: RadarGroup[]; // radar: liste des groupes de critères (toile d'araignée par groupe)
}

export interface Product {
  code: string;
  label?: string;
}

/**
 * À quel usage la séance est destinée.
 *
 * - `panel` : l'usage IFPC — créneaux, inscriptions, invitations.
 * - `degustation` : l'usage producteur — pas de créneaux, entrée par QR code.
 *
 * Le genre appartient à la SÉANCE et non au compte : le même animateur IFPC
 * organise les deux, et une capacité attachée à son compte vaudrait pour
 * toutes ses séances à la fois.
 *
 * Il ne peut pas non plus se déduire de l'existence de créneaux : à la
 * création, aucun n'existe encore, et c'est précisément à ce moment qu'il faut
 * décider quoi afficher.
 */
export type GenreSeance = "panel" | "degustation";

export interface SessionConfig {
  name: string;
  date: string;
  animateur?: string;
  password?: string;
  products: Product[];
  questions: Question[];
  presMode: "fixed" | "latin" | "random";
  /** Absent sur les séances antérieures : elles sont des `panel`. */
  genre?: GenreSeance;
}

export interface SessionListItem {
  id: string;
  name: string;
  date: string;
  active: boolean;
  hasSlotSchedule?: boolean;
  /** Renseigné par la route d'administration ; absent côté public. */
  genre?: GenreSeance;
  slotDate?: string | null;
  slotDates?: string[];
  jurorCount: number;
  productCount?: number;
  questionCount?: number;
  resultsVisible?: boolean; // l'animateur a autorisé l'affichage du résumé aux jurys
}

export interface HelpRequest {
  id: string;
  requestedAt: string;
  stepIndex: number;
  acknowledgedAt?: string;
}

// ── Answer value shapes ─────────────────────────────────────────────────────
// Réponse à une échelle avec sous-critères : { _: noteGlobale, _subs: [labels…], [label]: note }
// `_touched` indique que le jury a explicitement validé la note principale
// (drag du curseur ou tap sur le pouce), prérequis pour passer à l'étape suivante.
export interface ScaleAnswer {
  _: number;
  _subs: string[];
  _touched?: boolean;
  [subLabel: string]: number | string[] | boolean | undefined;
}

// Nœud de réponse radar récursif : { _: note, children?: { [label]: RadarNodeAnswer } }
// `_touched` est posé sur les noeuds racine (familles) dès qu'ils ont été
// délibérément interagis par le jury (drag du slider OU tap sur le pouce).
// Sert à la validation au passage à l'étape suivante.
export interface RadarNodeAnswer {
  _: number;
  _touched?: boolean;
  children?: Record<string, RadarNodeAnswer>;
}

// Réponse radar : map axe-de-premier-niveau → nœud récursif.
export type RadarAnswer = Record<string, RadarNodeAnswer>;

// Toute forme possible pour la valeur d'une question (brute, stockée en DB).
// - number : échelle simple
// - string : texte, qcm single, triangulaire, duo-trio
// - string[] : qcm multiple, classement, seuil
// - ScaleAnswer : échelle avec sous-critères
// - RadarAnswer : radar (axes + sous-critères)
// - Record<string,string> : a-non-a (par code), seuil-bet (par niveau)
export type AnswerValue =
  | number
  | string
  | string[]
  | ScaleAnswer
  | RadarAnswer
  | Record<string, string>
  | null
  | undefined;

// Les clés "_rank", "_discrim", "_global", "_timing", "_finished", "_poste", "_completedSteps" sont réservées ; les autres sont des codes échantillon.
// Par produit : Record<questionId, AnswerValue>.
// Pour "_global" : Record<questionId, AnswerValue>.
// Pour les autres : structures ad hoc typées plus souplement.
type JurorAnswerValue =
  | AnswerValue
  | HelpRequest[]
  | Record<string, AnswerValue>
  | Record<string, number>
  | Record<string, boolean>
  | Record<string, string | number>
  | boolean
  | undefined;

export type JurorAnswers = {
  _finished?: boolean;
  _poste?: Record<string, string | number>;
  _completedSteps?: Record<string, boolean>;
  _helpRequests?: HelpRequest[];
  [key: string]: JurorAnswerValue;
};

// Map globale : nom du jury → ses réponses.
export type AllAnswers = Record<string, JurorAnswers>;

// ── UI / app state ─────────────────────────────────────────────────────────
export type AppMode = "home" | "participant" | "admin";
export type AppScreen = "landing" | "jury" | "poste" | "order" | "form" | "done" | "summary" | "edit";

export type PosteDay = "mardi" | "jeudi";
export interface Poste {
  day: PosteDay;
  num: number; // 1..POSTES_PER_DAY
}
export type SaveStatus = "idle" | "saving" | "saved" | "error" | "pending";

// ── Steps générés pour le questionnaire ────────────────────────────────────
export type SessionStep =
  | { type: "product"; product: Product; questions: Question[] }
  | { type: "ranking"; question: Question }
  | { type: "discrim"; question: Question }
  | { type: "global"; questions: Question[] };

// ── CSV rows (export + analyses) ───────────────────────────────────────────
export interface CSVRow {
  jury: string;
  produit: string;
  question: string;
  type?: string;
  valeur: string;
  correct?: string;
  [key: string]: string | undefined;
}
