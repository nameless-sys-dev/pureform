import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent, ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  CircleHelp,
  FileAudio,
  Headphones,
  Info,
  LoaderCircle,
  LockKeyhole,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  SkipBack,
  SlidersHorizontal,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { AnalogMeter, Knob, Waveform } from "./components/Hardware";
import {
  analyzeAudio,
  createDemo,
  decodeAudio,
  DEFAULT_SETTINGS,
  encodeWav24,
  masterAudio,
  PROFILES,
} from "./audio/engine";
import type { AudioAnalysis, MasteringSettings } from "./audio/engine";
import { useAudioPlayer } from "./audio/useAudioPlayer";

type Phase = "empty" | "decoding" | "mastering" | "ready" | "exporting";
type Modal = "help" | "chain" | "philosophy" | null;
type Notice = { message: string; error?: boolean };

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? "brand-compact" : ""}`}>
      <span className="brand-symbol" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>
        pureform<span className="brand-period">.</span>
      </span>
    </span>
  );
}

function Screw({ className = "" }: { className?: string }) {
  return (
    <span className={`screw ${className}`} aria-hidden="true">
      <i />
    </span>
  );
}

function ModalShell({
  children,
  onClose,
  title,
  eyebrow,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  eyebrow: string;
}) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    content.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && content.current) {
        const elements = content.current.querySelectorAll<HTMLElement>(
          'button, a[href], input, [tabindex="0"]',
        );
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === content.current)
        ) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        ref={content}
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12 }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={19} />
        </button>
        <span className="eyebrow">{eyebrow}</span>
        <h2 id="modal-title">{title}</h2>
        {children}
      </motion.div>
    </motion.div>
  );
}

const timeString = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(Math.max(0, seconds) % 60)
    .toString()
    .padStart(2, "0")}`;

