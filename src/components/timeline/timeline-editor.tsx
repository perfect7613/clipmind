"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { ThumbnailStrip } from "./thumbnail-strip";
import { WaveformTrack } from "./waveform-track";
import { EffectPanel } from "./effect-panel";
import { AiPromptBox } from "./ai-prompt-box";
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

/* ------------------------------------------------------------------ */
/*  Playhead pulse animation (CSS-in-JS for the paused state)          */
/* ------------------------------------------------------------------ */

const PULSE_KEYFRAMES = `
@keyframes playhead-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
@keyframes segment-delete {
  from { transform: scaleX(1); opacity: 1; }
  to { transform: scaleX(0); opacity: 0; }
}
@keyframes split-flash {
  0% { background: rgba(232, 98, 14, 0.6); }
  100% { background: transparent; }
}
`;

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function TimelineEditor({ clipId, videoSrc }: TimelineEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showEffects, setShowEffects] = useState(false);
  const [splitFlash, setSplitFlash] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dragSegIdx, setDragSegIdx] = useState<number | null>(null);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Don't capture when typing in inputs
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
      // Save segments + effects to timeline data
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

  // ── Real-time CSS preview of effects on the video ──
  // Compute CSS transform/filter from the current segment's effects
  const currentSegment = segments.find((s) => currentTime >= s.start_s && currentTime <= s.end_s)
    || segments.find((s) => s.id === selectedSegmentId);

  const previewStyle: React.CSSProperties = {};
  if (currentSegment) {
    const fx = currentSegment.effects;
    const transforms: string[] = [];
    const filters: string[] = [];

    // Zoom preview — CSS scale
    if (fx.zoom) {
      const zoomScale = fx.zoomLevel === "tight" ? 1.15 : 1.1;
      transforms.push(`scale(${zoomScale})`);
    }

    // Color grading preview — CSS filter approximations
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

    // Vignette preview — box shadow inset
    // (handled separately as an overlay div)

    // Film grain — handled as an overlay

    // Speed preview — playback rate
    if (fx.speedRamp && fx.speedFactor !== playbackRate) {
      // Don't auto-change playback rate — just show indicator
    }

    if (transforms.length > 0) previewStyle.transform = transforms.join(" ");
    if (filters.length > 0) previewStyle.filter = filters.join(" ");
    previewStyle.transition = "transform 0.4s ease, filter 0.4s ease";
  }

  return (
    <div
      className="relative flex flex-col w-full select-none"
      style={{
        background: "#0a0a0a",
        color: "#e5e5e5",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <style>{PULSE_KEYFRAMES}</style>

      {/* ── Video Player with real-time effect preview ──── */}
      <div className="relative overflow-hidden" style={{ background: "#000" }}>
        <video
          ref={videoRef}
          src={videoSrc}
          className="w-full"
          style={{
            aspectRatio: "16/9",
            display: "block",
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
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)",
              transition: "opacity 0.4s ease",
            }}
          />
        )}

        {/* Film grain overlay preview */}
        {currentSegment?.effects.filmGrain && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.15'/%3E%3C/svg%3E")`,
              opacity: 0.3,
              mixBlendMode: "overlay",
              transition: "opacity 0.4s ease",
            }}
          />
        )}

        {/* Active effects badge */}
        {currentSegment && (currentSegment.effects.zoom || currentSegment.effects.colorProfile !== "neutral" || currentSegment.effects.vignette || currentSegment.effects.filmGrain) && (
          <div
            className="absolute top-3 right-3 flex gap-1"
            style={{ zIndex: 20 }}
          >
            {currentSegment.effects.zoom && (
              <span style={{ fontSize: "9px", background: "rgba(232,98,14,0.8)", color: "#fff", padding: "2px 6px", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace" }}>
                ZOOM {currentSegment.effects.zoomLevel === "tight" ? "1.15x" : "1.1x"}
              </span>
            )}
            {currentSegment.effects.colorProfile !== "neutral" && (
              <span style={{ fontSize: "9px", background: "rgba(255,255,255,0.15)", color: "#ccc", padding: "2px 6px", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace", backdropFilter: "blur(4px)" }}>
                {currentSegment.effects.colorProfile.toUpperCase()}
              </span>
            )}
            {currentSegment.effects.speedRamp && (
              <span style={{ fontSize: "9px", background: "rgba(59,130,246,0.8)", color: "#fff", padding: "2px 6px", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace" }}>
                {currentSegment.effects.speedFactor}x
              </span>
            )}
          </div>
        )}

        {/* Click overlay */}
        <button
          onClick={togglePlay}
          className="absolute inset-0 w-full h-full"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            transition: "background 150ms",
          }}
          onMouseEnter={(e) => { (e.currentTarget.style.background) = "rgba(0,0,0,0.1)"; }}
          onMouseLeave={(e) => { (e.currentTarget.style.background) = "transparent"; }}
        >
          {!isPlaying && (
            <div
              className="flex items-center justify-center"
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "rgba(0,0,0,0.6)",
                margin: "auto",
                backdropFilter: "blur(4px)",
              }}
            >
              <svg viewBox="0 0 24 24" style={{ width: "24px", height: "24px", fill: "#fff", marginLeft: "2px" }}>
                <polygon points="6,3 20,12 6,21" />
              </svg>
            </div>
          )}
        </button>

        {/* Time code overlay — bottom left */}
        <div
          className="absolute bottom-3 left-3 px-2 py-1"
          style={{
            background: "rgba(0,0,0,0.7)",
            borderRadius: "4px",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "12px",
            color: "#ccc",
            backdropFilter: "blur(4px)",
            letterSpacing: "0.05em",
          }}
        >
          {formatTimecode(currentTime)}
          <span style={{ color: "#555", margin: "0 4px" }}>/</span>
          {formatTimecode(durationS)}
        </div>

        {/* Speed badge — bottom right */}
        {playbackRate !== 1 && (
          <div
            className="absolute bottom-3 right-3 px-2 py-1"
            style={{
              background: "rgba(232, 98, 14, 0.8)",
              borderRadius: "4px",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
              color: "#fff",
            }}
          >
            {playbackRate}x
          </div>
        )}
      </div>

      {/* ── Toolbar ──────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 px-3"
        style={{
          height: "40px",
          background: "#111",
          borderBottom: "1px solid #1a1a1a",
          borderTop: "1px solid #1a1a1a",
        }}
      >
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
              style={{
                padding: "2px 6px",
                fontSize: "10px",
                fontFamily: "'JetBrains Mono', monospace",
                color: playbackRate === s ? "#E8620E" : "#555",
                background: playbackRate === s ? "rgba(232, 98, 14, 0.1)" : "transparent",
                border: "none",
                borderRadius: "3px",
                cursor: "pointer",
                transition: "all 100ms",
              }}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: "1px", height: "20px", background: "#222", margin: "0 6px" }} />

        {/* Split */}
        <ToolbarButton onClick={handleSplit} title="Split at playhead (S)" accent>
          <IconScissors />
        </ToolbarButton>

        {/* Delete */}
        <ToolbarButton
          onClick={handleDelete}
          title="Delete segment (Backspace)"
          disabled={segments.length <= 1}
        >
          <IconTrash />
        </ToolbarButton>

        {/* Divider */}
        <div style={{ width: "1px", height: "20px", background: "#222", margin: "0 6px" }} />

        {/* Undo/Redo */}
        <ToolbarButton onClick={undo} title="Undo (Cmd+Z)" disabled={undoStack.length === 0}>
          <IconUndo />
        </ToolbarButton>
        <ToolbarButton onClick={redo} title="Redo (Cmd+Shift+Z)" disabled={redoStack.length === 0}>
          <IconRedo />
        </ToolbarButton>

        {/* Divider */}
        <div style={{ width: "1px", height: "20px", background: "#222", margin: "0 6px" }} />

        {/* AI Prompt */}
        <ToolbarButton onClick={showAiPrompt} title="AI Edit (/)" accent={aiPromptVisible}>
          <IconSparkle />
        </ToolbarButton>

        {/* Divider */}
        <div style={{ width: "1px", height: "20px", background: "#222", margin: "0 6px" }} />

        {/* Beat Detection */}
        <ToolbarButton onClick={handleToggleBeats} title="Toggle beats (B)" accent={beatsVisible}>
          {beatsLoading ? (
            <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace" }}>...</span>
          ) : (
            <IconMusicNote />
          )}
        </ToolbarButton>

        {/* Snap to beats — only when beats are visible */}
        {beatsVisible && beatMarkers.length > 0 && (
          <ToolbarButton onClick={snapCutsToBeats} title="Snap cuts to beats">
            <IconMagnet />
          </ToolbarButton>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Zoom slider */}
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "10px", color: "#444", fontFamily: "'JetBrains Mono', monospace" }}>
            {timelineZoom.toFixed(1)}x
          </span>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={timelineZoom}
            onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
            style={{ width: "80px", accentColor: "#E8620E" }}
          />
        </div>

        {/* Divider */}
        <div style={{ width: "1px", height: "20px", background: "#222", margin: "0 6px" }} />

        {/* Export */}
        <button
          onClick={handleExport}
          disabled={!isModified || isExporting}
          style={{
            padding: "4px 14px",
            fontSize: "11px",
            fontFamily: "system-ui",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: !isModified || isExporting ? "#333" : "#fff",
            background: !isModified || isExporting ? "#1a1a1a" : "#E8620E",
            border: "none",
            borderRadius: "4px",
            cursor: !isModified || isExporting ? "not-allowed" : "pointer",
            transition: "all 150ms",
          }}
        >
          {isExporting ? `${exportProgress}%` : "Export"}
        </button>
      </div>

      {/* Export progress bar */}
      {isExporting && (
        <div style={{ height: "2px", background: "#111" }}>
          <div
            style={{
              height: "100%",
              width: `${exportProgress}%`,
              background: "#E8620E",
              transition: "width 300ms ease",
            }}
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
            className="absolute inset-0 pointer-events-none"
            style={{
              zIndex: 50,
              animation: "split-flash 300ms ease-out forwards",
            }}
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
            <div className="relative overflow-x-auto" style={{ height: "22px", background: "#0d0d0d" }}>
              <div style={{ width: `${100 * timelineZoom}%`, position: "relative", height: "100%" }}>
                {segments.map((seg, i) => {
                  const leftPct = (seg.start_s / durationS) * 100;
                  const widthPct = ((seg.end_s - seg.start_s) / durationS) * 100;
                  const isSelected = seg.id === selectedSegmentId;
                  const isDeleting = seg.id === deletingId;

                  const isDragging = dragSegIdx === i;

                  return (
                    <div
                      key={seg.id}
                      draggable
                      onDragStart={() => setDragSegIdx(i)}
                      onDragOver={(e) => { e.preventDefault(); }}
                      onDrop={() => { if (dragSegIdx !== null && dragSegIdx !== i) moveSegment(dragSegIdx, i); setDragSegIdx(null); }}
                      onDragEnd={() => setDragSegIdx(null)}
                      className="absolute top-0 h-full flex items-center justify-center cursor-pointer"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        background: isSelected ? "rgba(232, 98, 14, 0.12)" : i % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                        borderRight: "1px solid #1a1a1a",
                        fontSize: "9px",
                        fontFamily: "'JetBrains Mono', monospace",
                        color: isSelected ? "#E8620E" : "#444",
                        transition: "all 150ms",
                        animation: isDeleting ? "segment-delete 200ms ease-out forwards" : undefined,
                        transformOrigin: "center",
                        boxShadow: isDragging ? "0 0 8px 2px rgba(232, 98, 14, 0.6)" : undefined,
                        border: isDragging ? "1px solid rgba(232, 98, 14, 0.8)" : undefined,
                        opacity: isDragging ? 0.7 : 1,
                      }}
                      onClick={() => selectSegmentById(seg.id)}
                    >
                      {(seg.end_s - seg.start_s).toFixed(1)}s
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Transition picker row between segments */}
          {segments.length > 1 && (
            <div className="relative overflow-x-auto" style={{ height: "28px", background: "#080808" }}>
              <div style={{ width: `${100 * timelineZoom}%`, position: "relative", height: "100%" }}>
                {segments.map((seg, i) => {
                  if (i === segments.length - 1) return null;
                  const nextSeg = segments[i + 1];
                  // Position the transition picker at the boundary
                  const boundaryPct = (seg.end_s / durationS) * 100;
                  return (
                    <div
                      key={`trans-${seg.id}`}
                      className="absolute flex items-center justify-center"
                      style={{
                        left: `${boundaryPct}%`,
                        transform: "translateX(-50%)",
                        height: "100%",
                        zIndex: 20,
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
                        style={{
                          fontSize: "9px",
                          fontFamily: "'JetBrains Mono', monospace",
                          background: "#151515",
                          color: "#888",
                          border: "1px solid #222",
                          borderRadius: "3px",
                          padding: "2px 4px",
                          cursor: "pointer",
                          maxWidth: "70px",
                        }}
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
      <div
        className="flex items-center justify-center gap-4 px-3"
        style={{
          height: "24px",
          background: "#0d0d0d",
          borderTop: "1px solid #151515",
        }}
      >
        {[
          ["Space", "Play"],
          ["S", "Split"],
          ["\u232B", "Delete"],
          ["\u2318Z", "Undo"],
          ["\u2190\u2192", "Step"],
          ["B", "Beats"],
          ["/", "AI"],
        ].map(([key, label]) => (
          <span key={key} style={{ fontSize: "9px", color: "#333", fontFamily: "'JetBrains Mono', monospace" }}>
            <span style={{ color: "#444", background: "#1a1a1a", padding: "1px 4px", borderRadius: "2px", marginRight: "3px" }}>
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
      style={{
        width: "32px",
        height: "28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        borderRadius: "4px",
        color: disabled ? "#2a2a2a" : accent ? "#E8620E" : "#888",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 100ms",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
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
  const f = Math.floor((seconds % 1) * 30); // frame number at 30fps
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}
