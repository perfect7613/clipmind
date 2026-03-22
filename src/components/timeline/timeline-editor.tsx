"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { ThumbnailStrip } from "./thumbnail-strip";
import { WaveformTrack } from "./waveform-track";
import { EffectPanel } from "./effect-panel";
import { AiPromptBox } from "./ai-prompt-box";
import { CaptionOverlay } from "./caption-overlay";
import { useTimelineStore } from "./timeline-store";

interface TimelineEditorProps {
  clipId: string;
  videoSrc: string;
}

/* ------------------------------------------------------------------ */
/*  SVG Icon helpers                                                   */
/* ------------------------------------------------------------------ */

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
      <polygon points="6,3 20,12 6,21" />
    </svg>
  );
}
function IconPause() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
      <rect x="5" y="3" width="4" height="18" />
      <rect x="15" y="3" width="4" height="18" />
    </svg>
  );
}
function IconScissors() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,6 5,6 21,6" />
      <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2" />
    </svg>
  );
}
function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,4 1,10 7,10" />
      <path d="M3.51,15a9,9,0,1,0,2.13-9.36L1,10" />
    </svg>
  );
}
function IconRedo() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23,4 23,10 17,10" />
      <path d="M20.49,15a9,9,0,1,1-2.12-9.36L23,10" />
    </svg>
  );
}
function IconSparkle() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M12 0L14.59 8.41L23 12L14.59 15.59L12 24L9.41 15.59L1 12L9.41 8.41Z" />
    </svg>
  );
}
function IconMusicNote() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}
function IconMagnet() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2v6a6 6 0 0 0 12 0V2" />
      <line x1="6" y1="2" x2="6" y2="6" />
      <line x1="18" y1="2" x2="18" y2="6" />
      <line x1="2" y1="2" x2="10" y2="2" />
      <line x1="14" y1="2" x2="22" y2="2" />
    </svg>
  );
}
function IconFilmPlus() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
      <line x1="17" y1="17" x2="22" y2="17" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Keyframe animations                                                */
/* ------------------------------------------------------------------ */

