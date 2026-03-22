"use client";

import { useTimelineStore } from "./timeline-store";

const COLOR_PROFILES: Array<{ id: string; label: string; color: string }> = [
  { id: "warm", label: "W", color: "#D4722A" },
  { id: "neutral", label: "N", color: "#888888" },
  { id: "cool", label: "C", color: "#4A8EBF" },
  { id: "cinematic", label: "Ci", color: "#2A5A3A" },
  { id: "flat", label: "Fl", color: "#AAAAAA" },
];

const TRANSITION_TYPES: Array<{ id: string; label: string; icon: string }> = [
  { id: "crossfade", label: "X-Fade", icon: "\u2B1C" },
  { id: "dip-to-black", label: "Dip", icon: "\u25A0" },
  { id: "wipe-left", label: "Wipe", icon: "\u25B6" },
  { id: "fade", label: "Fade", icon: "\u25D2" },
];

interface EffectPanelProps {
  visible: boolean;
}

export function EffectPanel({ visible }: EffectPanelProps) {
  const { effects, updateEffects, selectedSegmentId, segments } = useTimelineStore();

  const selectedSegment = segments.find((s) => s.id === selectedSegmentId);

  if (!visible || !selectedSegment) return null;

  return (
    <div
      className="absolute top-0 right-0 h-full overflow-y-auto bg-zinc-900 border-l border-zinc-700 z-30"
      style={{
        width: "260px",
        animation: "slideInRight 200ms ease-out",
      }}
    >
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      <div className="p-4 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span
            className="text-xs uppercase tracking-[0.1em] text-zinc-500 font-medium"
            style={{ fontFamily: "'Geist Sans', sans-serif" }}
          >
            Segment FX
          </span>
          <span
            className="text-xs text-orange-500"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            {selectedSegment.start_s.toFixed(1)}s - {selectedSegment.end_s.toFixed(1)}s
          </span>
        </div>

        {/* Divider */}
        <div className="h-px bg-zinc-800" />

        {/* Color Profile — Round swatches */}
        <div className="space-y-2">
          <label
            className="text-xs uppercase tracking-[0.1em] text-zinc-500 font-medium block"
            style={{ fontFamily: "'Geist Sans', sans-serif" }}
          >
            Color Grade
          </label>
          <div className="flex gap-2">
            {COLOR_PROFILES.map((p) => {
              const isActive = selectedSegment?.effects.colorProfile === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => updateEffects({ colorProfile: p.id })}
                  title={p.id}
                  className="flex items-center justify-center cursor-pointer transition-all duration-150 hover:scale-110"
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: p.color,
                    border: "none",
                    outline: "none",
                    boxShadow: isActive ? "0 0 0 2px #09090b, 0 0 0 4px #f97316" : "none",
                    opacity: isActive ? 1 : 0.5,
                    fontSize: "9px",
                    color: "#fff",
                    fontWeight: 600,
                    fontFamily: "'Geist Sans', sans-serif",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Toggle Effects */}
        <div className="space-y-2">
          <label
            className="text-xs uppercase tracking-[0.1em] text-zinc-500 font-medium block"
            style={{ fontFamily: "'Geist Sans', sans-serif" }}
          >
            Effects
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <CompactToggle
              label="Vignette"
              active={selectedSegment?.effects.vignette ?? false}
              onToggle={() => updateEffects({ vignette: !selectedSegment?.effects.vignette })}
            />
            <CompactToggle
              label="Film Grain"
              active={selectedSegment?.effects.filmGrain ?? false}
              onToggle={() => updateEffects({ filmGrain: !selectedSegment?.effects.filmGrain })}
            />
            <CompactToggle
              label="Zoom"
              active={selectedSegment?.effects.zoom ?? false}
              onToggle={() => updateEffects({ zoom: !selectedSegment?.effects.zoom })}
            />
            <CompactToggle
              label="Speed"
              active={selectedSegment?.effects.speedRamp ?? false}
              onToggle={() => updateEffects({ speedRamp: !selectedSegment?.effects.speedRamp })}
            />
          </div>
        </div>

        {/* Speed slider (when enabled) */}
        {selectedSegment?.effects.speedRamp && (
          <div className="space-y-1">
            <div className="flex justify-between">
              <label
                className="text-xs uppercase tracking-[0.1em] text-zinc-500 font-medium"
                style={{ fontFamily: "'Geist Sans', sans-serif" }}
              >
                Speed
              </label>
              <span
                className="text-xs text-orange-500"
                style={{ fontFamily: "'Geist Mono', monospace" }}
              >
                {selectedSegment?.effects.speedFactor.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={selectedSegment?.effects.speedFactor ?? 1.0}
              onChange={(e) => updateEffects({ speedFactor: parseFloat(e.target.value) })}
              className="w-full accent-orange-500"
            />
          </div>
        )}

        {/* Transition */}
        <div className="space-y-2">
          <label
            className="text-xs uppercase tracking-[0.1em] text-zinc-500 font-medium block"
            style={{ fontFamily: "'Geist Sans', sans-serif" }}
          >
            Transition
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {TRANSITION_TYPES.map((t) => {
              const isActive = selectedSegment?.effects.transitionType === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => updateEffects({ transitionType: t.id })}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] border cursor-pointer transition-all duration-150 hover:scale-[1.02] ${
                    isActive
                      ? "bg-orange-500/15 border-orange-500/50 text-orange-500"
                      : "bg-white/[0.03] border-zinc-800 text-zinc-500 hover:border-zinc-700"
                  }`}
                  style={{ fontFamily: "'Geist Sans', sans-serif" }}
                >
                  <span className="text-sm">{t.icon}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-zinc-800" />

        {/* Captions */}
        <div className="space-y-2">
          <label
            className="text-xs uppercase tracking-[0.1em] text-zinc-500 font-medium block"
            style={{ fontFamily: "'Geist Sans', sans-serif" }}
          >
            Captions
          </label>

          <CompactToggle
            label="Show Captions"
            active={selectedSegment?.effects.captions?.enabled !== false}
            onToggle={() => {
              const current = selectedSegment?.effects.captions?.enabled !== false;
              updateEffects({ captions: { ...selectedSegment?.effects.captions!, enabled: !current } } as any);
            }}
          />

          {/* Position */}
          <div className="flex gap-1">
            {(["top", "center", "bottom"] as const).map((pos) => {
              const isActive = selectedSegment?.effects.captions?.position === pos;
              return (
                <button
                  key={pos}
                  onClick={() => updateEffects({ captions: { ...selectedSegment?.effects.captions!, position: pos } } as any)}
                  className={`flex-1 py-1 text-[9px] capitalize rounded border cursor-pointer transition-all duration-150 ${
                    isActive
                      ? "bg-orange-500/15 border-orange-500/50 text-orange-500"
                      : "bg-white/[0.03] border-zinc-800 text-zinc-500"
                  }`}
                  style={{ fontFamily: "'Geist Mono', monospace" }}
                >
                  {pos}
                </button>
              );
            })}
          </div>

          {/* Size */}
          <div className="flex gap-1">
            {(["small", "medium", "large"] as const).map((sz) => {
              const isActive = selectedSegment?.effects.captions?.fontSize === sz;
              return (
                <button
                  key={sz}
                  onClick={() => updateEffects({ captions: { ...selectedSegment?.effects.captions!, fontSize: sz } } as any)}
                  className={`flex-1 py-1 text-[9px] capitalize rounded border cursor-pointer transition-all duration-150 ${
                    isActive
                      ? "bg-orange-500/15 border-orange-500/50 text-orange-500"
                      : "bg-white/[0.03] border-zinc-800 text-zinc-500"
                  }`}
                  style={{ fontFamily: "'Geist Mono', monospace" }}
                >
                  {sz}
                </button>
              );
            })}
          </div>

          {/* Background style */}
          <div className="flex gap-1">
            {([
              { id: "dark-bar", label: "Bar" },
              { id: "pill", label: "Pill" },
              { id: "none", label: "None" },
            ] as const).map((bg) => {
              const isActive = selectedSegment?.effects.captions?.background === bg.id;
              return (
                <button
                  key={bg.id}
                  onClick={() => updateEffects({ captions: { ...selectedSegment?.effects.captions!, background: bg.id } } as any)}
                  className={`flex-1 py-1 text-[9px] rounded border cursor-pointer transition-all duration-150 ${
                    isActive
                      ? "bg-orange-500/15 border-orange-500/50 text-orange-500"
                      : "bg-white/[0.03] border-zinc-800 text-zinc-500"
                  }`}
                  style={{ fontFamily: "'Geist Mono', monospace" }}
                >
                  {bg.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[11px] border cursor-pointer transition-all duration-150 hover:scale-[1.02] ${
        active
          ? "bg-orange-500/12 border-orange-500/40 text-orange-500"
          : "bg-white/[0.03] border-zinc-800 text-zinc-500 hover:border-zinc-700"
      }`}
      style={{ fontFamily: "'Geist Sans', sans-serif" }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          active ? "bg-orange-500" : "bg-zinc-700"
        }`}
      />
      {label}
    </button>
  );
}