export default function App() {
  const [source, setSource] = useState<AudioBuffer | null>(null);
  const [master, setMaster] = useState<AudioBuffer | null>(null);
  const [inputAnalysis, setInputAnalysis] = useState<AudioAnalysis | null>(
    null,
  );
  const [outputAnalysis, setOutputAnalysis] = useState<AudioAnalysis | null>(
    null,
  );
  const [settings, setSettings] = useState<MasteringSettings>({
    ...DEFAULT_SETTINGS,
  });
  const [profile, setProfile] = useState("Balanced");
  const [profileOpen, setProfileOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("empty");
  const [status, setStatus] = useState("Ready when you are");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [comparison, setComparison] = useState<"original" | "master">("master");
  const [levelMatch, setLevelMatch] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const profileMenu = useRef<HTMLDivElement>(null);
  const importJob = useRef(0);
  const activeBuffer = comparison === "master" ? master || source : source;
  const matchGain =
    levelMatch && inputAnalysis && outputAnalysis
      ? Math.pow(
          10,
          Math.min(
            0,
            comparison === "master"
              ? inputAnalysis.lufs - outputAnalysis.lufs
              : outputAnalysis.lufs - inputAnalysis.lufs,
          ) / 20,
        )
      : 1;
  const player = useAudioPlayer(activeBuffer, muted ? 0 : volume * matchGain);
  const importing = phase === "decoding";
  const processing = importing || phase === "mastering";
  const unavailable = importing || phase === "exporting";
  const canPlay =
    !!activeBuffer && !importing && (comparison === "original" || !!master);
  const closeModal = useCallback(() => setModal(null), []);

  useEffect(() => {
    if (!source || !inputAnalysis) return;
    let canceled = false;
    const controller = new AbortController();
    setPhase("mastering");
    setStatus("Getting to know your mix");
    setProgress(5);
    const timer = setTimeout(async () => {
      try {
        const result = await masterAudio(
          source,
          settings,
          inputAnalysis,
          (message, amount) => {
            if (!canceled) {
              setStatus(message);
              setProgress(amount);
            }
          },
          controller.signal,
        );
        if (!canceled) {
          setMaster(result.buffer);
          setOutputAnalysis(result.analysis);
          setProgress(100);
          setStatus("Your master is ready");
          setPhase("ready");
        }
      } catch (error) {
        if (!canceled) {
          setPhase("empty");
          setNotice({
            message:
              error instanceof Error
                ? error.message
                : "This session ran out of memory. Please try a shorter file.",
            error: true,
          });
        }
      }
    }, 380);
    return () => {
      canceled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [source, inputAnalysis, settings]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => setNotice(null),
      notice.error ? 10000 : 6000,
    );
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const listener = (event: globalThis.MouseEvent) => {
      if (!profileMenu.current?.contains(event.target as Node))
        setProfileOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("click", listener);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", listener);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        modal ||
        ["INPUT", "BUTTON", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.getAttribute("role") === "slider"
      )
        return;
      if (event.code === "Space" && canPlay) {
        event.preventDefault();
        player.toggle();
      }
      if (event.key.toLowerCase() === "a" && source) setComparison("original");
      if (event.key.toLowerCase() === "b" && master) setComparison("master");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player.toggle, canPlay, modal, source, master]);

  const importAudio = async (file?: File) => {
    if (unavailable) return;
    const job = ++importJob.current;
    player.pause();
    player.seek(0);
    setMaster(null);
    setSource(null);
    setInputAnalysis(null);
    setOutputAnalysis(null);
    setPhase("decoding");
    setProgress(4);
    setStatus(
      file ? "Reading your mix, right here" : "Warming up the demo session",
    );
    setNotice(null);
    setComparison("master");
    try {
      const context = player.getContext();
      const buffer = file
        ? await decodeAudio(file, context, setStatus)
        : await createDemo(context);
      if (job !== importJob.current) return;
      setStatus("Listening to the numbers");
      setProgress(10);
      const analysis = await analyzeAudio(buffer);
      if (analysis.lufs < -65)
        throw new Error(
          "This file is almost silent. Please choose a mix with an audible signal.",
        );
      if (job !== importJob.current) return;
      setFileName(file?.name || "Late night - Pureform demo.wav");
      setInputAnalysis(analysis);
      setSource(buffer);
      if (analysis.clipped)
        setNotice({
          message:
            "Some clipping was detected in your mix. We will control peaks, but existing distortion cannot be undone. A cleaner source will give you the best result.",
        });
    } catch (error) {
      setPhase("empty");
      setStatus("Ready when you are");
      setNotice({
        message:
          error instanceof Error
            ? error.message
            : "We could not open this mix. Try a different audio file.",
        error: true,
      });
    }
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void importAudio(file);
  };

  const changeSetting = (key: keyof MasteringSettings, value: number) => {
    setSettings((previous) => ({ ...previous, [key]: value }));
    setProfile("Custom");
  };

  const reset = () => {
    setSettings({ ...DEFAULT_SETTINGS });
    setProfile("Balanced");
  };

  const exportMaster = async () => {
    if (!master || phase !== "ready") return;
    setPhase("exporting");
    setProgress(0);
    setStatus("Writing your 24-bit master");
    try {
      const blob = await encodeWav24(master, (value) =>
        setProgress(value * 100),
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName.replace(/\.[^.]+$/, "")} - Pureform Master.wav`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice({
        message:
          "Master exported. 24-bit / 48 kHz stereo WAV, with TPDF dither. All yours.",
      });
    } catch {
      setNotice({
        message:
          "Not enough memory to export this session. Try closing other tabs and exporting again.",
        error: true,
      });
    } finally {
      setPhase("ready");
      setStatus("Your master is ready");
    }
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand-link" href="#studio" aria-label="Pureform home">
          <Brand />
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className="nav-active" href="#studio">
            Mastering studio
            <span />
          </a>
          <button onClick={() => setModal("chain")}>The signal chain</button>
          <button onClick={() => setModal("philosophy")}>Why no AI?</button>
        </nav>
        <button className="how-button" onClick={() => setModal("help")}>
          How it works <ArrowUpRight size={15} />
        </button>
      </header>

      <main id="studio" className="main-content">
        <motion.section
          className="intro"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65 }}
        >
          <div className="intro-copy">
            <span className="eyebrow">
              A LITTLE ANALOGUE SOUL. A LOT OF SOUND SCIENCE.
            </span>
            <h1>
              Your sound. <span>Pureform.</span>
            </h1>
            <p>
              Studio-grade mastering. No AI. No uploads. Just really good math.
            </p>
          </div>
          <div className="local-assurance">
            <span className="assurance-icon">
              <ShieldCheck size={23} strokeWidth={1.4} />
            </span>
            <div>
              <strong>100% on your device</strong>
              <span>Your music stays your music.</span>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="mastering-desk"
          aria-label="Pureform mastering workstation"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.12 }}
        >
          <div className="desk-topbar">
            <div className="model-name">
              <Screw />
              <span>
                <b>PF-01</b>
                <span className="model-divider">/</span>STEREO MASTERING
                PROCESSOR
              </span>
            </div>
            <div className="engine-status">
              <span
                className={`status-led ${processing ? "is-pulsing" : ""}`}
              />
              <span>{processing ? "ENGINE WORKING" : "ENGINE ONLINE"}</span>
              <span className="version">v1.0</span>
              <Screw />
            </div>
          </div>

          <div className="desk-upper">
            <div className="input-section">
              <div className="section-label">
                <span>
                  <span className="tiny-number">01</span> YOUR MIX
                </span>
                <span className="section-label-right">
                  {source ? "48 KHZ / STEREO" : "IT ALL STARTS HERE"}
                </span>
              </div>
              <div
                className={`audio-display ${dragOver ? "is-dragover" : ""} ${source ? "has-audio" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!unavailable) setDragOver(true);
                }}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  )
                    setDragOver(false);
                }}
                onDrop={onDrop}
              >
                {source ? (
                  <>
                    <div className="waveform-file">
                      <div>
                        <FileAudio size={14} />
                        <span title={fileName}>{fileName}</span>
                        {fileName.includes("Pureform demo") && (
                          <small>DEMO</small>
                        )}
                      </div>
                      <button
                        onClick={() => fileInput.current?.click()}
                        disabled={unavailable}
                        title="Replace audio file"
                      >
                        <Upload size={13} />
                        <span>Replace</span>
                      </button>
                    </div>
                    <Waveform
                      buffer={
                        comparison === "master" && master ? master : source
                      }
                      time={player.time}
                      mastered={comparison === "master" && !!master}
                      onSeek={player.seek}
                    />
                    <div className="waveform-timeline">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span key={i}>
                          {timeString((source.duration * i) / 4)}
                        </span>
                      ))}
                    </div>
                    {processing && (
                      <div className="waveform-processing">
                        <LoaderCircle size={13} className="spin" />
                        {status}
                        <div
                          className="mini-progress"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                  </>
                ) : importing ? (
                  <div className="importing-state">
                    <div className="importing-wave">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <strong>{status}</strong>
                    <span>
                      Local processing. Your audio never leaves this tab.
                    </span>
                  </div>
                ) : (
                  <div className="upload-content">
                    <div className="upload-icon">
                      <Upload size={22} strokeWidth={1.4} />
                    </div>
                    <h2>Great mixes deserve a great finish.</h2>
                    <p>
                      Drop your track here, or{" "}
                      <button
                        className="text-link"
                        onClick={() => fileInput.current?.click()}
                      >
                        browse files <ArrowUpRight size={12} />
                      </button>
                    </p>
                    <div className="supported-formats">
                      <span>WAV</span>
                      <i />
                      <span>FLAC</span>
                      <i />
                      <span>M4A</span>
                      <i />
                      <span>MP3</span>
                      <span className="format-limit">UP TO 200 MB</span>
                    </div>
                  </div>
                )}
              </div>
              {!source && !importing && (
                <button
                  className="demo-link"
                  onClick={() => void importAudio()}
                >
                  Just looking around?{" "}
                  <span>
                    Try a demo track <ArrowRight size={12} />
                  </span>
                </button>
              )}
              {source && (
                <div className="source-info">
                  <span>
                    <span className="status-led small" />
                    {phase === "ready"
                      ? "ANALYSIS COMPLETE"
                      : "LOCAL AUDIO SESSION"}
                  </span>
                  <span>
                    {timeString(source.duration)}
                    <span className="info-dot">/</span>
                    {inputAnalysis?.lufs.toFixed(1)} LUFS IN
                  </span>
                </div>
              )}
              {importing && (
                <div className="source-info">
                  <span>NO UPLOAD. NO WAITING IN LINE.</span>
                </div>
              )}
            </div>

            <div className="output-section">
              <div className="section-label">
                <span>
                  <span className="tiny-number">02</span> THE SWEET SPOT
                </span>
                <span className="stereo-label">
                  L <span>+ </span>R
                </span>
              </div>
              <div className="meters">
                <AnalogMeter channel="LEFT" level={player.levels[0]} />
                <AnalogMeter channel="RIGHT" level={player.levels[1]} />
              </div>
              <div className="digital-readouts">
                <div>
                  <span className="readout-label">
                    {outputAnalysis ? "INTEGRATED LOUDNESS" : "TARGET LOUDNESS"}
                  </span>
                  <div>
                    <strong>
                      {outputAnalysis
                        ? outputAnalysis.lufs.toFixed(1)
                        : settings.loudness.toFixed(1)}
                    </strong>
                    <span>LUFS</span>
                  </div>
                </div>
                <div>
                  <span className="readout-label">
                    {outputAnalysis ? "TRUE PEAK" : "PEAK CEILING"}
                  </span>
                  <div>
                    <strong>
                      {outputAnalysis ? outputAnalysis.peak.toFixed(1) : "-1.0"}
                    </strong>
                    <span>dBTP</span>
                  </div>
                </div>
                <span
                  className={`readout-indicator ${phase === "ready" ? "ready" : ""}`}
                  title={
                    phase === "ready" ? "Master checked" : "Waiting for audio"
                  }
                >
                  {phase === "ready" ? (
                    <Check size={13} />
                  ) : (
                    <AudioLines size={15} />
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="transport-bar">
            <div className="playback-controls">
              <button
                className="icon-button rewind-button"
                disabled={!source}
                onClick={() => player.seek(0)}
                aria-label="Back to start"
              >
                <SkipBack size={16} fill="currentColor" />
              </button>
              <button
                className="play-button"
                disabled={!canPlay}
                onClick={player.toggle}
                aria-label={player.playing ? "Pause playback" : "Play audio"}
                title="Play / pause (Space)"
              >
                {player.playing ? (
                  <Pause size={18} fill="currentColor" />
                ) : (
                  <Play size={18} fill="currentColor" />
                )}
              </button>
              <div className="playback-time">
                <span>{timeString(player.time)}</span>
                <i>/</i>
                <span>{timeString(source?.duration || 0)}</span>
              </div>
            </div>
            <div className="compare-controls">
              <div
                className="comparison-switch"
                role="group"
                aria-label="Compare audio"
              >
                <button
                  className={comparison === "original" ? "active" : ""}
                  onClick={() => setComparison("original")}
                  title="Listen to original (A)"
                >
                  Original
                </button>
                <button
                  className={comparison === "master" ? "active" : ""}
                  onClick={() => setComparison("master")}
                  title="Listen to master (B)"
                >
                  Master
                  <span
                    className={
                      master ? "comparison-dot ready" : "comparison-dot"
                    }
                  />
                </button>
              </div>
              <button
                className="level-match"
                role="switch"
                aria-checked={levelMatch}
                onClick={() => setLevelMatch(!levelMatch)}
                title="Attenuate the master to the original loudness for a fair comparison"
              >
                <span className={`toggle-switch ${levelMatch ? "on" : ""}`} />
                <span>Level match</span>
              </button>
            </div>
            <div className="monitor-volume">
              <button
                className="icon-button"
                onClick={() => setMuted(!muted)}
                aria-label={muted ? "Unmute playback" : "Mute playback"}
              >
                {muted ? <VolumeX size={16} /> : <Headphones size={16} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={muted ? 0 : volume}
                onChange={(event) => {
                  setVolume(Number(event.target.value));
                  setMuted(false);
                }}
                aria-label="Monitor volume"
                style={
                  {
                    "--volume": `${(muted ? 0 : volume) * 100}%`,
                  } as CSSProperties
                }
              />
            </div>
          </div>

          <div className="controls-section">
            <div className="controls-heading">
              <span className="section-label">
                <span className="tiny-number">03</span> MAKE IT YOURS
              </span>
              <button
                className="reset-button"
                onClick={reset}
                disabled={unavailable}
                title="Reset all settings"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            </div>
            <div className="controls-grid">
              <div className="profile-control">
                <span className="control-label">MASTERING PROFILE</span>
                <div className="profile-select" ref={profileMenu}>
                  <button
                    className={`profile-button ${profileOpen ? "is-open" : ""}`}
                    onClick={() => setProfileOpen(!profileOpen)}
                    aria-haspopup="listbox"
                    aria-expanded={profileOpen}
                    disabled={unavailable}
                  >
                    <span>
                      <SlidersHorizontal size={14} />
                      {profile}
                    </span>
                    <ChevronDown size={14} />
                  </button>
                  <AnimatePresence>
                    {profileOpen && (
                      <motion.div
                        className="profile-options"
                        role="listbox"
                        aria-label="Mastering profile"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                      >
                        {PROFILES.map((item) => (
                          <button
                            key={item.name}
                            role="option"
                            aria-selected={profile === item.name}
                            onClick={() => {
                              setSettings({ ...item.settings });
                              setProfile(item.name);
                              setProfileOpen(false);
                            }}
                          >
                            <span>
                              <strong>{item.name}</strong>
                              <small>{item.description}</small>
                            </span>
                            {profile === item.name && <Check size={14} />}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <p>
                  {PROFILES.find((item) => item.name === profile)
                    ?.description || "Your ears. Your finishing touches."}
                </p>
                <span className="auto-adaptive">
                  <span className="status-led small" />
                  AUTO-ADAPTIVE ENGINE{" "}
                  <button
                    onClick={() => setModal("chain")}
                    aria-label="About the auto-adaptive engine"
                  >
                    <Info size={11} />
                  </button>
                </span>
              </div>
              <div className="knobs-grid">
                <Knob
                  label="LOW END"
                  value={settings.bass}
                  min={-3}
                  max={3}
                  step={0.1}
                  defaultValue={DEFAULT_SETTINGS.bass}
                  display={`${settings.bass > 0 ? "+" : ""}${settings.bass.toFixed(1)} dB`}
                  leftLabel="LEAN"
                  rightLabel="FULL"
                  disabled={unavailable}
                  onChange={(v) => changeSetting("bass", v)}
                />
                <Knob
                  label="WARMTH"
                  value={settings.warmth}
                  min={0}
                  max={100}
                  defaultValue={DEFAULT_SETTINGS.warmth}
                  display={`${settings.warmth}%`}
                  leftLabel="CLEAN"
                  rightLabel="COLOUR"
                  disabled={unavailable}
                  onChange={(v) => changeSetting("warmth", v)}
                />
                <Knob
                  label="GLUE"
                  value={settings.glue}
                  min={0}
                  max={100}
                  defaultValue={DEFAULT_SETTINGS.glue}
                  display={`${settings.glue}%`}
                  leftLabel="LOOSE"
                  rightLabel="TIGHT"
                  disabled={unavailable}
                  onChange={(v) => changeSetting("glue", v)}
                />
                <Knob
                  label="STEREO WIDTH"
                  value={settings.width}
                  min={80}
                  max={140}
                  defaultValue={DEFAULT_SETTINGS.width}
                  display={`${settings.width}%`}
                  leftLabel="FOCUSED"
                  rightLabel="WIDE"
                  disabled={unavailable}
                  onChange={(v) => changeSetting("width", v)}
                />
                <Knob
                  label="LOUDNESS"
                  value={settings.loudness}
                  min={-18}
                  max={-8}
                  step={0.5}
                  defaultValue={DEFAULT_SETTINGS.loudness}
                  display={`${settings.loudness.toFixed(1)} LUFS`}
                  leftLabel="DYNAMIC"
                  rightLabel="LOUD"
                  disabled={unavailable}
                  onChange={(v) => changeSetting("loudness", v)}
                />
              </div>
            </div>
          </div>

          <div className="desk-bottom">
            <div className="bottom-status" role="status" aria-live="polite">
              <span
                className={`status-led ${processing || phase === "exporting" ? "is-pulsing" : ""} ${phase === "empty" ? "idle" : ""}`}
              />
              <div>
                <strong>
                  {phase === "empty" ? "Good things start with a mix." : status}
                </strong>
                <span>
                  {phase === "empty"
                    ? "Load a track. We will take it from there."
                    : phase === "ready"
                      ? "Fine-tune. Compare. Make it yours."
                      : `${Math.round(progress)}% complete. No servers involved.`}
                </span>
              </div>
            </div>
            <div className="export-group">
              <div className="export-format">
                <span>THE REAL DEAL.</span>
                <strong>
                  WAV <i>/</i> 24-BIT <i>/</i> 48 kHz
                </strong>
              </div>
              <button
                className="export-button"
                disabled={!master || phase !== "ready"}
                onClick={() => void exportMaster()}
              >
                {phase === "exporting" ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <ArrowDownToLine size={17} />
                )}
                <span>
                  {phase === "exporting" ? "Exporting..." : "Export master"}
                </span>
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
          <Screw className="bottom-screw screw-left" />
          <Screw className="bottom-screw screw-right" />
        </motion.section>

        <motion.div
          className="under-desk"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.7 }}
        >
          <span>
            <LockKeyhole size={12} />
            Your music never leaves this browser. Not even a little.
          </span>
          <span>
            NO CLOUD.
            <i />
            NO CREDITS.
            <i />
            NO COMPROMISES.
          </span>
        </motion.div>
        <section className="philosophy-section">
          <div className="philosophy-heading">
            <span className="little-wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <h2>
              Trust your ears.
              <br />
              <span>We handle the math.</span>
            </h2>
          </div>
          <p>
            Sick of AI mastering? So are we. Pureform uses the same proven
            signal processing found in real studios. Nothing invented. Nothing
            uploaded.
          </p>
          <button className="philosophy-link" onClick={() => setModal("chain")}>
            Meet the signal chain
            <ArrowUpRight size={17} />
          </button>
        </section>
      </main>

      <footer className="site-footer">
        <Brand compact />
        <span>A little less artificial. A little more you.</span>
        <button onClick={() => setModal("help")}>
          <CircleHelp size={13} />A hand in the studio
        </button>
      </footer>
      <input
        className="sr-only"
        type="file"
        accept=".wav,.wave,.flac,.m4a,.mp3,.aac"
        ref={fileInput}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importAudio(file);
          event.target.value = "";
        }}
        aria-label="Choose an audio file"
      />
      <AnimatePresence>
        {notice && (
          <motion.div
            className={`toast ${notice.error ? "toast-error" : ""}`}
            role={notice.error ? "alert" : "status"}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            {notice.error ? <Info size={18} /> : <Check size={18} />}
            <p>{notice.message}</p>
            <button
              onClick={() => setNotice(null)}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modal && (
          <ModalShell
            onClose={closeModal}
            title={
              modal === "help"
                ? "From mix to master."
                : modal === "chain"
                  ? "No magic. Just a great signal chain."
                  : "Your music is not training data."
            }
            eyebrow={
              modal === "help"
                ? "WELCOME TO THE STUDIO"
                : modal === "chain"
                  ? "INSIDE THE PF-01"
                  : "100% LOGIC. 0% AI."
            }
          >
            {modal === "help" ? (
              <>
                <p className="modal-intro">
                  A proper finishing touch, without a complicated session.
                </p>
                <ol className="how-steps">
                  <li>
                    <span>01</span>
                    <div>
                      <h3>Bring your mix.</h3>
                      <p>
                        Drop in a WAV, FLAC, M4A (AAC or ALAC), or MP3. Up to
                        200 MB and 15 minutes. Lossless files give you the best
                        starting point.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <h3>Find your sweet spot.</h3>
                      <p>
                        Your track is mastered automatically. Choose a profile,
                        fine-tune the knobs, and compare Original and Master.
                        Turn on Level match for a fairer comparison.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <h3>Make it a record.</h3>
                      <p>
                        Export a 24-bit, 48 kHz stereo WAV with TPDF dither. No
                        sign-up, no credits, and not a single byte of your audio
                        uploaded.
                      </p>
                    </div>
                  </li>
                </ol>
                <div className="keyboard-note">
                  <span>
                    <kbd>space</kbd> Play / pause
                  </span>
                  <span>
                    <kbd>A</kbd> Original
                  </span>
                  <span>
                    <kbd>B</kbd> Master
                  </span>
                </div>
                <button className="modal-primary" onClick={closeModal}>
                  Back to the studio <ArrowRight size={16} />
                </button>
              </>
            ) : modal === "chain" ? (
              <>
                <p className="modal-intro">
                  Time-tested audio engineering, calibrated to your mix. The
                  same input and settings always produce the same result.
                </p>
                <div className="signal-chain">
                  {[
                    {
                      title: "Measure first",
                      text: "BS.1770 K-weighted, gated integrated loudness, crest factor, and low-frequency energy. Real measurements, not predictions.",
                    },
                    {
                      title: "Clean & shape",
                      text: "A 27 Hz high-pass filter clears subsonic energy. Adaptive low-shelf and low-mid EQ reduce excess weight, while a gentle high shelf opens up the top.",
                    },
                    {
                      title: "Colour & connect",
                      text: "Soft-knee compression adds glue. Parallel tanh saturation introduces warmth. Mid/side width adjustment keeps the low end centered.",
                    },
                    {
                      title: "Finish with precision",
                      text: "Loudness-targeted gain feeds a stereo-linked, 5 ms lookahead limiter. A 4x interpolated true-peak check protects the -1 dBTP ceiling, followed by 24-bit TPDF-dithered export.",
                    },
                  ].map((step, i) => (
                    <div key={step.title}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <section>
                        <h3>{step.title}</h3>
                        <p>{step.text}</p>
                      </section>
                    </div>
                  ))}
                </div>
                <div className="honest-note">
                  <Info size={17} />
                  <p>
                    Good mastering cannot undo distortion, clipping, or a poor
                    balance in a mix. Very dynamic material may land below its
                    loudness target to preserve the peak ceiling. Always
                    audition your master before release.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="philosophy-modal-mark">
                  <Brand />
                </div>
                <p className="modal-intro">
                  We love music. We love the craft behind it. We do not think
                  your final master should be a black box.
                </p>
                <p className="modal-body-text">
                  Pureform is a deterministic mastering processor. Every filter,
                  envelope, and gain change follows established digital signal
                  processing. No neural networks. No model training. No
                  generative audio.
                </p>
                <p className="modal-body-text">
                  Your browser is the studio. Audio is decoded, analyzed,
                  processed, and exported on your device. The compatibility
                  decoder is served with the app; your audio is never sent to a
                  server. Close the tab, and your session is gone.
                </p>
                <div className="philosophy-promise">
                  <LockKeyhole size={19} />
                  <span>
                    Your recordings are yours.
                    <br />
                    <strong>We would like to keep it that way.</strong>
                  </span>
                </div>
                <button className="modal-primary" onClick={closeModal}>
                  Sounds good to me <Volume2 size={17} />
                </button>
              </>
            )}
          </ModalShell>
        )}
      </AnimatePresence>
    </div>
  );
}
