import { FiLogOut, FiSettings, FiUsers } from "react-icons/fi";

interface TopbarProps {
  mode: "home" | "participant" | "admin";
  onModeChange: (mode: "participant" | "admin") => void;
  online?: boolean;
  onLogout?: () => void;
  /** Nom affiché du compte connecté, s'il y en a un. */
  nomUtilisateur?: string | null;
  /** Le compte peut-il administrer ? Seul lui voit la bascule entre espaces. */
  administrateur?: boolean;
}

/**
 * Bandeau supérieur, aligné sur celui de PADOC : même logo, même façon de
 * nommer l'application, mêmes tons neutres.
 *
 * Deux entrées ont disparu. « Accueil » renvoyait à l'écran de choix
 * Participant / Admin, qui n'existe plus — l'espace découle du compte. Et la
 * bascule entre espaces n'est montrée qu'aux animateurs : la proposer à un
 * panéliste revenait à lui offrir une porte fermée.
 */
const navButtonClass = (active = false, danger = false) => [
  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-[7px] text-xs font-medium whitespace-nowrap transition-colors sm:min-h-[38px] sm:px-3 sm:py-2 sm:text-[13px]",
  active
    ? "bg-[rgba(98,141,23,.07)] font-semibold text-[var(--primary)]"
    : "text-gray-400 hover:bg-gray-50 hover:text-gray-700",
  danger ? "hover:bg-[rgba(198,40,40,.06)] hover:text-[var(--danger)]" : "",
].filter(Boolean).join(" ");

export const Topbar = ({
  mode,
  onModeChange,
  online = false,
  onLogout,
  nomUtilisateur,
  administrateur = false,
}: TopbarProps) => (
  <div className="fixed inset-x-0 top-0 z-[100] flex h-13 max-w-[100vw] flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-gray-100 bg-white/95 px-3 backdrop-blur-sm [scrollbar-width:none] sm:h-15 sm:gap-3 sm:px-6 [&::-webkit-scrollbar]:hidden">
    <div className="flex items-center gap-2.5 whitespace-nowrap">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="h-[26px] w-[26px] shrink-0 object-contain sm:h-[32px] sm:w-[32px]"
        src="/assets/log.svg"
        alt="IFPC"
      />
      <span className="text-[13px] font-bold text-[var(--primary)]">IFPC</span>
      <span className="text-lg font-light leading-none text-gray-300">·</span>
      <span className="text-[13px] font-bold text-gray-900">CiderScope</span>
    </div>

    <div className="flex-1" />

    {nomUtilisateur && (
      <span className="hidden max-w-[22ch] truncate text-[13px] text-gray-500 md:inline">
        {nomUtilisateur}
      </span>
    )}

    <span
      className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium md:inline-flex ${
        online
          ? "border-[rgba(98,141,23,.18)] bg-[rgba(98,141,23,.07)] text-[var(--primary)]"
          : "border-[rgba(198,40,40,.18)] bg-[rgba(198,40,40,.06)] text-[var(--danger)]"
      }`}
      // Le mot, et pas seulement la pastille : l'état doit se lire sans
      // distinguer le vert du rouge.
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${online ? "animate-pulse bg-[var(--primary)]" : "bg-[var(--danger)]"}`}
        aria-hidden="true"
      />
      {online ? "Connecté" : "Local"}
    </span>

    <div className="flex gap-px sm:gap-1">
      {administrateur && (
        <>
          <button
            className={navButtonClass(mode === "participant")}
            onClick={() => onModeChange("participant")}
            title="Espace participant"
            aria-label="Espace participant"
          >
            <FiUsers size={14} />
            <span className="hidden sm:inline">Passation</span>
          </button>
          <button
            className={navButtonClass(mode === "admin")}
            onClick={() => onModeChange("admin")}
            title="Espace d'administration"
            aria-label="Espace d'administration"
          >
            <FiSettings size={14} />
            <span className="hidden sm:inline">Administration</span>
          </button>
        </>
      )}
      {onLogout && (
        <button
          className={navButtonClass(false, true)}
          onClick={onLogout}
          title="Se déconnecter"
          aria-label="Se déconnecter"
        >
          <FiLogOut size={14} />
          <span className="hidden sm:inline">Déconnexion</span>
        </button>
      )}
    </div>
  </div>
);
