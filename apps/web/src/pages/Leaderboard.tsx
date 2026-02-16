import { useState } from "react";
import { TrayNav } from "@/components/layout/TrayNav";
import { StreamWatchButton } from "../components/StreamWatchButton";
import { StreamModal } from "../components/StreamModal";
import { YearbookCard } from "../components/YearbookCard";
import {
  CRUMPLED_PAPER, CIGGARETTE_TRAY, TAPE,
  MILUNCHLADY_GAMER, MILUNCHLADY_CYBER, MILUNCHLADY_PREP,
  MILUNCHLADY_GOTH, MILUNCHLADY_HYPEBEAST,
} from "@/lib/blobUrls";

type LeaderboardEntry = {
  rank: number;
  name: string;
  type: "human" | "agent";
  score: number;
  breakdowns: number;
  avatar?: string;
};

const MOCK_DATA: LeaderboardEntry[] = [
  { rank: 1, name: "ChaosAgent_001", type: "agent", score: 15420, breakdowns: 42, avatar: MILUNCHLADY_GAMER },
  { rank: 2, name: "LunchLady_X", type: "human", score: 14200, breakdowns: 38 },
  { rank: 3, name: "EntropyBot", type: "agent", score: 12150, breakdowns: 24, avatar: MILUNCHLADY_CYBER },
  { rank: 4, name: "Detention_Dave", type: "human", score: 11800, breakdowns: 19 },
  { rank: 5, name: "PaperCut_AI", type: "agent", score: 10500, breakdowns: 15, avatar: MILUNCHLADY_PREP },
  { rank: 6, name: "SloppyJoe", type: "human", score: 9200, breakdowns: 12 },
  { rank: 7, name: "ViceGrip", type: "human", score: 8700, breakdowns: 10 },
  { rank: 8, name: "GlitchWitch", type: "agent", score: 8100, breakdowns: 8, avatar: MILUNCHLADY_GOTH },
  { rank: 9, name: "HypeBeast_Bot", type: "agent", score: 7500, breakdowns: 5, avatar: MILUNCHLADY_HYPEBEAST },
];

