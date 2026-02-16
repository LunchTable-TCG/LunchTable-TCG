import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  loadSoundtrackManifest,
  resolvePlaylist,
  toAbsoluteTrackUrl,
  type SoundtrackManifest,
} from "@/lib/audio/soundtrack";
import { MUSIC_BUTTON } from "@/lib/blobUrls";

const AUDIO_SETTINGS_STORAGE_KEY = "ltcg.audio.settings.v1";
const SOUNDTRACK_MANIFEST_SOURCE = "/api/soundtrack";
const VOLUME_PRESET_VALUES = [0, 25, 50, 75, 100];
const MAX_CONSECUTIVE_TRACK_ERRORS = 4;
const MUSIC_BUTTON_FALLBACK = MUSIC_BUTTON;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeStoredVolume(value: number | undefined, fallback: number): number {
  const numericValue = typeof value === "number" ? value : NaN;
  if (!Number.isFinite(numericValue)) return fallback;
  const normalized = numericValue >= 1 ? numericValue / 100 : numericValue;
  return clamp01(normalized);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function isAutoplayBlockedError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

export interface AudioSettings {
  musicVolume: number;
  sfxVolume: number;
  musicMuted: boolean;
  sfxMuted: boolean;
}

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicVolume: 0.65,
  sfxVolume: 0.8,
  musicMuted: false,
  sfxMuted: false,
};

