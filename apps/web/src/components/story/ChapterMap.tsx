import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useStory } from "./StoryProvider";

import {
  STORY_BG,
  HOMEWORK_LABEL,
  STORY_1_1,
  STORY_1_2,
  STORY_1_3,
  STORY_1_4,
  STORY_2_1,
  STORY_2_2,
  STORY_2_3,
  STORY_2_4,
  STORY_3_1,
  STORY_3_2,
  STORY_3_3,
  STORY_3_4,
  STORY_4_1,
  STORY_4_2,
  STORY_4_3,
  STORY_4_4,
} from "@/lib/blobUrls";

/** Map chapter index (1-based) → image */
const CHAPTER_IMAGES: Record<number, string> = {
  1: STORY_1_1,
  2: STORY_1_2,
  3: STORY_1_3,
  4: STORY_1_4,
  5: STORY_2_1,
  6: STORY_2_2,
  7: STORY_2_3,
  8: STORY_2_4,
  9: STORY_3_1,
  10: STORY_3_2,
  11: STORY_3_3,
  12: STORY_3_4,
  13: STORY_4_1,
  14: STORY_4_2,
  15: STORY_4_3,
  16: STORY_4_4,
};

const PANEL_LAYOUTS = [
  "col-span-2 row-span-2",
  "col-span-1 row-span-1",
  "col-span-1 row-span-2",
  "col-span-2 row-span-1",
  "col-span-1 row-span-1",
  "col-span-1 row-span-1",
];

const container = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
};

const panelVariant = {
  hidden: { opacity: 0, scale: 0.9, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, damping: 15, stiffness: 200 },
  },
};

export function ChapterMap() {
  const navigate = useNavigate();
  const { chapters, isLoading, isChapterComplete, isChapterUnlocked, totalStars } = useStory();

  const sortedChapters = useMemo(() => {
    return [...(chapters ?? [])].sort((a, b) => {
      const actDiff = (a.actNumber ?? 0) - (b.actNumber ?? 0);
      if (actDiff !== 0) return actDiff;
      const chapterDiff = (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0);
      if (chapterDiff !== 0) return chapterDiff;
      return 0;
    });
  }, [chapters]);

  return (
    <div
      className="min-h-screen pb-24 relative bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url('${STORY_BG}')` }}
    >
      <div className="absolute inset-0 bg-[#fdfdfb]/85" />
      <header className="relative z-10 border-b-2 border-[#121212] px-6 py-5">
        <div className="text-center">
          <img
            src={HOMEWORK_LABEL}
            alt="HOMEWORK"
            className="h-28 md:h-36 mx-auto"
            draggable={false}
          />
          <p
            className="text-sm text-[#666] mt-1"
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            Fight your way through the halls
          </p>
          {totalStars > 0 && (
            <p
              className="text-lg mt-1"
              style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900, color: "#ffcc00" }}
            >
              &#9733; {totalStars}
            </p>
          )}
        </div>
      </header>

      <div className="relative z-10 p-6 max-w-4xl mx-auto">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !chapters || chapters.length === 0 ? (
          <div className="paper-panel p-12 text-center">
            <p className="text-[#666] font-bold uppercase text-sm">
              No chapters available yet.
            </p>
            <p
              className="text-xs text-[#999] mt-2"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              Check back soon — the school year has just begun.
            </p>
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-3 gap-3 md:gap-4 auto-rows-[140px] md:auto-rows-[180px]"
            variants={container}
            initial="hidden"
            animate="visible"
          >
            {sortedChapters.map((chapter, i) => {
              const completed = isChapterComplete(chapter._id);
              const locked = !completed && !isChapterUnlocked(chapter._id);
              const layout = PANEL_LAYOUTS[i % PANEL_LAYOUTS.length];
              const rotation = ((i * 7 + 3) % 5) - 2;

              return (
                <motion.button
                  key={chapter._id}
                  type="button"
                  onClick={() => !locked && navigate(`/story/${chapter._id}`)}
                  className={`comic-panel ${layout} relative overflow-hidden text-left group ${locked ? "cursor-not-allowed" : "cursor-pointer"
                    }`}
                  style={{ rotate: `${rotation}deg` }}
                  variants={panelVariant}
                  whileHover={locked ? {} : { scale: 1.03, rotate: 0, zIndex: 10 }}
                  whileTap={locked ? {} : { scale: 0.97 }}
                >
                  {(chapter.imageUrl || CHAPTER_IMAGES[i + 1]) && (
                    <img
                      src={chapter.imageUrl || CHAPTER_IMAGES[i + 1]}
                      alt={`${chapter.title || 'Chapter'} ${chapter.chapterNumber} background`}
                      className={`absolute inset-0 w-full h-full object-cover transition-opacity ${locked
                        ? "opacity-10 grayscale"
                        : "opacity-20 group-hover:opacity-30"
                        }`}
                      draggable={false}
                    />
                  )}

                  {/* Locked overlay */}
                  {locked && (
                    <div className="absolute inset-0 bg-[#121212]/60 z-10 flex items-center justify-center">
                      <span
                        className="comic-stamp text-white/70 border-white/40 text-xs scale-110"
                        style={{ transform: "rotate(-6deg) scale(1.1)" }}
                      >
                        LOCKED
                      </span>
                    </div>
                  )}

                  <div className={`relative z-20 flex flex-col justify-between h-full p-4 ${locked ? "opacity-40" : ""
                    }`}>
                    <div>
                      <span
                        className="text-[10px] text-[#999] uppercase tracking-wider block"
                        style={{ fontFamily: "Special Elite, cursive" }}
                      >
                        Chapter {chapter.chapterNumber ?? i + 1}
                      </span>
                      <h2
                        className={`text-lg md:text-2xl leading-tight mt-0.5 ${locked ? "text-[#666]" : ""}`}
                        style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
                      >
                        {chapter.title}
                      </h2>
                      {chapter.description && (
                        <p
                          className="text-xs text-[#666] mt-1 leading-snug line-clamp-2"
                          style={{ fontFamily: "Special Elite, cursive" }}
                        >
                          {chapter.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      {completed ? (
                        <span className="comic-stamp text-[#38a169] border-[#38a169]">
                          CLEARED
                        </span>
                      ) : locked ? (
                        <span className="text-[10px] text-[#999] font-bold uppercase tracking-wider">
                          &#x1F512;
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#ffcc00] font-bold uppercase tracking-wider animate-pulse">
                          NEW
                        </span>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
