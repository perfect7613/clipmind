"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ThumbnailStrip } from "./thumbnail-strip";
import { WaveformTrack } from "./waveform-track";
import { EffectPanel } from "./effect-panel";
import { useTimelineStore } from "./timeline-store";

interface TimelineEditorProps {
  clipId: string;
  videoSrc: string;
}

export function TimelineEditor({ clipId, videoSrc }: TimelineEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const {
    durationS,
    cutPoints,
    effects,
    isModified,
    isExporting,
    exportProgress,
    loadTimeline,
    setExporting,
  } = useTimelineStore();

  // Load timeline data
  useEffect(() => {
    fetch(`/api/clips/${clipId}/timeline`)
      .then((r) => r.json())
      .then((data) => loadTimeline(clipId, data))
      .catch(() => {});
  }, [clipId, loadTimeline]);

  // Sync video time with state
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

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

  // Export: save timeline + trigger re-render
  const handleExport = async () => {
    if (!isModified) return;
    setExporting(true, 0);

    try {
      // Save timeline state
      await fetch(`/api/clips/${clipId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeline: { cutPoints, effects, zoomEvents: [], speedRamps: [] },
        }),
      });

      setExporting(true, 20);

      // Trigger re-render via SSE
      const response = await fetch(`/api/clips/${clipId}/re-render`, { method: "POST" });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split("\n").filter((l) => l.startsWith("data: "));
          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.pct) setExporting(true, data.pct);
              if (data.step === "completed") {
                setExporting(false);
                // Refresh video source
                if (videoRef.current) {
                  videoRef.current.src = videoSrc + "?t=" + Date.now();
                  videoRef.current.load();
                }
              }
              if (data.step === "failed") {
                setExporting(false);
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Video Player */}
      <div className="relative bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          src={videoSrc}
          className="w-full aspect-video"
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setCurrentTime(0);
            }
          }}
        />

        {/* Play/Pause overlay */}
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors"
        >
          {!isPlaying && (
            <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-white fill-current ml-1">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
          )}
        </button>
      </div>

      {/* Time display */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>{formatTime(currentTime)}</span>
        <div className="flex items-center gap-2">
          {isModified && <Badge variant="outline" className="text-xs">Unsaved changes</Badge>}
          <span>{formatTime(durationS)}</span>
        </div>
      </div>

      {/* Thumbnail Strip */}
      <ThumbnailStrip
        clipId={clipId}
        durationS={durationS}
        currentTime={currentTime}
        onSeek={handleSeek}
      />

      {/* Waveform */}
      <WaveformTrack
        clipId={clipId}
        durationS={durationS}
        currentTime={currentTime}
        onSeek={handleSeek}
        cutPoints={cutPoints}
      />

      {/* Effects Panel */}
      <EffectPanel />

      {/* Export Bar */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleExport}
          disabled={!isModified || isExporting}
          className="flex-1"
        >
          {isExporting ? "Exporting..." : isModified ? "Export Changes" : "No Changes"}
        </Button>
        {isExporting && (
          <div className="flex-1">
            <Progress value={exportProgress} />
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