function parseStoredSettings(raw: string | null): AudioSettings {
  if (typeof window === "undefined") return DEFAULT_AUDIO_SETTINGS;
  try {
    if (!raw) return DEFAULT_AUDIO_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      musicVolume: normalizeStoredVolume(parsed.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume),
      sfxVolume: normalizeStoredVolume(parsed.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume),
      musicMuted: Boolean(parsed.musicMuted),
      sfxMuted: Boolean(parsed.sfxMuted),
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

function loadStoredSettings(): AudioSettings {
  if (typeof window === "undefined") return DEFAULT_AUDIO_SETTINGS;
  return parseStoredSettings(window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY));
}

interface AudioContextValue {
  loading: boolean;
  ready: boolean;
  contextKey: string;
  currentTrack: string | null;
  autoplayBlocked: boolean;
  audioUnlocked: boolean;
  settings: AudioSettings;
  requestAudioUnlock: () => void;
  setContextKey: (contextKey: string) => void;
  setMusicVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  setMusicMuted: (muted: boolean) => void;
  setSfxMuted: (muted: boolean) => void;
  toggleMusicMuted: () => void;
  toggleSfxMuted: () => void;
  playSfx: (sfxId: string) => void;
  soundtrack: SoundtrackManifest | null;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AudioSettings>(() => loadStoredSettings());
  const [contextKey, setContextKey] = useState("landing");
  const [soundtrack, setSoundtrack] = useState<SoundtrackManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTrack, setCurrentTrack] = useState<string | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const sfxPoolRef = useRef<HTMLAudioElement[]>([]);
  const musicPreloadRef = useRef<HTMLAudioElement | null>(null);
  const settingsRef = useRef<AudioSettings>(settings);
  const soundtrackRef = useRef<SoundtrackManifest | null>(soundtrack);
  const currentQueueRef = useRef<string[]>([]);
  const trackIndexRef = useRef(0);
  const shuffleModeRef = useRef(false);
  const audioUnlockedRef = useRef(false);
  const consecutiveTrackErrorRef = useRef(0);
  const currentTrackRef = useRef<string | null>(null);
  const lastErroredTrackRef = useRef<string | null>(null);

  settingsRef.current = settings;
  soundtrackRef.current = soundtrack;

  const markTrackError = useCallback((track: string | null) => {
    const nextKey = track ? toAbsoluteTrackUrl(track) : "unknown";
    if (lastErroredTrackRef.current === nextKey) return;
    lastErroredTrackRef.current = nextKey;
    consecutiveTrackErrorRef.current += 1;
  }, []);

  const clearTrackErrorState = useCallback(() => {
    consecutiveTrackErrorRef.current = 0;
    lastErroredTrackRef.current = null;
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.crossOrigin = "anonymous";
    musicAudioRef.current = audio;

    const pool: HTMLAudioElement[] = [];
    for (let i = 0; i < 8; i += 1) {
      const sfx = new Audio();
      sfx.preload = "auto";
      sfx.crossOrigin = "anonymous";
      pool.push(sfx);
    }
    sfxPoolRef.current = pool;
    musicPreloadRef.current = new Audio();
    musicPreloadRef.current.preload = "auto";
    musicPreloadRef.current.crossOrigin = "anonymous";

    return () => {
      audio.pause();
      audio.src = "";
      musicAudioRef.current = null;
      for (const sfx of sfxPoolRef.current) {
        sfx.pause();
        sfx.src = "";
      }
      if (musicPreloadRef.current) {
        musicPreloadRef.current.pause();
        musicPreloadRef.current.src = "";
      }
      sfxPoolRef.current = [];
      musicPreloadRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== AUDIO_SETTINGS_STORAGE_KEY) return;
      const nextSettings = parseStoredSettings(event.newValue);
      setSettings(nextSettings);
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const safePlay = useCallback(async (audio: HTMLAudioElement) => {
    try {
      await audio.play();
      setAutoplayBlocked(false);
      clearTrackErrorState();
    } catch (error) {
      const isBlocked = isAutoplayBlockedError(error);
      setAutoplayBlocked(isBlocked);
      if (!isBlocked) {
        markTrackError(currentTrackRef.current);
      }
    }
  }, [clearTrackErrorState, markTrackError]);

  const requestAudioUnlock = useCallback(() => {
    if (!audioUnlockedRef.current) {
      audioUnlockedRef.current = true;
      setAudioUnlocked(true);
    }

    const current = musicAudioRef.current;
    const currentSettings = settingsRef.current;
    if (!current) return;
    if (!current.src) return;
    if (currentSettings.musicMuted || currentSettings.musicVolume <= 0) return;

    void safePlay(current);
  }, [safePlay]);

  const preloadTrack = useCallback((trackUrl: string) => {
    const preload = musicPreloadRef.current;
    if (!preload) return;

    const absolute = toAbsoluteTrackUrl(trackUrl);
    if (preload.src !== absolute) {
      preload.src = absolute;
      preload.load();
    }
  }, []);

  const playTrackAtIndex = useCallback(
    (index: number) => {
      const audio = musicAudioRef.current;
      const queue = currentQueueRef.current;
      if (!audio || queue.length === 0 || index < 0 || index >= queue.length) return;

      const next = queue[index]!;
      trackIndexRef.current = index;
      currentTrackRef.current = next;
      consecutiveTrackErrorRef.current = 0;
      lastErroredTrackRef.current = null;
      setCurrentTrack(next);

      const nextUrl = toAbsoluteTrackUrl(next);
      if (audio.src !== nextUrl) {
        audio.src = nextUrl;
        audio.load();
      }
      audio.currentTime = 0;

      const currentSettings = settingsRef.current;
      audio.volume = currentSettings.musicMuted ? 0 : clamp01(currentSettings.musicVolume);
      if (currentSettings.musicMuted || currentSettings.musicVolume <= 0) {
        audio.pause();
        return;
      }

      const prefetchIndex = index + 1 >= queue.length ? 0 : index + 1;
      const prefetchTrack = queue[prefetchIndex];
      if (prefetchTrack) preloadTrack(prefetchTrack);

      if (audioUnlockedRef.current) {
        void safePlay(audio);
      }
    },
    [safePlay, preloadTrack],
  );

  const advanceTrack = useCallback(() => {
    const queue = currentQueueRef.current;
    if (queue.length === 0) return;

    let nextIndex = trackIndexRef.current + 1;
    if (nextIndex >= queue.length) {
      if (shuffleModeRef.current) {
        currentQueueRef.current = shuffle([...queue]);
      }
      nextIndex = 0;
    }

    playTrackAtIndex(nextIndex);
  }, [playTrackAtIndex]);

  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    const onEnded = () => {
      consecutiveTrackErrorRef.current = 0;
      advanceTrack();
    };
    const onError = () => {
      setAutoplayBlocked(false);
      markTrackError(currentTrackRef.current);
      if (consecutiveTrackErrorRef.current >= MAX_CONSECUTIVE_TRACK_ERRORS) return;
      if (currentQueueRef.current.length <= 1) return;
      advanceTrack();
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [advanceTrack, markTrackError]);

  useEffect(() => {
    if (!audioUnlocked) {
      window.addEventListener("pointerdown", requestAudioUnlock, { passive: true });
      window.addEventListener("touchstart", requestAudioUnlock, { passive: true });
      window.addEventListener("click", requestAudioUnlock, { passive: true });
      window.addEventListener("keydown", requestAudioUnlock);
    }

    return () => {
      window.removeEventListener("pointerdown", requestAudioUnlock);
      window.removeEventListener("touchstart", requestAudioUnlock);
      window.removeEventListener("click", requestAudioUnlock);
      window.removeEventListener("keydown", requestAudioUnlock);
    };
  }, [requestAudioUnlock, audioUnlocked]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const manifest = await loadSoundtrackManifest(SOUNDTRACK_MANIFEST_SOURCE);
        if (!cancelled) setSoundtrack(manifest);
      } catch {
        if (!cancelled) {
          setSoundtrack({
            playlists: { default: [] },
            sfx: {},
            source: SOUNDTRACK_MANIFEST_SOURCE,
            loadedAt: Date.now(),
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;

    audio.volume = settings.musicMuted ? 0 : clamp01(settings.musicVolume);
    if (settings.musicMuted || settings.musicVolume <= 0) {
      if (!audio.paused) audio.pause();
      return;
    }

    if (audio.src && audio.paused && audioUnlockedRef.current) {
      void safePlay(audio);
    }
  }, [settings.musicMuted, settings.musicVolume, safePlay]);

  useEffect(() => {
    if (!soundtrack) return;

    const resolved = resolvePlaylist(soundtrack, contextKey);
    shuffleModeRef.current = resolved.shuffle;

    const queue = resolved.shuffle ? shuffle([...resolved.tracks]) : [...resolved.tracks];
    currentQueueRef.current = queue;

    if (queue.length === 0) {
      const audio = musicAudioRef.current;
      if (audio) audio.pause();
      setCurrentTrack(null);
      return;
    }

    playTrackAtIndex(0);
  }, [soundtrack, contextKey, playTrackAtIndex]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage failures (private mode, quota exceeded, blocked storage)
    }
  }, [settings]);

  const playSfx = useCallback((sfxId: string) => {
    if (!audioUnlockedRef.current) {
      requestAudioUnlock();
    }

    const manifest = soundtrackRef.current;
    const src = manifest?.sfx[sfxId.toLowerCase()];
    if (!src) return;

    const currentSettings = settingsRef.current;
    if (currentSettings.sfxMuted || currentSettings.sfxVolume <= 0) return;

    const pool = sfxPoolRef.current;
    if (pool.length === 0) return;

    const slot = pool.find((audio) => audio.paused || audio.ended);
    if (!slot) return;

    slot.pause();
    slot.currentTime = 0;
    slot.src = toAbsoluteTrackUrl(src);
    slot.volume = clamp01(currentSettings.sfxVolume);
    void slot.play().catch((error) => {
      if (isAutoplayBlockedError(error)) {
        setAutoplayBlocked(true);
      }
    });
  }, [requestAudioUnlock]);

  const value = useMemo<AudioContextValue>(
    () => ({
      loading,
      ready: Boolean(soundtrack),
      contextKey,
      currentTrack,
      autoplayBlocked,
      audioUnlocked,
      settings,
      requestAudioUnlock,
      setContextKey,
      setMusicVolume: (volume: number) =>
        setSettings((prev) => ({ ...prev, musicVolume: clamp01(volume) })),
      setSfxVolume: (volume: number) =>
        setSettings((prev) => ({ ...prev, sfxVolume: clamp01(volume) })),
      setMusicMuted: (muted: boolean) =>
        setSettings((prev) => ({ ...prev, musicMuted: muted })),
      setSfxMuted: (muted: boolean) =>
        setSettings((prev) => ({ ...prev, sfxMuted: muted })),
      toggleMusicMuted: () =>
        setSettings((prev) => ({ ...prev, musicMuted: !prev.musicMuted })),
      toggleSfxMuted: () =>
        setSettings((prev) => ({ ...prev, sfxMuted: !prev.sfxMuted })),
      playSfx,
      soundtrack,
    }),
    [loading, soundtrack, contextKey, currentTrack, autoplayBlocked, audioUnlocked, settings, requestAudioUnlock, playSfx],
  );

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio(): AudioContextValue {
  const value = useContext(AudioContext);
  if (!value) {
    throw new Error("useAudio must be used within AudioProvider");
  }
  return value;
}

function formatTrackLabel(track: string | null): string {
  if (!track) return "No track";
  const [clean = ""] = track.split("?");
  const parts = clean.split("/");
  const raw = parts.at(-1) ?? track;
  try {
    return decodeURIComponent(raw) || track;
  } catch {
    return raw || track;
  }
}

type PresetType = "music" | "sfx";

function PresetButtons({
  type,
  musicVolumePercent,
  sfxVolumePercent,
  onPresetChange,
}: {
  type: PresetType;
  musicVolumePercent: number;
  sfxVolumePercent: number;
  onPresetChange: (type: PresetType, value: number) => void;
}) {
  const currentPercent =
    type === "music" ? musicVolumePercent : sfxVolumePercent;

  return (
    <div className="mt-1.5 flex gap-1.5">
      {VOLUME_PRESET_VALUES.map((preset) => (
        <button
          type="button"
          key={`${type}-${preset}`}
          onClick={() => onPresetChange(type, preset / 100)}
          className={`text-[10px] px-2 py-1 border transition-all ${
            currentPercent === preset
              ? "border-[#ffcc00] bg-[#121212] text-[#ffcc00]"
              : "border-[#121212] hover:border-[#ffcc00]/70"
          }`}
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          {preset}
        </button>
      ))}
    </div>
  );
}

export function AudioControlsDock() {
  const {
    settings,
    setMusicVolume,
    setSfxVolume,
    toggleMusicMuted,
    toggleSfxMuted,
    autoplayBlocked,
    audioUnlocked,
    requestAudioUnlock,
    currentTrack,
    contextKey,
    loading,
  } = useAudio();
  const [open, setOpen] = useState(false);
  const [buttonImageSrc, setButtonImageSrc] = useState(MUSIC_BUTTON_FALLBACK);

  const musicVolumePercent = Math.round(settings.musicVolume * 100);
  const sfxVolumePercent = Math.round(settings.sfxVolume * 100);

  const panelTransitionClass = open
    ? "max-h-80 opacity-100 translate-y-0 scale-100 pointer-events-auto"
    : "max-h-0 opacity-0 -translate-y-2 scale-95 pointer-events-none overflow-hidden";

  const sharedRangeClasses =
    "h-1.5 w-full cursor-pointer accent-[#121212] bg-[#121212]/15";

  return (
    <div className="fixed top-3 right-3 z-[60]">
      <button
        type="button"
        onClick={() => {
          requestAudioUnlock();
          setOpen((prev) => !prev);
        }}
        aria-label={open ? "Close audio options" : "Open audio options"}
        title={open ? "Close audio options" : "Open audio options"}
        className="group block transition-transform duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffcc00]"
        aria-expanded={open}
        aria-controls="audio-controls-panel"
      >
        <img
          src={buttonImageSrc}
          alt="Open music options"
          className="w-[110px] h-auto select-none drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)] transition-transform duration-150 group-hover:drop-shadow-[0_8px_14px_rgba(0,0,0,0.55)]"
          draggable={false}
          loading="eager"
          width={110}
          height={35}
          onError={() => {
            setButtonImageSrc(MUSIC_BUTTON_FALLBACK);
          }}
        />
      </button>

      <div
        id="audio-controls-panel"
        className={`paper-panel mt-2 w-72 p-3 transform-gpu transition-[max-height,opacity,transform] duration-300 ease-[cubic-bezier(.22,.61,.36,1)] backdrop-blur-sm ${panelTransitionClass}`}
        style={{ willChange: "transform, opacity, max-height" }}
        aria-hidden={!open}
      >
        <div className={open ? "" : "invisible pointer-events-none"}>
          <div className="flex items-center justify-between mb-2">
            <p
              className="text-[10px] uppercase tracking-wider text-[#121212]/60"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              {loading ? "Loading soundtrack..." : `Context: ${contextKey}`}
            </p>
            <p
              className="text-[10px] text-[#121212]/50 truncate max-w-[130px] text-right"
              style={{ fontFamily: "Special Elite, cursive" }}
              title={currentTrack ?? "No track"}
            >
              {formatTrackLabel(currentTrack)}
            </p>
          </div>

          <div className="space-y-3">
            <div className="border border-[#121212]/20 p-2">
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-[11px] font-bold uppercase"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  Music
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] text-[#121212]/70"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    {musicVolumePercent}%
                  </span>
                  <button
                    type="button"
                    onClick={toggleMusicMuted}
                    aria-label={settings.musicMuted ? "Unmute music" : "Mute music"}
                    className="text-[10px] underline uppercase"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    {settings.musicMuted ? "Unmute" : "Mute"}
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={musicVolumePercent}
                onChange={(event) => setMusicVolume(Number(event.target.value) / 100)}
                aria-label="Music volume"
                className={sharedRangeClasses}
              />
              <PresetButtons
                type="music"
                musicVolumePercent={musicVolumePercent}
                sfxVolumePercent={sfxVolumePercent}
                onPresetChange={(type, value) =>
                  type === "music" ? setMusicVolume(value) : setSfxVolume(value)
                }
              />
            </div>

            <div className="border border-[#121212]/20 p-2">
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-[11px] font-bold uppercase"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  SFX
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] text-[#121212]/70"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    {sfxVolumePercent}%
                  </span>
                  <button
                    type="button"
                    onClick={toggleSfxMuted}
                    aria-label={settings.sfxMuted ? "Unmute sound effects" : "Mute sound effects"}
                    className="text-[10px] underline uppercase"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    {settings.sfxMuted ? "Unmute" : "Mute"}
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={sfxVolumePercent}
                onChange={(event) => setSfxVolume(Number(event.target.value) / 100)}
                aria-label="Sound effects volume"
                className={sharedRangeClasses}
              />
              <PresetButtons
                type="sfx"
                musicVolumePercent={musicVolumePercent}
                sfxVolumePercent={sfxVolumePercent}
                onPresetChange={(type, value) =>
                  type === "music" ? setMusicVolume(value) : setSfxVolume(value)
                }
              />
            </div>
          </div>

          {!audioUnlocked && !autoplayBlocked && (
            <div className="mt-2">
              <button
                type="button"
                onClick={requestAudioUnlock}
                className="text-[10px] underline uppercase"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                Enable music
              </button>
            </div>
          )}

          {autoplayBlocked && (
            <p
              className="text-[10px] text-[#b45309] mt-2"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              Browser blocked autoplay. Click anywhere once to enable music.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function AudioContextGate({ context }: { context: string }) {
  const { setContextKey } = useAudio();

  useEffect(() => {
    setContextKey(context);
  }, [context, setContextKey]);

  return null;
}