const KEYFRAMES = `
@keyframes playhead-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
@keyframes segment-delete {
  from { transform: scaleX(1); opacity: 1; }
  to { transform: scaleX(0); opacity: 0; }
}
@keyframes split-flash {
  0% { background: rgba(249, 115, 22, 0.6); }
  100% { background: transparent; }
}
`;

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function TimelineEditor({ clipId, videoSrc }: TimelineEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showEffects, setShowEffects] = useState(false);
  const [splitFlash, setSplitFlash] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dragSegIdx, setDragSegIdx] = useState<number | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);

  const {
    durationS,
    cutPoints,
    effects,
    segments,
    selectedSegmentId,
    isModified,
    isExporting,
    exportProgress,
    timelineZoom,
    undoStack,
    redoStack,
    loadTimeline,
    setExporting,
    setPlayhead,
    setTimelineZoom,
    splitAtPlayhead,
    deleteSegment,
    selectSegmentById,
    undo,
    redo,
    moveSegment,
    aiPromptVisible,
    showAiPrompt,
    hideAiPrompt,
    beatMarkers,
    beatsVisible,
    beatsLoading,
    loadBeats,
    toggleBeatsVisible,
    snapCutsToBeats,
    captions,
    updateEffects,
    addVideoSegment,
  } = useTimelineStore();

  // Load timeline data
  useEffect(() => {
    fetch(`/api/clips/${clipId}/timeline`)
      .then((r) => r.json())
      .then((data) => loadTimeline(clipId, data))
      .catch(() => {});
  }, [clipId, loadTimeline]);

  // Sync video time
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const t = videoRef.current.currentTime;
      setCurrentTime(t);
      setPlayhead(t);
    }
  }, [setPlayhead]);

  const handleSeek = useCallback(
    (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
        setCurrentTime(time);
        setPlayhead(time);
      }
    },
    [setPlayhead]
  );

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const changeSpeed = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  }, []);

  // Frame step (1/30 second)
  const frameStep = useCallback(
    (direction: 1 | -1) => {
      if (videoRef.current) {
        const t = videoRef.current.currentTime + direction * (1 / 30);
        videoRef.current.currentTime = Math.max(0, Math.min(durationS, t));
        setCurrentTime(videoRef.current.currentTime);
        setPlayhead(videoRef.current.currentTime);
      }
    },
    [durationS, setPlayhead]
  );

  // Split with flash effect
  const handleSplit = useCallback(() => {
    splitAtPlayhead();
    setSplitFlash(true);
    setTimeout(() => setSplitFlash(false), 300);
  }, [splitAtPlayhead]);

  // Delete with animation
  const handleDelete = useCallback(() => {
    if (!selectedSegmentId || segments.length <= 1) return;
    setDeletingId(selectedSegmentId);
    setTimeout(() => {
      deleteSegment(selectedSegmentId);
      setDeletingId(null);
    }, 200);
  }, [selectedSegmentId, segments.length, deleteSegment]);

  // Toggle beats — load on first click
  const handleToggleBeats = useCallback(() => {
    if (beatMarkers.length === 0 && !beatsLoading) {
      loadBeats(clipId);
    } else {
      toggleBeatsVisible();
    }
  }, [beatMarkers.length, beatsLoading, loadBeats, clipId, toggleBeatsVisible]);

  // Video import handler
  const handleVideoFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/clips/${clipId}/add-video`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json() as { path: string; durationS: number };
      addVideoSegment(data.path, data.durationS);
    } catch (err) {
      console.error("Video import failed:", err);
    } finally {
      setVideoUploading(false);
      // Reset file input so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [clipId, addVideoSegment]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "s":
        case "S":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            handleSplit();
          }
          break;
        case "Backspace":
        case "Delete":
          e.preventDefault();
          handleDelete();
          break;
        case "z":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          frameStep(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          frameStep(1);
          break;
        case "b":
        case "B":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            handleToggleBeats();
          }
          break;
        case "/":
          e.preventDefault();
          if (aiPromptVisible) {
            hideAiPrompt();
          } else {
            showAiPrompt();
          }
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, handleSplit, handleDelete, undo, redo, frameStep, aiPromptVisible, showAiPrompt, hideAiPrompt, handleToggleBeats]);

  // Toggle effects panel when segment is selected
  useEffect(() => {
    setShowEffects(!!selectedSegmentId);
  }, [selectedSegmentId]);

  // Export
  const handleExport = async () => {
    if (!isModified) return;
    setExporting(true, 0);

    try {
      await fetch(`/api/clips/${clipId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeline: {
            cutPoints: segments.map((s) => ({ start_s: s.start_s, end_s: s.end_s })),
            segments: segments.map((s) => ({
              id: s.id,
              start_s: s.start_s,
              end_s: s.end_s,
              effects: s.effects,
              sourceVideoPath: s.sourceVideoPath,
            })),
            effects,
            zoomEvents: [],
            speedRamps: [],
          },
        }),
      });

      setExporting(true, 20);

      const response = await fetch(`/api/clips/${clipId}/re-render`, { method: "POST" });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let reading = true;
        while (reading) {
          const { done, value } = await reader.read();
          if (done) {
            reading = false;
            break;
          }

          const text = decoder.decode(value);
          const lines = text.split("\n").filter((l) => l.startsWith("data: "));
          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.pct) setExporting(true, data.pct);
              if (data.step === "completed") {
                setExporting(false);
                if (videoRef.current) {
                  videoRef.current.src = videoSrc + "?t=" + Date.now();
                  videoRef.current.load();
                }
              }
              if (data.step === "failed") {
                setExporting(false);
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch {
      setExporting(false);
    }
  };

  const speeds = [0.5, 0.75, 1, 1.5, 2];

  // Real-time CSS preview of effects on the video
  const currentSegment = segments.find((s) => currentTime >= s.start_s && currentTime <= s.end_s)
    || segments.find((s) => s.id === selectedSegmentId);

  const previewStyle: React.CSSProperties = {};
  if (currentSegment) {
    const fx = currentSegment.effects;
    const transforms: string[] = [];
    const filters: string[] = [];

    if (fx.zoom) {
      const zoomScale = fx.zoomLevel === "tight" ? 1.15 : 1.1;
      transforms.push(`scale(${zoomScale})`);
    }

    if (fx.colorProfile === "warm") {
      filters.push("sepia(0.15)", "saturate(1.1)");
    } else if (fx.colorProfile === "cool") {
      filters.push("hue-rotate(10deg)", "saturate(0.95)");
    } else if (fx.colorProfile === "cinematic") {
      filters.push("contrast(1.15)", "saturate(0.9)", "brightness(0.95)");
    } else if (fx.colorProfile === "bw") {
      filters.push("grayscale(1)", "contrast(1.3)");
    } else if (fx.colorProfile === "vintage") {
      filters.push("sepia(0.25)", "saturate(0.7)", "contrast(1.05)");
    } else if (fx.colorProfile === "neon") {
      filters.push("saturate(1.5)", "contrast(1.2)", "brightness(0.95)");
    }

    if (transforms.length > 0) previewStyle.transform = transforms.join(" ");
    if (filters.length > 0) previewStyle.filter = filters.join(" ");
    previewStyle.transition = "transform 0.4s ease, filter 0.4s ease";
  }

  return (
    <div className="relative flex flex-col w-full select-none bg-[#09090b] text-zinc-50" style={{ fontFamily: "'Geist Sans', sans-serif" }}>
      <style>{KEYFRAMES}</style>

      {/* Hidden file input for video import */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleVideoFileSelect}
      />

      {/* ── Video Player with real-time effect preview ──── */}
      <div ref={videoContainerRef} className="relative overflow-hidden rounded-lg ring-1 ring-zinc-800 bg-black">
        <video
          ref={videoRef}
          src={videoSrc}
          className="w-full block"
          style={{
            aspectRatio: "16/9",
            transformOrigin: "center center",
            ...previewStyle,
          }}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onLoadedMetadata={() => {
            if (videoRef.current) setCurrentTime(0);
          }}
        />

        {/* Vignette overlay preview */}
        {currentSegment?.effects.vignette && (
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-400"
            style={{
              background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)",
            }}
          />
        )}

        {/* Film grain overlay preview */}
        {currentSegment?.effects.filmGrain && (
          <div
            className="absolute inset-0 pointer-events-none opacity-30 mix-blend-overlay transition-opacity duration-400"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.15'/%3E%3C/svg%3E")`,
            }}
          />
        )}

        {/* Active effects badge */}
        {currentSegment && (currentSegment.effects.zoom || currentSegment.effects.colorProfile !== "neutral" || currentSegment.effects.vignette || currentSegment.effects.filmGrain) && (
          <div className="absolute top-3 right-3 flex gap-1 z-20">
            {currentSegment.effects.zoom && (
              <span className="text-[9px] bg-orange-500/80 text-white px-1.5 py-0.5 rounded" style={{ fontFamily: "'Geist Mono', monospace" }}>
                ZOOM {currentSegment.effects.zoomLevel === "tight" ? "1.15x" : "1.1x"}
              </span>
            )}
            {currentSegment.effects.colorProfile !== "neutral" && (
              <span className="text-[9px] bg-white/15 text-zinc-300 px-1.5 py-0.5 rounded backdrop-blur-sm" style={{ fontFamily: "'Geist Mono', monospace" }}>
                {currentSegment.effects.colorProfile.toUpperCase()}
              </span>
            )}
            {currentSegment.effects.speedRamp && (
              <span className="text-[9px] bg-blue-500/80 text-white px-1.5 py-0.5 rounded" style={{ fontFamily: "'Geist Mono', monospace" }}>
                {currentSegment.effects.speedFactor}x
              </span>
            )}
          </div>
        )}

        {/* Real-time draggable caption overlay */}
        {captions.length > 0 && currentSegment && (
          <CaptionOverlay
            captions={captions}
            currentTime={currentTime}
            style={currentSegment.effects.captions || { enabled: true, position: "bottom", fontSize: "medium", color: "#FFFFFF", background: "dark-bar", casing: "sentence" }}
            onStyleChange={(changes) => updateEffects({ captions: { ...currentSegment.effects.captions, ...changes } as any })}
            containerRef={videoContainerRef}
          />
        )}

        {/* Click overlay */}
        <button
          onClick={togglePlay}
          className="absolute inset-0 w-full h-full bg-transparent border-none cursor-pointer transition-colors duration-150 hover:bg-black/10"
        >
          {!isPlaying && (
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm m-auto">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white ml-0.5">
                <polygon points="6,3 20,12 6,21" />
              </svg>
            </div>
          )}
        </button>

        {/* Time code overlay */}
        <div
          className="absolute bottom-3 left-3 px-2 py-1 bg-black/70 rounded backdrop-blur-sm text-zinc-400 tracking-wider"
          style={{ fontFamily: "'Geist Mono', monospace", fontSize: "12px" }}
        >
          {formatTimecode(currentTime)}
          <span className="text-zinc-600 mx-1">/</span>
          {formatTimecode(durationS)}
        </div>

        {/* Speed badge */}
        {playbackRate !== 1 && (
          <div
            className="absolute bottom-3 right-3 px-2 py-1 bg-orange-500/80 rounded text-white"
            style={{ fontFamily: "'Geist Mono', monospace", fontSize: "11px" }}
          >
            {playbackRate}x
          </div>
        )}
      </div>

      {/* ── Toolbar ──────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 h-10 bg-zinc-900 border-b border-t border-zinc-700">
        {/* Play/Pause */}
        <ToolbarButton onClick={togglePlay} title="Play/Pause (Space)">
          {isPlaying ? <IconPause /> : <IconPlay />}
        </ToolbarButton>

        {/* Speed selector */}
        <div className="flex items-center gap-0.5 ml-1">
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => changeSpeed(s)}
              className={`px-1.5 py-0.5 text-[10px] rounded transition-all duration-100 border-none cursor-pointer ${
                playbackRate === s
                  ? "text-orange-500 bg-orange-500/10"
                  : "text-zinc-500 bg-transparent hover:text-zinc-400"
              }`}
              style={{ fontFamily: "'Geist Mono', monospace" }}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-zinc-700 mx-1.5" />

        {/* Split */}
        <ToolbarButton onClick={handleSplit} title="Split at playhead (S)" accent>
          <IconScissors />
        </ToolbarButton>

        {/* Delete */}
        <ToolbarButton onClick={handleDelete} title="Delete segment (Backspace)" disabled={segments.length <= 1}>
          <IconTrash />
        </ToolbarButton>

        {/* Divider */}
        <div className="w-px h-5 bg-zinc-700 mx-1.5" />

        {/* Undo/Redo */}
        <ToolbarButton onClick={undo} title="Undo (Cmd+Z)" disabled={undoStack.length === 0}>
          <IconUndo />
        </ToolbarButton>
        <ToolbarButton onClick={redo} title="Redo (Cmd+Shift+Z)" disabled={redoStack.length === 0}>
          <IconRedo />
        </ToolbarButton>

        {/* Divider */}
        <div className="w-px h-5 bg-zinc-700 mx-1.5" />

        {/* AI Prompt */}
        <ToolbarButton onClick={showAiPrompt} title="AI Edit (/)" accent={aiPromptVisible}>
          <IconSparkle />
        </ToolbarButton>

        {/* Divider */}
        <div className="w-px h-5 bg-zinc-700 mx-1.5" />

        {/* Beat Detection */}
        <ToolbarButton onClick={handleToggleBeats} title="Toggle beats (B)" accent={beatsVisible}>
          {beatsLoading ? (
            <span className="text-[10px]" style={{ fontFamily: "'Geist Mono', monospace" }}>...</span>
          ) : (
            <IconMusicNote />
          )}
        </ToolbarButton>

        {/* Snap to beats */}
        {beatsVisible && beatMarkers.length > 0 && (
          <ToolbarButton onClick={snapCutsToBeats} title="Snap cuts to beats">
            <IconMagnet />
          </ToolbarButton>
        )}

        {/* Divider */}
        <div className="w-px h-5 bg-zinc-700 mx-1.5" />

        {/* Add Video */}
        <ToolbarButton
          onClick={() => fileInputRef.current?.click()}
          title="Add Video"
          disabled={videoUploading}
        >
          {videoUploading ? (
            <div className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-orange-500 rounded-full animate-spin" />
          ) : (
            <IconFilmPlus />
          )}
        </ToolbarButton>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Zoom slider */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600" style={{ fontFamily: "'Geist Mono', monospace" }}>
            {timelineZoom.toFixed(1)}x
          </span>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={timelineZoom}
            onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
            className="w-20 accent-orange-500"
          />
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-zinc-700 mx-1.5" />

        {/* Export */}
        <button
          onClick={handleExport}
          disabled={!isModified || isExporting}
          className={`px-4 h-7 text-[11px] font-semibold uppercase tracking-wider rounded-md border-none transition-all duration-150 ${
            !isModified || isExporting
              ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
              : "bg-orange-500 hover:bg-orange-600 text-white cursor-pointer hover:scale-105 active:scale-95"
          }`}
          style={{ fontFamily: "'Geist Sans', sans-serif" }}
        >
          {isExporting ? `${exportProgress}%` : "Export"}
        </button>
      </div>

      {/* Export progress bar */}
      {isExporting && (
        <div className="h-0.5 bg-zinc-900">
          <div
            className="h-full bg-orange-500 transition-all duration-300 ease-out"
            style={{ width: `${exportProgress}%` }}
          />
        </div>
      )}

      {/* ── AI Prompt Box ──────────────────────────────── */}
      <AiPromptBox clipId={clipId} visible={aiPromptVisible} onClose={hideAiPrompt} />

      {/* ── Timeline Area (with effects panel overlay) ──── */}
      <div className="relative">
        {/* Split flash overlay */}
        {splitFlash && (
          <div
            className="absolute inset-0 pointer-events-none z-50"
            style={{ animation: "split-flash 300ms ease-out forwards" }}
          />
        )}

        <div className="flex">
          {/* Timeline content */}
          <div className="flex-1 min-w-0">
            {/* Thumbnail strip */}
            <ThumbnailStrip
              clipId={clipId}
              durationS={durationS}
              currentTime={currentTime}
              onSeek={handleSeek}
              segments={segments}
              selectedSegmentId={selectedSegmentId}
              onSelectSegment={(id) => selectSegmentById(id)}
              timelineZoom={timelineZoom}
            />

            {/* Waveform */}
            <WaveformTrack
              clipId={clipId}
              durationS={durationS}
              currentTime={currentTime}
              onSeek={handleSeek}
              segments={segments}
              selectedSegmentId={selectedSegmentId}
              onSelectSegment={(id) => selectSegmentById(id)}
              timelineZoom={timelineZoom}
              onZoomChange={setTimelineZoom}
              cutPoints={cutPoints}
              beatMarkers={beatMarkers}
              beatsVisible={beatsVisible}
            />

            {/* Segment labels row */}
            <div className="relative overflow-x-auto h-6 bg-[#09090b]">
              <div style={{ width: `${100 * timelineZoom}%`, position: "relative", height: "100%" }}>
                {segments.map((seg, i) => {
                  const leftPct = (seg.start_s / durationS) * 100;
                  const widthPct = ((seg.end_s - seg.start_s) / durationS) * 100;
                  const isSelected = seg.id === selectedSegmentId;
                  const isDeleting = seg.id === deletingId;
                  const isDragging = dragSegIdx === i;
                  const segDuration = seg.end_s - seg.start_s;

                  // Color-coded left border based on effects
                  const hasFx = seg.effects.colorProfile !== "neutral" || seg.effects.zoom || seg.effects.speedRamp;
                  const borderColor = seg.effects.speedRamp
                    ? "#3b82f6"
                    : seg.effects.zoom
                      ? "#f97316"
                      : seg.effects.colorProfile === "cinematic"
                        ? "#22c55e"
                        : seg.effects.colorProfile === "warm"
                          ? "#f59e0b"
                          : seg.effects.colorProfile === "cool"
                            ? "#06b6d4"
                            : "#3f3f46";

                  return (
                    <div
                      key={seg.id}
                      draggable
                      onDragStart={() => setDragSegIdx(i)}
                      onDragOver={(e) => { e.preventDefault(); }}
                      onDrop={() => { if (dragSegIdx !== null && dragSegIdx !== i) moveSegment(dragSegIdx, i); setDragSegIdx(null); }}
                      onDragEnd={() => setDragSegIdx(null)}
                      className="absolute top-0 h-full flex items-center px-1.5 cursor-pointer transition-all duration-150"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        background: isSelected ? "rgba(249, 115, 22, 0.12)" : i % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                        borderLeft: `2px solid ${borderColor}`,
                        borderRight: "1px solid #09090b",
                        fontFamily: "'Geist Mono', monospace",
                        fontSize: "9px",
                        color: isSelected ? "#f97316" : "#a1a1aa",
                        animation: isDeleting ? "segment-delete 200ms ease-out forwards" : undefined,
                        transformOrigin: "center",
                        boxShadow: isDragging ? "0 0 8px 2px rgba(249, 115, 22, 0.6)" : undefined,
                        opacity: isDragging ? 0.7 : 1,
                      }}
                      onClick={() => selectSegmentById(seg.id)}
                    >
                      <span className="truncate">{segDuration.toFixed(1)}s</span>
                      {seg.sourceVideoPath && (
                        <span className="ml-1 text-zinc-600 truncate">vid</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Transition picker row between segments */}
          {segments.length > 1 && (
            <div className="relative overflow-x-auto h-7 bg-[#09090b]">
              <div style={{ width: `${100 * timelineZoom}%`, position: "relative", height: "100%" }}>
                {segments.map((seg, i) => {
                  if (i === segments.length - 1) return null;
                  const boundaryPct = (seg.end_s / durationS) * 100;
                  return (
                    <div
                      key={`trans-${seg.id}`}
                      className="absolute flex items-center justify-center h-full z-20"
                      style={{
                        left: `${boundaryPct}%`,
                        transform: "translateX(-50%)",
                      }}
                    >
                      <select
                        value={seg.effects.transitionType}
                        onChange={(e) => {
                          const { updateEffects, selectSegmentById } = useTimelineStore.getState();
                          selectSegmentById(seg.id);
                          updateEffects({ transitionType: e.target.value });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[9px] bg-zinc-900 text-zinc-500 border border-zinc-700 rounded px-1 py-0.5 cursor-pointer max-w-[70px]"
                        style={{ fontFamily: "'Geist Mono', monospace" }}
                      >
                        <option value="crossfade">X-Fade</option>
                        <option value="dip-to-black">Dip Blk</option>
                        <option value="wipe-left">Wipe</option>
                        <option value="fade">Fade</option>
                        <option value="dissolve">Dissolve</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Effect panel — slides in from right */}
        <EffectPanel visible={showEffects} />
      </div>

      {/* ── Keyboard shortcut hint ───────────────────────── */}
      <div className="flex items-center justify-center gap-4 px-3 h-6 bg-[#09090b] border-t border-zinc-900">
        {[
          ["Space", "Play"],
          ["S", "Split"],
          ["\u232B", "Delete"],
          ["\u2318Z", "Undo"],
          ["\u2190\u2192", "Step"],
          ["B", "Beats"],
          ["/", "AI"],
        ].map(([key, label]) => (
          <span key={key} className="text-[9px] text-zinc-700" style={{ fontFamily: "'Geist Mono', monospace" }}>
            <span className="text-zinc-600 bg-zinc-900 px-1 py-px rounded-sm mr-1">
              {key}
            </span>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar button                                                     */
/* ------------------------------------------------------------------ */

function ToolbarButton({
  children,
  onClick,
  title,
  disabled,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`w-8 h-7 flex items-center justify-center rounded-md border transition-all duration-100 ${
        disabled
          ? "text-zinc-800 border-transparent cursor-not-allowed"
          : accent
            ? "text-orange-500 border-zinc-700 hover:bg-orange-500/10 hover:scale-105 active:scale-95"
            : "text-zinc-400 border-transparent hover:border-zinc-700 hover:bg-zinc-800 hover:scale-105 active:scale-95"
      } bg-transparent cursor-pointer`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Time formatting                                                    */
/* ------------------------------------------------------------------ */

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}
