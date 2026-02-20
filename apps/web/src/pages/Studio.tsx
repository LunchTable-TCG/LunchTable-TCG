import { motion } from "framer-motion";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { SpeechBubble } from "@/components/ui/SpeechBubble";
import { StickerBadge } from "@/components/ui/StickerBadge";
import { DecorativeScatter } from "@/components/ui/DecorativeScatter";
import { SpeedLines } from "@/components/ui/SpeedLines";
import { ComicImpactText } from "@/components/ui/ComicImpactText";
import { TrayNav } from "@/components/layout/TrayNav";
import {
  LANDING_BG,
  TAPE,
  DECO_PILLS,
  CIGGARETTE_TRAY,
  MILUNCHLADY_CYBER,
  STORY_1_1,
  STORY_2_1,
  STORY_3_1,
  STORY_4_1,
  MENU_TEXTURE,
} from "@/lib/blobUrls";

const studioFeatures = [
  {
    title: "Card Designer",
    subtitle: "Forge your own weapons of mass disruption",
    image: STORY_1_1,
  },
  {
    title: "Deck Lab",
    subtitle: "Splice archetypes into broken combos",
    image: STORY_2_1,
  },
  {
    title: "Campaign Builder",
    subtitle: "Write the lore. Script the chaos.",
    image: STORY_3_1,
  },
  {
    title: "Community Hub",
    subtitle: "Trade, share, and trash-talk",
    image: STORY_4_1,
  },
];

const panelVariants = {
  hidden: { opacity: 0, y: 32, scale: 0.95, rotate: -1 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    rotate: 0,
    transition: { type: "spring" as const, stiffness: 280, damping: 22 },
  },
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.5 } },
};

export function Studio() {
  return (
    <div
      className="min-h-screen relative bg-cover bg-center bg-no-repeat overflow-hidden"
      style={{ backgroundImage: `url('${LANDING_BG}')` }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/80" />

      {/* Blueprint dot-grid pattern overlay */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(51, 204, 255, 0.12) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      <AmbientBackground variant="dark" />

      {/* Scattered decorations */}
      <DecorativeScatter
        elements={[
          { src: TAPE, size: 80, opacity: 0.10 },
          { src: DECO_PILLS, size: 56, opacity: 0.08 },
          { src: CIGGARETTE_TRAY, size: 52, opacity: 0.07 },
          { src: TAPE, size: 64, opacity: 0.09 },
          { src: DECO_PILLS, size: 48, opacity: 0.06 },
          { src: CIGGARETTE_TRAY, size: 44, opacity: 0.08 },
        ]}
        seed={99}
        className="z-[2]"
      />

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col px-6 pb-28 pt-12">
        {/* Title section with speed lines */}
        <div className="relative text-center mb-12">
          <SpeedLines intensity={1} focal={{ x: "50%", y: "50%" }} />

          <motion.div
            className="relative z-10"
            initial={{ opacity: 0, scale: 2.5, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <ComicImpactText
              text="STUDIO"
              size="lg"
              color="#fdfdfb"
              rotation={0}
              animate
            />
          </motion.div>

          <motion.p
            className="relative z-10 text-[#ffcc00] text-sm md:text-base mt-4 uppercase tracking-widest"
            style={{ fontFamily: "Outfit, sans-serif" }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            Workshop Blueprint
          </motion.p>
        </div>

        {/* 2x2 teaser panels grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full mx-auto mb-16"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {studioFeatures.map((feature) => (
            <motion.div
              key={feature.title}
              className="relative group"
              variants={panelVariants}
            >
              <div
                className="relative overflow-hidden border-2 border-[#121212]"
                style={{
                  backgroundImage: `url('${MENU_TEXTURE}')`,
                  backgroundSize: "256px",
                  boxShadow: "4px 4px 0px 0px rgba(18,18,18,1)",
                }}
              >
                {/* Feature image — grayscale */}
                <div className="relative h-48 md:h-56 overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover bg-center grayscale group-hover:grayscale-[0.5] transition-all duration-500"
                    style={{ backgroundImage: `url('${feature.image}')` }}
                  />
                  {/* Dark overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

                  {/* Dot-grid texture on image */}
                  <div
                    className="absolute inset-0 opacity-[0.04] pointer-events-none"
                    style={{
                      backgroundImage:
                        "radial-gradient(#fdfdfb 1px, transparent 1px)",
                      backgroundSize: "8px 8px",
                    }}
                  />

                  {/* COMING SOON sticker */}
                  <div className="absolute top-4 right-4 z-10">
                    <StickerBadge label="COMING SOON" variant="stamp" />
                  </div>
                </div>

                {/* Panel text content */}
                <div className="p-5">
                  <h3
                    className="text-xl md:text-2xl font-black uppercase tracking-tighter text-[#fdfdfb] mb-1 drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className="text-sm text-white/50"
                    style={{ fontFamily: "Special Elite, cursive" }}
                  >
                    {feature.subtitle}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Character presenter */}
        <motion.div
          className="flex flex-col md:flex-row items-center justify-center gap-6 max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.6 }}
        >
          <div className="order-2 md:order-1">
            <SpeechBubble variant="speech" tail="right">
              <span className="text-[#121212]">
                I'm still building this. Come back soon!
              </span>
            </SpeechBubble>
          </div>
          <motion.img
            src={MILUNCHLADY_CYBER}
            alt="MiLunchLady Cyber"
            className="order-1 md:order-2 h-48 w-auto drop-shadow-[4px_4px_0px_rgba(0,0,0,0.6)] select-none"
            draggable={false}
            animate={{ y: [0, -6, 0] }}
            transition={{
              duration: 3.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </motion.div>
      </div>

      <TrayNav />
    </div>
  );
}