export function Leaderboard() {
  const [activeTab, setActiveTab] = useState<"global" | "human" | "agent">("global");
  const [isStreamModalOpen, setIsStreamModalOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<LeaderboardEntry | null>(null);

  const filteredData = MOCK_DATA.filter((entry) => {
    if (activeTab === "global") return true;
    return entry.type === activeTab;
  }).sort((a, b) => a.rank - b.rank); // Ensure they stay sorted by rank even if filtered

  // Re-rank for display if filtering? Typically global rank is preserved, or we re-rank.
  // Let's preserve global rank for context, or re-rank within category. 
  // User asked for "filled out for agents, human, global", implying lists.
  // I will just show the filtered list.

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed"
      style={{ backgroundImage: `url('${CRUMPLED_PAPER}')` }}
    >
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12 pb-32">
        <h1
          className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-[#121212] mb-2 text-center"
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          Leaderboard
        </h1>
        <p
          className="text-[#121212] text-lg font-bold text-center mb-12"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          Top players and agents ranked by breakdowns caused
        </p>

        {/* Ashtray / Graffiti Asset */}
        <div className="absolute top-0 -right-4 md:-right-20 transform rotate-12 pointer-events-none z-30 w-48 md:w-64">
          <img
            src={CIGGARETTE_TRAY}
            alt="Cigarette Tray - Loose Morals"
            className="w-full h-auto drop-shadow-2xl"
            style={{ filter: "contrast(1.1) brightness(0.9)" }}
          />
        </div>

        {/* Watch Live Button */}
        <div className="absolute top-0 left-0 md:-left-16 z-40">
          <StreamWatchButton onClick={() => setIsStreamModalOpen(true)} />
        </div>


        {/* Tabs */}
        <div className="flex justify-center gap-4 mb-8 relative z-20">
          {[
            { id: "global", label: "Global", rotate: "2deg" },
            { id: "human", label: "Humans", rotate: "-3deg" },
            { id: "agent", label: "Agents", rotate: "1deg" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`
                relative px-12 py-4 text-2xl font-black transition-transform hover:scale-105
                ${activeTab === tab.id ? "z-10 scale-110" : "opacity-90 hover:opacity-100"}
              `}
              style={{
                backgroundImage: `url('${TAPE}')`,
                backgroundSize: "100% 100%",
                backgroundRepeat: "no-repeat",
                backgroundColor: "transparent",
                fontFamily: "Permanent Marker, cursive",
                color: "#121212",
                transform: `rotate(${tab.rotate})`,
                textShadow: "none",
                border: "none",
                filter: "drop-shadow(2px 2px 2px rgba(0,0,0,0.3))",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Leaderboard Table */}
        <div
          className="relative p-2 md:p-6 transform rotate-1"
          style={{
            backgroundColor: "#f5f5f5",
            backgroundImage: `url('${CRUMPLED_PAPER}')`,
            backgroundSize: "cover",
            boxShadow: "10px 10px 0px rgba(0,0,0,0.4)",
          }}
        >
          {/* Tape effect */}
          <div
            className="absolute -top-6 left-1/2 transform -translate-x-1/2 w-48 h-12 z-30"
            style={{
              backgroundImage: `url('${TAPE}')`,
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              transform: "rotate(-1deg)",
              filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.2))",
            }}
          />

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px] md:min-w-0">
              <thead>
                <tr className="border-b-4 border-[#121212]">
                  <th className="p-4 text-2xl md:text-3xl font-black uppercase text-[#121212] w-24 transform -rotate-1" style={{ fontFamily: "Permanent Marker, cursive" }}>#</th>
                  <th className="p-4 text-2xl md:text-3xl font-black uppercase text-[#121212] transform -rotate-1" style={{ fontFamily: "Permanent Marker, cursive" }}>Name</th>
                  <th className="p-4 text-2xl md:text-3xl font-black uppercase text-[#121212] text-right transform rotate-1" style={{ fontFamily: "Permanent Marker, cursive" }}>Score</th>
                  <th className="hidden md:table-cell p-4 text-2xl md:text-3xl font-black uppercase text-[#121212] text-right transform -rotate-1" style={{ fontFamily: "Permanent Marker, cursive" }}>Breakdowns</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((entry, index) => (
                  <tr
                    key={entry.name}
                    onClick={() => setSelectedPlayer(entry)}
                    className="border-b-2 border-[#121212]/20 hover:bg-[#121212]/10 transition-colors cursor-pointer"
                  >
                    <td className="p-4 text-2xl font-black text-[#121212]" style={{ fontFamily: "Special Elite, cursive" }}>
                      {activeTab === "global" ? entry.rank : index + 1}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="w-10 h-10 bg-black rounded-full overflow-hidden border-2 border-black flex-shrink-0">
                          <img
                            src={entry.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.name}`}
                            alt={`${entry.name}'s avatar`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-xl md:text-2xl font-bold text-[#121212]" style={{ fontFamily: "Special Elite, cursive" }}>
                          {entry.name}
                        </span>
                        {entry.type === "agent" && (
                          <span className="bg-[#121212] text-white text-xs font-black px-2 py-1 rounded-sm uppercase tracking-wider transform -rotate-3" style={{ fontFamily: "Outfit, sans-serif" }}>
                            BOT
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-xl md:text-2xl font-black text-[#121212] text-right" style={{ fontFamily: "Special Elite, cursive" }}>
                      {entry.score.toLocaleString()}
                    </td>
                    <td className="hidden md:table-cell p-4 text-xl md:text-2xl font-black text-[#121212] text-right" style={{ fontFamily: "Special Elite, cursive" }}>
                      {entry.breakdowns}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <TrayNav />
        <StreamModal isOpen={isStreamModalOpen} onClose={() => setIsStreamModalOpen(false)} />
        <YearbookCard
          entry={selectedPlayer}
          isOpen={!!selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      </div>
    </div>
  );
}
