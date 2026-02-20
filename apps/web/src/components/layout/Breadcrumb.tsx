import { useLocation, useNavigate } from "react-router";
import { NAV_BACK, NAV_HOME } from "@/lib/blobUrls";

type Crumb = {
  label: string;
  path: string;
};

const ROUTE_LABELS: Record<string, string> = {
  story: "Story",
  pvp: "PvP",
  play: "Match",
  collection: "Collection",
  decks: "Decks",
  cliques: "Cliques",
  profile: "Profile",
  settings: "Settings",
  leaderboard: "Leaderboard",
  watch: "Watch",
  onboarding: "Onboarding",
  about: "About",
  privacy: "Privacy",
  terms: "Terms",
  token: "$LUNCH",
  "agent-dev": "Agent Dev",
  duel: "Duel",
  studio: "Studio",
};

/** Pages where the breadcrumb should NOT render. */
const HIDDEN_ROUTES = new Set(["/", "/onboarding"]);

/** Full-screen views that shouldn't show a breadcrumb. */
function isFullscreenRoute(pathname: string): boolean {
  return pathname.startsWith("/play/");
}

function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  const crumbs: Crumb[] = [{ label: "Home", path: "/" }];
  let accumulated = "";

  for (let i = 0; i < segments.length; i++) {
    accumulated += `/${segments[i]}`;
    const segment = segments[i]!;
    const label = ROUTE_LABELS[segment] ?? formatDynamicSegment(segment, segments[i - 1]);
    crumbs.push({ label, path: accumulated });
  }

  return crumbs;
}

function formatDynamicSegment(segment: string, parentSegment?: string): string {
  if (parentSegment === "story") return "Chapter";
  if (parentSegment === "decks") return "Builder";
  if (parentSegment === "play") return "Match";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function useShouldShow(): boolean {
  const { pathname } = useLocation();
  if (HIDDEN_ROUTES.has(pathname) || isFullscreenRoute(pathname)) return false;
  const crumbs = buildCrumbs(pathname);
  return crumbs.length > 1;
}

/** Invisible spacer matching the breadcrumb bar height. */
export function BreadcrumbSpacer() {
  const show = useShouldShow();
  if (!show) return null;
  return <div className="h-12" />;
}

export function Breadcrumb() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;

  if (HIDDEN_ROUTES.has(pathname) || isFullscreenRoute(pathname)) return null;

  const crumbs = buildCrumbs(pathname);
  if (crumbs.length <= 1) return null;

  const parentCrumb = crumbs[crumbs.length - 2]!;

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-30 h-12 px-3 flex items-center gap-2 bg-[#fdfdfb] border-b-2 border-[#121212]"
      aria-label="Breadcrumb"
    >
      {/* Back button — comic "Back" image */}
      <button
        type="button"
        onClick={() => navigate(parentCrumb.path)}
        className="shrink-0 group"
        aria-label={`Back to ${parentCrumb.label}`}
      >
        <img
          src={NAV_BACK}
          alt="Back"
          className="h-10 w-auto transition-transform group-hover:scale-105 group-active:scale-95"
          style={{ mixBlendMode: "multiply" }}
          draggable={false}
        />
      </button>

      {/* Breadcrumb trail */}
      <ol
        className="flex items-center gap-1.5 overflow-x-auto text-xs font-bold uppercase tracking-wider"
        style={{ fontFamily: "Outfit, sans-serif" }}
      >
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          const isHome = i === 0;

          return (
            <li key={crumb.path} className="flex items-center gap-1.5 whitespace-nowrap">
              {i > 0 && (
                <span className="text-[#121212]/30 select-none">/</span>
              )}
              {isHome ? (
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="shrink-0 group"
                  aria-label="Home"
                >
                  <img
                    src={NAV_HOME}
                    alt="Home"
                    className="h-7 w-auto transition-transform group-hover:scale-105 group-active:scale-95"
                    style={{ mixBlendMode: "multiply" }}
                    draggable={false}
                  />
                </button>
              ) : isLast ? (
                <span className="text-[#121212]">{crumb.label}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(crumb.path)}
                  className="text-[#121212]/50 hover:text-[#121212] transition-colors"
                >
                  {crumb.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
