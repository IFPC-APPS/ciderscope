"use client";
import { RadarAxis } from "../../../types";

// Génère un id unique pour une nouvelle question/groupe.
export const nextId = (prefix: string): string => {
  const rnd = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
};

// Applique un patch sur un nœud (identifié par son chemin d'indices dans l'arbre) d'une liste d'axes.
export function updateAxisAtPath(axes: RadarAxis[], path: number[], updater: (ax: RadarAxis) => RadarAxis): RadarAxis[] {
  if (path.length === 0) return axes;
  const [head, ...rest] = path;
  return axes.map((ax, i) => {
    if (i !== head) return ax;
    if (rest.length === 0) return updater(ax);
    const kids = ax.children ?? [];
    return { ...ax, children: updateAxisAtPath(kids, rest, updater) };
  });
}

// Supprime un nœud (identifié par path) d'une liste d'axes.
export function removeAxisAtPath(axes: RadarAxis[], path: number[]): RadarAxis[] {
  if (path.length === 0) return axes;
  const [head, ...rest] = path;
  if (rest.length === 0) return axes.filter((_, i) => i !== head);
  return axes.map((ax, i) => {
    if (i !== head) return ax;
    const kids = ax.children ?? [];
    return { ...ax, children: removeAxisAtPath(kids, rest) };
  });
}

// Ajoute un enfant à un nœud (identifié par path).
export function addChildAtPath(axes: RadarAxis[], path: number[]): RadarAxis[] {
  return updateAxisAtPath(axes, path, ax => ({
    ...ax,
    children: [...(ax.children ?? []), { label: "" }],
  }));
}

// Retourne un libellé par défaut cohérent avec le type de question si le champ est vide.
export const getDefaultLabel = (type: string): string => {
  switch (type) {
    case "radar": return "Décrivez le profil aromatique et gustatif de cet échantillon";
    case "triangulaire": return "Quel échantillon est différent des deux autres ?";
    case "duo-trio": return "Lequel de ces deux échantillons est identique au témoin ?";
    case "a-non-a": return "Cet échantillon présente-t-il le défaut ?";
    case "classement": return "Classez ces échantillons par ordre de préférence";
    case "seuil": return "Indiquez le rang de cet échantillon";
    case "seuil-bet": return "Identifiez l'échantillon différent à chaque niveau";
    case "scale": return "Notez cet échantillon";
    case "qcm": return "Sélectionnez une option";
    case "text": return "Commentaires libres";
    default: return "Nouvelle question";
  }
};

export const adminFieldGridClass = "grid grid-cols-2 gap-2.5 p-[15px] max-[720px]:grid-cols-1 max-[480px]:gap-2 min-[901px]:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] [&_.field-wrap]:flex [&_.field-wrap]:flex-col [&_.full]:col-span-full [&_label]:mb-1 [&_label]:block [&_label]:font-mono [&_label]:text-[11px] [&_label]:font-semibold [&_label]:uppercase [&_label]:tracking-[.2px] [&_label]:text-[var(--mid)] [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-[var(--border)] [&_input]:bg-[var(--paper)] [&_input]:px-4 [&_input]:py-2.5 [&_input]:text-sm [&_input]:font-[inherit] [&_input]:outline-none [&_input]:transition-colors [&_input]:duration-100 focus-within:[&_input]:border-[var(--primary)] [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-[var(--border)] [&_select]:bg-[var(--paper)] [&_select]:px-4 [&_select]:py-2.5 [&_select]:text-sm [&_select]:font-[inherit] [&_select]:outline-none focus-within:[&_select]:border-[var(--primary)] [&_textarea]:min-h-11 [&_textarea]:w-full [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-[var(--border)] [&_textarea]:bg-[var(--paper)] [&_textarea]:px-4 [&_textarea]:py-2.5 [&_textarea]:text-sm [&_textarea]:font-[inherit] [&_textarea]:outline-none focus-within:[&_textarea]:border-[var(--primary)]";

const questionTypeBorder: Record<string, string> = {
  scale: "border-l-[var(--t-scale)]",
  classement: "border-l-[var(--t-classement)]",
  seuil: "border-l-[var(--t-seuil)]",
  text: "border-l-[var(--t-text)]",
  qcm: "border-l-[var(--t-qcm)]",
  triangulaire: "border-l-[var(--t-triangulaire)]",
  "duo-trio": "border-l-[var(--t-duotrio)]",
  "a-non-a": "border-l-[var(--t-anona)]",
};

