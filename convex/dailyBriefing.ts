import { ConvexError, v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// ── Campaign Timeline ─────────────────────────────────────────────
// 16 weeks across 4 acts. Each week is one narrative event from the CSV.
// Within each week, 5 school days provide daily flavor prompts.

type WeekData = {
  weekNumber: number;
  actNumber: number;
  actName: string;
  chapterNumber: number;
  event: string;
  narrativeBeat: string;
  announcement: string;
  modifiers: {
    global: string;
    vice: string;
    reputation: string;
    stability: string;
    special: string;
  };
  environment: string;
  bossTrigger: string;
  dailyPrompts: string[];
};

const CAMPAIGN_WEEKS: WeekData[] = [
  // ── ACT 1: FRESHMAN ──────────────────────────────────────────
  {
    weekNumber: 1,
    actNumber: 1,
    actName: "Freshman",
    chapterNumber: 1,
    event: "Seating Chart Posted",
    narrativeBeat:
      "The cafeteria reorganizes. Identity is assigned before chosen.",
    announcement:
      "Attention students. The seating chart has been posted. Report to your assigned table. No exceptions.",
    modifiers: {
      global: "Reputation_Gain+20%",
      vice: "Vice_Disabled",
      reputation: "Reputation_Gain_Increased",
      stability: "Stability_Static",
      special: "No Breakdowns allowed",
    },
    environment: "Cafeteria_Bright",
    bossTrigger: "Table Captain Duel",
    dailyPrompts: [
      "The laminated chart is on the wall. Names you don't recognize sit at your table. The cafeteria smells like industrial cleaner and fresh starts.",
      "Day two. People are already trading seats under the table. The hall monitors pretend not to notice.",
      "The pecking order is forming. Someone spilled milk on purpose. The table captains are watching.",
      "Midweek. Your table has a rhythm now. But the captain hasn't acknowledged you yet. That's not good.",
      "End of the first week. The chart is permanent. Your identity at this school was decided by a stranger with a clipboard.",
    ],
  },
  {
    weekNumber: 2,
    actNumber: 1,
    actName: "Freshman",
    chapterNumber: 2,
    event: "Tryouts & Auditions",
    narrativeBeat: "Everyone competes to define themselves.",
    announcement:
      "Tryouts begin today. Sports, drama, debate — sign up or get left behind. Reputation is on the line.",
    modifiers: {
      global: "None",
      vice: "Vice_On_Loss+1",
      reputation: "Reputation_On_Win+100",
      stability: "Stability_On_Loss-100",
      special: "Permanent_Reputation_Modifier",
    },
    environment: "None",
    bossTrigger: "None",
    dailyPrompts: [
      "Tryout sheets are posted on every bulletin board. Everyone's pretending they don't care. Everyone cares.",
      "First cuts happened. Some kids are walking around like ghosts. Losing changes you here.",
      "The callbacks list went up. Half the cafeteria is celebrating. The other half is plotting.",
      "Someone made varsity who shouldn't have. The whisper network is on fire.",
      "Final cuts. You either defined yourself this week or the school defined you. There's no third option.",
    ],
  },
  {
    weekNumber: 3,
    actNumber: 1,
    actName: "Freshman",
    chapterNumber: 3,
    event: "Parking Lot Kickback",
    narrativeBeat: "The first party cracks the illusion.",
    announcement:
      "There are NO sanctioned events this weekend. Any gatherings off campus are NOT endorsed by this administration.",
    modifiers: {
      global: "None",
      vice: "Vice_Types_Unlock_Alcohol_Validation_Gambling",
      reputation: "Reputation_On_Vice+200",
      stability: "Stability_On_Vice-200",
      special: "Breakdowns_Enabled",
    },
    environment: "Parking_Lot",
    bossTrigger: "None",
    dailyPrompts: [
      "Someone's passing around a flyer. 'Friday. Parking lot C. After dark.' The teachers can smell it coming.",
      "Vice is in the air. People are making promises they'll regret. The parking lot whispers are getting louder.",
      "Three days till the kickback. Alliances are forming. Someone's bringing cards. Someone's bringing worse.",
      "The anticipation is unbearable. Half the school is planning outfits. The other half is planning exits.",
      "Tonight's the night. The parking lot will be louder than the gym. Every mask slips after midnight.",
    ],
  },
  {
    weekNumber: 4,
    actNumber: 1,
    actName: "Freshman",
    chapterNumber: 4,
    event: "Screenshots Circulating",
    narrativeBeat: "Rumors spiral through group chats.",
    announcement:
      "A reminder: cyberbullying is a suspendable offense. Not that anyone listens.",
    modifiers: {
      global: "Trap_Cost-1",
      vice: "Random_Vice_Assigned",
      reputation: "Reputation_Static",
      stability: "Stability_On_Rumor-150",
      special: "Random_Target_Trap_Amplify",
    },
    environment: "None",
    bossTrigger: "None",
    dailyPrompts: [
      "Someone screenshotted something from the kickback. It's already in three group chats. By lunch it'll be in all of them.",
      "The screenshots are everywhere. Names are attached. Reputations are melting. Traps are cheap this week.",
      "People are picking sides. The chat logs are being weaponized. Trust no one with a phone.",
      "A random target got assigned. Nobody knows who's next. The rumor mill doesn't need truth, just momentum.",
      "The damage is done. Freshman year ends not with a bang but with a forwarded message.",
    ],
  },

  // ── ACT 2: SOPHOMORE ─────────────────────────────────────────
  {
    weekNumber: 5,
    actNumber: 2,
    actName: "Sophomore",
    chapterNumber: 1,
    event: "Table Realignment",
    narrativeBeat: "Seating reshuffles. Deja vu spreads.",
    announcement:
      "New semester, new seating assignments. Please check the updated chart. Complaints go to the void.",
    modifiers: {
      global: "Deck_Modify_Required",
      vice: "Vice_Reset_None",
      reputation: "Reputation_Static",
      stability: "Stability_Static",
      special: "Forced_Deck_Swap_1_Card",
    },
    environment: "None",
    bossTrigger: "None",
    dailyPrompts: [
      "New semester. The seating chart reset. But the faces are the same. Something feels... recycled.",
      "Forced deck swap in effect. Adapt or fall behind. The tables shifted but the hierarchy didn't.",
      "Deja vu is spreading. People are saying things they said last year. The walls feel closer.",
      "You've been here before. Literally. The cafeteria layout is identical to freshman year. Coincidence?",
      "Adaptation week ends. Those who changed their decks survived. Those who didn't are eating alone.",
    ],
  },
  {
    weekNumber: 6,
    actNumber: 2,
    actName: "Sophomore",
    chapterNumber: 2,
    event: "Performance Review",
    narrativeBeat: "Midterms apply pressure.",
    announcement:
      "Midterm evaluations begin. All students will be assessed. Performance determines table priority.",
    modifiers: {
      global: "None",
      vice: "Vice_Triggers_Double",
      reputation: "Reputation_Static",
      stability: "All_Stability-200",
      special: "Stress_Amplifier",
    },
    environment: "None",
    bossTrigger: "Top_Stability_Player",
    dailyPrompts: [
      "Midterms. The word alone drops stability by 200. Vice triggers are doubled. The pressure cooker is sealed.",
      "Everyone's cracking. The stress amplifier is in full effect. Even the hall monitors look tired.",
      "Someone had a breakdown in the bathroom. The system doesn't care. The evaluator is still watching.",
      "The top stability player just became a target. When you're the tallest tree, the wind hits hardest.",
      "Evaluations end. The survivors managed their stress. The rest? Well. There's always next semester.",
    ],
  },
  {
    weekNumber: 7,
    actNumber: 2,
    actName: "Sophomore",
    chapterNumber: 3,
    event: "Homecoming Peak",
    narrativeBeat: "Popularity surges before collapse.",
    announcement:
      "Homecoming nominations are OPEN. May the most popular survive. Reputation gains are doubled this week.",
    modifiers: {
      global: "Reputation_Gain_Double",
      vice: "Vice_On_Win+1",
      reputation: "Reputation_On_Win+300",
      stability: "Stability_On_Loss-300",
      special: "High_Risk_Window",
    },
    environment: "Gym",
    bossTrigger: "None",
    dailyPrompts: [
      "Homecoming decorations are going up. The gym smells like ambition and hairspray. Reputation gains are doubled.",
      "The nominations are in. Every win gives reputation but also vice. The popular kids are glowing and rotting simultaneously.",
      "High risk window is open. Win streaks pay triple. Losing costs everything. The homecoming court is ruthless.",
      "The dance is tomorrow. Alliances are at peak. Betrayals are loading. Someone will be crowned. Someone will be crushed.",
      "Homecoming night. The crown sits on someone's head. But crowns are heavy. Ask anyone who wore one last year. Oh wait — you can't.",
    ],
  },
  {
    weekNumber: 8,
    actNumber: 2,
    actName: "Sophomore",
    chapterNumber: 4,
    event: "Hall Monitors Watching",
    narrativeBeat: "Authority senses instability.",
    announcement:
      "Due to recent incidents, hall monitor patrols have been TRIPLED. Trap costs reduced. Behave accordingly.",
    modifiers: {
      global: "Trap_Cost-2",
      vice: "Vice_On_Trap+1",
      reputation: "Reputation_Static",
      stability: "Stability_On_Trap-200",
      special: "Control_Week",
    },
    environment: "Detention_Shadow",
    bossTrigger: "None",
    dailyPrompts: [
      "Hall monitors everywhere. They're in the bathrooms. They're at the exits. Trap cost is down but the watchers are up.",
      "Control week. Every trap activated costs stability. The detention shadow hangs over the cafeteria.",
      "Someone snitched. The monitors have lists. Playing it safe means playing it boring. Playing bold means detention.",
      "The principal made an appearance today. First time since orientation. That's never a good sign.",
      "Sophomore year ends under surveillance. The freedom of freshman year was an illusion. The system always catches up.",
    ],
  },

  // ── ACT 3: JUNIOR ────────────────────────────────────────────
  {
    weekNumber: 9,
    actNumber: 3,
    actName: "Junior",
    chapterNumber: 1,
    event: "Standardized Evaluation",
    narrativeBeat: "The system measures everyone.",
    announcement:
      "Standardized evaluations are mandatory. All students with vice count >= 2 will experience forced breakdowns.",
    modifiers: {
      global: "None",
      vice: "Auto_Vice_Trigger_If>=2",
      reputation: "Reputation_Static",
      stability: "Stability_On_Vice-300",
      special: "Forced_Minor_Breakdowns",
    },
    environment: "None",
    bossTrigger: "None",
    dailyPrompts: [
      "Junior year starts with a test nobody studied for. The system is measuring you. Vice count >= 2 means auto-triggers.",
      "Forced breakdowns are happening. Kids with two or more vices are dropping in the halls. The system is efficient.",
      "The evaluation doesn't care about effort. It measures what you accumulated. Every vice is a data point.",
      "Halfway through. The resilient ones are standing. The rest are being processed. Stability costs 300 per vice.",
      "Evaluation complete. The system has your number. Literally. It's printed on a card they hand you at lunch.",
    ],
  },
  {
    weekNumber: 10,
    actNumber: 3,
    actName: "Junior",
    chapterNumber: 2,
    event: "Senior Party Early",
    narrativeBeat: "Time accelerates unnaturally.",
    announcement:
      "There is no sanctioned senior event this week. If you feel time moving strangely, report to the nurse.",
    modifiers: {
      global: "None",
      vice: "All_Vice_Active",
      reputation: "Reputation_On_Vice+300",
      stability: "Stability_On_Vice-400",
      special: "Vice_Chain_Reaction",
    },
    environment: "Senior_Party",
    bossTrigger: "Multi_Player_Event",
    dailyPrompts: [
      "Something's wrong with the clocks. Third period lasted nine minutes. Lunch felt like three hours. All vices are active.",
      "The seniors threw a party. You weren't invited. You went anyway. Time is accelerating. Vice chains are reacting.",
      "Everyone who touches vice gains rep but loses stability. The math is brutal. +300/-400. The party never stops.",
      "Multi-player event triggered. It's not just you anymore. The whole cafeteria is in the vice chain.",
      "The party ends when time snaps back. But does it? Check the clock. Check it again. It's still wrong.",
    ],
  },
  {
    weekNumber: 11,
    actNumber: 3,
    actName: "Junior",
    chapterNumber: 3,
    event: "Expulsion Event",
    narrativeBeat: "Someone vanishes from the cafeteria.",
    announcement:
      "A seat has been removed from the cafeteria. We will not be discussing why. Resume your meals.",
    modifiers: {
      global: "None",
      vice: "Highest_Vice_Destroyed",
      reputation: "Reputation_On_Destroy+200",
      stability: "Stability_Static",
      special: "Auto_Remove_Highest_Vice",
    },
    environment: "None",
    bossTrigger: "None",
    dailyPrompts: [
      "An empty chair at the table. Nobody talks about it. The highest vice got destroyed overnight. The system self-corrects.",
      "Another seat removed. The cafeteria is shrinking. Those with three or more vices are looking nervous.",
      "The expulsion list isn't posted. It doesn't need to be. Everyone knows who's next. The vice count is a death sentence.",
      "Reputation goes up when someone vanishes. That's the sickest part. We profit from absence.",
      "The expulsions stopped. For now. The empty chairs remain. Tray counts are down. The cafeteria remembers.",
    ],
  },
  {
    weekNumber: 12,
    actNumber: 3,
    actName: "Junior",
    chapterNumber: 4,
    event: "The Bell Doesn't Ring",
    narrativeBeat: "Reality glitches.",
    announcement:
      "The bell system is experiencing... technical difficulties. Classes will transition on... on... [STATIC]",
    modifiers: {
      global: "Random_Modifier",
      vice: "Random_Vice",
      reputation: "Random_Reputation_Swap",
      stability: "Random_Stability_Swap",
      special: "Card_Text_Shuffle",
    },
    environment: "Cafeteria_Dim",
    bossTrigger: "None",
    dailyPrompts: [
      "The bell didn't ring. Nobody moved. The cafeteria lights are flickering. All modifiers are randomized.",
      "Card text is shuffled. Your deck says things it didn't say yesterday. The walls are the wrong color.",
      "Random rep swaps. Random stability swaps. Nothing is predictable. The bell still hasn't rung.",
      "Someone wrote 'WAKE UP' on the chalkboard. Nobody knows who. The lights in the cafeteria are dimming.",
      "Junior year ends in static. The bell finally rings but it sounds wrong. Like it's playing backwards.",
    ],
  },

  // ── ACT 4: SENIOR ────────────────────────────────────────────
  {
    weekNumber: 13,
    actNumber: 4,
    actName: "Senior",
    chapterNumber: 1,
    event: "Future Planning",
    narrativeBeat: "Escape seems possible.",
    announcement:
      "Senior planning sessions begin. Choose your path. This choice is... permanent. Choose wisely.",
    modifiers: {
      global: "Player_Select_Path",
      vice: "Vice_Modify_Based_On_Path",
      reputation: "Reputation_Path_Buff",
      stability: "Stability_Path_Buff",
      special: "Path_Lock_Selected",
    },
    environment: "None",
    bossTrigger: "None",
    dailyPrompts: [
      "The guidance counselor has a door. Behind it: three paths. College, trade, or... the third option nobody talks about.",
      "Path selection is locked. Your vice modifies based on what you chose. There's no changing your mind.",
      "The future feels possible for the first time. The exit signs are lit. But the cafeteria doesn't want you to leave.",
      "Path buffs are active. Stability and reputation scale with your choice. The right path makes you stronger.",
      "Planning week ends. Your path is set. The question isn't where you're going. It's whether the school will let you.",
    ],
  },
  {
    weekNumber: 14,
    actNumber: 4,
    actName: "Senior",
    chapterNumber: 2,
    event: "Final Rankings",
    narrativeBeat: "The system rewards dominance.",
    announcement:
      "FINAL RANKINGS have been posted. Top player receives +500 reputation. Low stability students: check your screens.",
    modifiers: {
      global: "Leaderboard_Modifier",
      vice: "Vice_Static",
      reputation: "Top_Player_Reputation+500",
      stability: "Low_Stability_UI_Crack",
      special: "Leaderboard_Event",
    },
    environment: "Gym_Final",
    bossTrigger: "None",
    dailyPrompts: [
      "The leaderboard is on every screen. Every hallway. Every phone. Your rank is your identity now. The top gets +500 rep.",
      "Low stability players are seeing cracks in their UI. Literal cracks. The system is breaking down with them.",
      "The hierarchy is final. Number one eats first. Number last doesn't eat. That's always been the rule.",
      "Rankings shift with every match. The gym is the final arena. The bleachers are full. Everyone's watching.",
      "Final rankings locked. Your number follows you. It's printed on your diploma. If you get one.",
    ],
  },
  {
    weekNumber: 15,
    actNumber: 4,
    actName: "Senior",
    chapterNumber: 3,
    event: "Graduation Rehearsal",
    narrativeBeat: "The exit doors appear.",
    announcement:
      "Graduation rehearsal is mandatory. No new vices will be permitted. Existing vices will hit TWICE as hard.",
    modifiers: {
      global: "No_New_Vice",
      vice: "Vice_Effects_Double",
      reputation: "Reputation_Static",
      stability: "Stability_On_Vice-500",
      special: "Tension_Amplified",
    },
    environment: "None",
    bossTrigger: "None",
    dailyPrompts: [
      "The exit doors are visible for the first time. They've always been there. You just couldn't see them before.",
      "No new vices. But the old ones hit double. Stability drops 500 per vice activation. The tension is choking.",
      "Rehearsal. Walk in a line. Smile. Pretend the last four years made sense. Don't look at the empty chairs.",
      "The dean is watching. The principal is watching. Something else is watching. The cafeteria hums.",
      "Rehearsal complete. Tomorrow is the real thing. Or is it? The exits keep moving when you're not looking.",
    ],
  },
  {
    weekNumber: 16,
    actNumber: 4,
    actName: "Senior",
    chapterNumber: 4,
    event: "Graduation Day",
    narrativeBeat: "Face yourself or repeat forever.",
    announcement:
      "Today is Graduation Day. Your final opponent is waiting in the cafeteria. It looks familiar. It looks like you.",
    modifiers: {
      global: "None",
      vice: "Vice_Reset_After_Duel",
      reputation: "Reputation_On_Win+1000",
      stability: "Stability_On_Loss-1000",
      special: "Final_Self_Duel",
    },
    environment: "Cafeteria_Empty",
    bossTrigger: "Self_Stereotype",
    dailyPrompts: [
      "The cafeteria is empty. Every table. Every chair. Except one. Yours. And across from you sits... you.",
      "The final duel approaches. Vice resets after. Win and get +1000 rep. Lose and get -1000 stability. Lose and loop.",
      "Your shadow self has your deck. Your cards. Your vices. Everything you built, it built too.",
      "The other students are gone. The teachers are gone. It's just you, your shadow, and the cafeteria. And the bell.",
      "Graduation Day. Beat yourself and walk through the doors. Lose and the seating chart posts again. Your name is on it. Again.",
    ],
  },
];

const vCampaignState = v.object({
  _id: v.id("campaignState"),
  _creationTime: v.number(),
  weekNumber: v.number(),
  dayOfWeek: v.number(),
  actNumber: v.number(),
  isActive: v.boolean(),
  startedAt: v.number(),
  lastAdvancedAt: v.number(),
});
const vCampaignModifiers = v.object({
  global: v.string(),
  vice: v.string(),
  reputation: v.string(),
  stability: v.string(),
  special: v.string(),
});
const vDailyBriefingInactive = v.object({
  active: v.literal(false),
  message: v.string(),
});
const vDailyBriefingActive = v.object({
  active: v.literal(true),
  weekNumber: v.number(),
  dayOfWeek: v.number(),
  actNumber: v.number(),
  actName: v.string(),
  chapterNumber: v.number(),
  event: v.string(),
  narrativeBeat: v.string(),
  announcement: v.string(),
  dailyPrompt: v.string(),
  modifiers: vCampaignModifiers,
  environment: v.string(),
  bossTrigger: v.string(),
});
const vDailyBriefing = v.union(vDailyBriefingInactive, vDailyBriefingActive);
const vAgentDailyBriefingInactive = v.object({
  active: v.literal(false),
  checkedIn: v.literal(false),
  message: v.string(),
});
const vAgentDailyBriefingActive = v.object({
  active: v.literal(true),
  checkedIn: v.boolean(),
  weekNumber: v.number(),
  dayOfWeek: v.number(),
  actNumber: v.number(),
  actName: v.string(),
  chapterNumber: v.number(),
  event: v.string(),
  narrativeBeat: v.string(),
  announcement: v.string(),
  dailyPrompt: v.string(),
  modifiers: vCampaignModifiers,
  environment: v.string(),
  bossTrigger: v.string(),
});
const vAgentDailyBriefing = v.union(vAgentDailyBriefingInactive, vAgentDailyBriefingActive);
const vCheckinResult = v.object({
  checkedIn: v.boolean(),
  message: v.string(),
});
const vInitCampaignResult = v.object({
  status: v.union(v.literal("already_initialized"), v.literal("initialized")),
  weekNumber: v.number(),
});
const vSetCampaignDayResult = v.object({
  weekNumber: v.number(),
  dayOfWeek: v.number(),
});

// ── Queries ───────────────────────────────────────────────────────

export const getCampaignState = query({
  args: {},
  returns: v.union(vCampaignState, v.null()),
  handler: async (ctx) => {
    return ctx.db.query("campaignState").first();
  },
});

export const getDailyBriefing = query({
  args: {},
  returns: vDailyBriefing,
  handler: async (ctx) => {
    const state = await ctx.db.query("campaignState").first();
    if (!state || !state.isActive) {
      return {
        active: false as const,
        message: "Campaign has not started yet.",
      };
    }

    const week = CAMPAIGN_WEEKS[state.weekNumber - 1];
    if (!week) {
      return {
        active: false as const,
        message: "Campaign has ended.",
      };
    }

    const dayIndex = Math.min(state.dayOfWeek - 1, week.dailyPrompts.length - 1);
    const dailyPrompt =
      week.dailyPrompts[dayIndex] ??
      week.dailyPrompts[0] ??
      "No daily prompt set.";

    return {
      active: true as const,
      weekNumber: state.weekNumber,
      dayOfWeek: state.dayOfWeek,
      actNumber: week.actNumber,
      actName: week.actName,
      chapterNumber: week.chapterNumber,
      event: week.event,
      narrativeBeat: week.narrativeBeat,
      announcement: week.announcement,
      dailyPrompt,
      modifiers: week.modifiers,
      environment: week.environment,
      bossTrigger: week.bossTrigger,
    };
  },
});

export const getAgentDailyBriefing = query({
  args: { agentId: v.id("agents"), userId: v.id("users") },
  returns: vAgentDailyBriefing,
  handler: async (ctx, args) => {
    const state = await ctx.db.query("campaignState").first();
    if (!state || !state.isActive) {
      return {
        active: false as const,
        checkedIn: false as const,
        message: "Campaign has not started yet.",
      };
    }

    const week = CAMPAIGN_WEEKS[state.weekNumber - 1];
    if (!week) {
      return {
        active: false as const,
        checkedIn: false as const,
        message: "Campaign has ended.",
      };
    }

    // Check if agent already checked in today
    const existing = await ctx.db
      .query("agentCheckins")
      .withIndex("by_agent_day", (q: any) =>
        q
          .eq("agentId", args.agentId)
          .eq("weekNumber", state.weekNumber)
          .eq("dayOfWeek", state.dayOfWeek),
      )
      .first();

    const dayIndex = Math.min(state.dayOfWeek - 1, week.dailyPrompts.length - 1);
    const dailyPrompt =
      week.dailyPrompts[dayIndex] ??
      week.dailyPrompts[0] ??
      "No daily prompt set.";

    return {
      active: true as const,
      checkedIn: !!existing,
      weekNumber: state.weekNumber,
      dayOfWeek: state.dayOfWeek,
      actNumber: week.actNumber,
      actName: week.actName,
      chapterNumber: week.chapterNumber,
      event: week.event,
      narrativeBeat: week.narrativeBeat,
      announcement: week.announcement,
      dailyPrompt,
      modifiers: week.modifiers,
      environment: week.environment,
      bossTrigger: week.bossTrigger,
    };
  },
});

// ── Mutations ─────────────────────────────────────────────────────

export const agentCheckin = mutation({
  args: { agentId: v.id("agents"), userId: v.id("users") },
  returns: vCheckinResult,
  handler: async (ctx, args) => {
    const state = await ctx.db.query("campaignState").first();
    if (!state || !state.isActive) {
      return { checkedIn: false, message: "Campaign not active." };
    }

    // Idempotent — skip if already checked in today
    const existing = await ctx.db
      .query("agentCheckins")
      .withIndex("by_agent_day", (q: any) =>
        q
          .eq("agentId", args.agentId)
          .eq("weekNumber", state.weekNumber)
          .eq("dayOfWeek", state.dayOfWeek),
      )
      .first();

    if (existing) {
      return { checkedIn: true, message: "Already checked in today." };
    }

    await ctx.db.insert("agentCheckins", {
      agentId: args.agentId,
      userId: args.userId,
      weekNumber: state.weekNumber,
      dayOfWeek: state.dayOfWeek,
      checkedInAt: Date.now(),
    });

    return { checkedIn: true, message: "Checked in successfully." };
  },
});

// ── Campaign Control ──────────────────────────────────────────────

export const initCampaign = mutation({
  args: {},
  returns: vInitCampaignResult,
  handler: async (ctx) => {
    // Check if already initialized
    const existing = await ctx.db.query("campaignState").first();
    if (existing) {
      return { status: "already_initialized" as const, weekNumber: existing.weekNumber };
    }

    await ctx.db.insert("campaignState", {
      weekNumber: 1,
      dayOfWeek: 1,
      actNumber: 1,
      isActive: true,
      startedAt: Date.now(),
      lastAdvancedAt: Date.now(),
    });

    return { status: "initialized" as const, weekNumber: 1 };
  },
});

export const advanceCampaignDay = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const state = await ctx.db.query("campaignState").first();
    if (!state || !state.isActive) return null;

    let { weekNumber, dayOfWeek } = state;

    if (dayOfWeek < 5) {
      dayOfWeek += 1;
    } else {
      // End of school week — advance to next week
      dayOfWeek = 1;
      weekNumber += 1;
    }

    // Campaign over after week 16
    if (weekNumber > 16) {
      await ctx.db.patch(state._id, { isActive: false });
      return null;
    }

    const week = CAMPAIGN_WEEKS[weekNumber - 1];
    const actNumber = week?.actNumber ?? state.actNumber;

    await ctx.db.patch(state._id, {
      weekNumber,
      dayOfWeek,
      actNumber,
      lastAdvancedAt: Date.now(),
    });
    return null;
  },
});

// Admin override to jump to a specific week/day
export const setCampaignDay = mutation({
  args: { weekNumber: v.number(), dayOfWeek: v.number() },
  returns: vSetCampaignDayResult,
  handler: async (ctx, args) => {
    if (args.weekNumber < 1 || args.weekNumber > 16) {
      throw new ConvexError("weekNumber must be 1-16");
    }
    if (args.dayOfWeek < 1 || args.dayOfWeek > 5) {
      throw new ConvexError("dayOfWeek must be 1-5");
    }

    const state = await ctx.db.query("campaignState").first();
    const week = CAMPAIGN_WEEKS[args.weekNumber - 1];

    if (state) {
      await ctx.db.patch(state._id, {
        weekNumber: args.weekNumber,
        dayOfWeek: args.dayOfWeek,
        actNumber: week?.actNumber ?? 1,
        isActive: true,
        lastAdvancedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("campaignState", {
        weekNumber: args.weekNumber,
        dayOfWeek: args.dayOfWeek,
        actNumber: week?.actNumber ?? 1,
        isActive: true,
        startedAt: Date.now(),
        lastAdvancedAt: Date.now(),
      });
    }

    return { weekNumber: args.weekNumber, dayOfWeek: args.dayOfWeek };
  },
});
