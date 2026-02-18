import { useState } from "react";
import { useConvexAuth } from "convex/react";
import { apiAny, useConvexQuery } from "@/lib/convexHelpers";

type CardDef = {
  _id: string;
  name: string;
  cardType: string;
  archetype?: string;
  attack?: number;
  defense?: number;
  description?: string;
  flavorText?: string;
  rarity?: string;
  isActive?: boolean;
};
type UserCardCount = { cardDefinitionId: string; quantity: number };

const ARCHETYPE_COLORS: Record<string, string> = {
  dropouts: "#e53e3e",
  preps: "#3182ce",
  geeks: "#d69e2e",
  freaks: "#805ad5",
  nerds: "#38a169",
  goodies: "#a0aec0",
};

const TYPE_LABELS: Record<string, string> = {
  stereotype: "Stereotype",
  spell: "Spell",
  trap: "Trap",
  vice: "Vice",
};

export function Collection() {
  const { isAuthenticated } = useConvexAuth();
  const allCards = useConvexQuery(apiAny.game.getCatalogCards, {}) as CardDef[] | undefined;
  const userCards = useConvexQuery(
    apiAny.game.getUserCardCounts,
    isAuthenticated ? {} : "skip",
  ) as UserCardCount[] | undefined;

  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const ownedIds = new Set((userCards ?? []).map((c) => c.cardDefinitionId));

  const filtered = (allCards ?? []).filter((card) => {
    if (!card.isActive) return false;
    if (filter !== "all" && card.archetype !== filter && card.cardType !== filter) return false;
    if (search && !card.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const archetypes = [...new Set((allCards ?? []).map((c) => c.archetype).filter(Boolean))];

  return (
    <div className="min-h-screen bg-[#fdfdfb]">
      {/* Header */}
      <header className="border-b-2 border-[#121212] px-6 py-5">
        <h1
          className="text-4xl tracking-tighter"
          style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
        >
          COLLECTION
        </h1>
        <p
          className="text-sm text-[#666] mt-1"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          {allCards ? `${filtered.length} cards` : "Loading..."}{" "}
          {userCards ? `· ${ownedIds.size} owned` : ""}
        </p>
      </header>

      {/* Filters */}
      <div className="border-b-2 border-[#121212] px-6 py-3 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cards..."
          className="px-3 py-1.5 border-2 border-[#121212] bg-white text-sm font-bold w-48 focus:outline-none focus:ring-2 focus:ring-[#ffcc00]"
          style={{ fontFamily: "Outfit, sans-serif" }}
        />

        <div className="flex gap-1 flex-wrap">
          <FilterPill
            label="All"
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {archetypes.map((a) => (
            <FilterPill
              key={a}
              label={a!}
              active={filter === a}
              onClick={() => setFilter(a!)}
              color={ARCHETYPE_COLORS[a!]}
            />
          ))}
          <FilterPill
            label="Spells"
            active={filter === "spell"}
            onClick={() => setFilter("spell")}
          />
          <FilterPill
            label="Traps"
            active={filter === "trap"}
            onClick={() => setFilter("trap")}
          />
        </div>
      </div>

      {/* Card Grid */}
      <div className="p-4 md:p-6">
        {!allCards ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-[#666] py-20 font-bold uppercase text-sm">
            No cards match your filters.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map((card) => (
              <CardTile
                key={card._id}
                card={card}
                owned={ownedIds.has(card._id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 text-xs font-bold uppercase tracking-wider border-2 border-[#121212] transition-all ${active
          ? "bg-[#121212] text-white shadow-[2px_2px_0px_0px_rgba(18,18,18,1)]"
          : "bg-white text-[#121212] hover:bg-[#f0f0f0]"
        }`}
      style={{
        fontFamily: "Outfit, sans-serif",
        borderColor: active && color ? color : "#121212",
        backgroundColor: active ? (color ?? "#121212") : undefined,
      }}
    >
      {label}
    </button>
  );
}

function CardTile({ card, owned }: { card: CardDef; owned: boolean }) {
  const color = ARCHETYPE_COLORS[card.archetype ?? ""] ?? "#666";
  const typeLabel = TYPE_LABELS[card.cardType] ?? card.cardType;

  return (
    <div
      className={`paper-panel p-4 transition-all hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(18,18,18,1)] ${!owned ? "opacity-40 grayscale" : ""
        }`}
    >
      {/* Type badge */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 border border-[#121212]"
          style={{ fontFamily: "Outfit, sans-serif", color }}
        >
          {typeLabel}
        </span>
        {owned && (
          <span className="text-[10px] text-[#ffcc00] font-bold uppercase">Owned</span>
        )}
      </div>

      {/* Card name */}
      <h3
        className="text-sm leading-tight mb-1 line-clamp-2"
        style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
      >
        {card.name}
      </h3>

      {/* Archetype */}
      {card.archetype && (
        <p
          className="text-[10px] uppercase tracking-wider mb-2"
          style={{ fontFamily: "Special Elite, cursive", color }}
        >
          {card.archetype}
        </p>
      )}

      {/* Stats */}
      {card.cardType === "stereotype" && (
        <div className="flex gap-3 text-xs font-bold">
          <span>ATK {card.attack ?? 0}</span>
          <span>DEF {card.defense ?? 0}</span>
        </div>
      )}

      {/* Flavor */}
      {card.flavorText && (
        <p
          className="text-[10px] text-[#666] mt-2 leading-snug line-clamp-2 italic"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          {card.flavorText}
        </p>
      )}
    </div>
  );
}