export const questionBuilderClass = (type: string) => [
  "mb-3.5 overflow-hidden rounded-[var(--radius)] border border-l-4 border-[var(--border)] bg-[var(--paper)] shadow-[var(--shadow)] transition-shadow duration-200 hover:shadow-[0_3px_18px_rgba(30,46,46,.09)]",
  questionTypeBorder[type] ?? "border-l-[var(--mid)]",
].join(" ");

export const questionBuilderHeaderClass = "flex items-center gap-2.5 border-b border-[var(--border)] bg-[var(--paper)] px-[17px] py-3";
export const questionNumberClass = "rounded-[3px] bg-[var(--paper3)] px-2 py-0.5 font-mono text-[11px] text-[var(--mid)]";
export const adminIconButtonClass = "inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-1.5 text-[var(--mid)] transition-all duration-100 hover:bg-[rgba(168,50,40,.07)] hover:text-[var(--danger)]";
export const questionTypeBodyClass = "border-t border-[var(--border)] bg-[var(--paper)] p-[17px]";
export const scopeButtonClass = (active: boolean) => [
  "min-h-9 cursor-pointer rounded-full border px-3.5 py-2 text-xs font-medium transition-all duration-100 hover:border-[rgba(30,46,46,.35)]",
  active ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--border)] bg-[var(--paper)]",
].join(" ");

export const adminChipClass = (active?: boolean, draggable?: boolean) => [
  "inline-flex min-h-9 select-none items-center gap-1 rounded-full border px-[15px] py-2 font-mono text-[13px] font-semibold transition-all duration-100 hover:border-[rgba(30,46,46,.3)]",
  active ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--border)] bg-[var(--paper)]",
  draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
].join(" ");

export const chipRemoveButtonClass = "inline-flex cursor-pointer items-center justify-center rounded-[3px] border-none bg-transparent p-1 text-inherit opacity-50 transition-opacity duration-100 hover:opacity-100";
export const chipPoolClass = (dragOver = false) => [
  "flex min-h-9 flex-wrap gap-2 px-0 py-2 pb-1",
  dragOver ? "border-[var(--accent)] bg-[var(--accent-tint)]" : "",
].join(" ");
export const chipPoolSectionClass = "mb-3.5";
export const poolHintClass = "mb-[7px] block font-mono text-[11px] italic text-[var(--mid)]";
export const builderSectionLabelClass = "mb-2 border-b border-[var(--border)] pb-1 font-mono text-[10px] font-bold uppercase tracking-[1px] text-[var(--accent)]";

export const dropSlotClass = (dragOver = false, filled = false, extra = "") => [
  "flex min-h-[90px] flex-1 flex-col items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-[var(--border)] bg-[var(--paper)] p-[15px] transition-all duration-150 max-[480px]:min-w-0",
  dragOver ? "border-solid border-[var(--accent)] bg-[var(--accent-tint)]" : "",
  filled ? "border-solid bg-[var(--paper)]" : "",
  extra,
].filter(Boolean).join(" ");
export const dropSlotLabelClass = "text-center font-mono text-[10px] font-bold uppercase tracking-[.7px] text-[var(--mid)]";
export const dropSlotHintClass = "text-[11px] italic text-[var(--mid)]";

export const draggableListClass = "mt-2 flex flex-col gap-2";
export const draggableItemClass = (dragging = false, dragOver = false, unordered = false) => [
  "flex min-h-[50px] select-none items-center gap-3 rounded-lg border px-[17px] py-3 transition-[background,box-shadow,transform] duration-100",
  unordered ? "cursor-pointer border-dashed bg-[var(--paper)] opacity-[.42] hover:border-[var(--accent)] hover:bg-[var(--accent-tint)] hover:opacity-75" : "cursor-default border-[var(--border)] bg-[var(--paper)] shadow-[0_1px_3px_rgba(30,46,46,.04)] hover:border-[rgba(30,46,46,.22)] hover:shadow-[0_2px_10px_rgba(30,46,46,.08)]",
  dragging ? "scale-[.96] opacity-[.35]" : "",
  dragOver ? "scale-[1.01] border-[var(--accent)] bg-[var(--accent-tint)] shadow-[0_0_0_2px_rgba(191,100,8,.15)]" : "",
].filter(Boolean).join(" ");
export const dragHandleClass = "cursor-grab text-base leading-none text-[var(--mid)] opacity-45 tracking-[-2px] active:cursor-grabbing";
export const rankPositionClass = "min-w-[26px] rounded-[3px] bg-[var(--paper2)] px-2 py-0.5 text-center font-mono text-xs font-medium text-[var(--mid)]";
export const rankCodeClass = "flex-1 font-mono text-[15px] font-bold text-[var(--ink)]";
