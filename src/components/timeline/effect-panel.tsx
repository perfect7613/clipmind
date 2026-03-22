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
      className="absolute top-0 right-0 h-full overflow-y-auto"
      style={{
        width: "260px",
        background: "#111111",
        borderLeft: "1px solid #1a1a1a",
        zIndex: 30,
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
            className="text-xs uppercase tracking-widest"
            style={{ color: "#666", fontFamily: "system-ui" }}
          >
            Segment FX
          </span>
          <span
            className="text-xs"
            style={{ color: "#E8620E", fontFamily: "'JetBrains Mono', monospace" }}
          >
            {selectedSegment.start_s.toFixed(1)}s - {selectedSegment.end_s.toFixed(1)}s
          </span>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "#1f1f1f" }} />

        {/* Color Profile — Visual swatches */}
        <div className="space-y-2">
          <label
            className="text-xs uppercase tracking-wider block"
            style={{ color: "#555", fontFamily: "system-ui" }}
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
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "4px",
                    background: p.color,
                    border: isActive ? "2px solid #E8620E" : "2px solid transparent",
                    opacity: isActive ? 1 : 0.5,
                    transition: "all 150ms ease",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "10px",
                    color: "#fff",
                    fontFamily: "system-ui",
                    fontWeight: 600,
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Toggle Effects — Compact grid */}
        <div className="space-y-2">
          <label
            className="text-xs uppercase tracking-wider block"
            style={{ color: "#555", fontFamily: "system-ui" }}
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
                className="text-xs uppercase tracking-wider"
                style={{ color: "#555", fontFamily: "system-ui" }}
              >
                Speed
              </label>
              <span
                className="text-xs"
                style={{ color: "#E8620E", fontFamily: "'JetBrains Mono', monospace" }}
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
              className="w-full"
              style={{ accentColor: "#E8620E" }}
            />
          </div>
        )}

        {/* Transition — Visual icons */}
        <div className="space-y-2">
          <label
            className="text-xs uppercase tracking-wider block"
            style={{ color: "#555", fontFamily: "system-ui" }}
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
                  style={{
                    padding: "6px 8px",
                    borderRadius: "4px",
                    background: isActive ? "rgba(232, 98, 14, 0.15)" : "rgba(255,255,255,0.03)",
                    border: isActive ? "1px solid rgba(232, 98, 14, 0.5)" : "1px solid #1f1f1f",
                    color: isActive ? "#E8620E" : "#666",
                    cursor: "pointer",
                    transition: "all 150ms ease",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "11px",
                    fontFamily: "system-ui",
                  }}
                >
                  <span style={{ fontSize: "14px" }}>{t.icon}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* Captions / Subtitles */}
        <div style={{ height: "1px", background: "#1f1f1f" }} />

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider block" style={{ color: "#555", fontFamily: "system-ui" }}>
            Captions
          </label>

          {/* Enable/disable */}
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
            {(["top", "center", "bottom"] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => updateEffects({ captions: { ...selectedSegment?.effects.captions!, position: pos } } as any)}
                style={{
                  flex: 1,
                  padding: "4px",
                  fontSize: "9px",
                  fontFamily: "'JetBrains Mono', monospace",
                  background: selectedSegment?.effects.captions?.position === pos ? "rgba(232,98,14,0.15)" : "rgba(255,255,255,0.03)",
                  border: selectedSegment?.effects.captions?.position === pos ? "1px solid rgba(232,98,14,0.5)" : "1px solid #1f1f1f",
                  color: selectedSegment?.effects.captions?.position === pos ? "#E8620E" : "#666",
                  borderRadius: "3px",
                  cursor: "pointer",
                  transition: "all 150ms",
                  textTransform: "capitalize",
                }}
              >
                {pos}
              </button>
            ))}
          </div>

          {/* Size */}
          <div className="flex gap-1">
            {(["small", "medium", "large"] as const).map((sz) => (
              <button
                key={sz}
                onClick={() => updateEffects({ captions: { ...selectedSegment?.effects.captions!, fontSize: sz } } as any)}
                style={{
                  flex: 1,
                  padding: "4px",
                  fontSize: "9px",
                  fontFamily: "'JetBrains Mono', monospace",
                  background: selectedSegment?.effects.captions?.fontSize === sz ? "rgba(232,98,14,0.15)" : "rgba(255,255,255,0.03)",
                  border: selectedSegment?.effects.captions?.fontSize === sz ? "1px solid rgba(232,98,14,0.5)" : "1px solid #1f1f1f",
                  color: selectedSegment?.effects.captions?.fontSize === sz ? "#E8620E" : "#666",
                  borderRadius: "3px",
                  cursor: "pointer",
                  transition: "all 150ms",
                  textTransform: "capitalize",
                }}
              >
                {sz}
              </button>
            ))}
          </div>

          {/* Background style */}
          <div className="flex gap-1">
            {([
              { id: "dark-bar", label: "Bar" },
              { id: "pill", label: "Pill" },
              { id: "none", label: "None" },
            ] as const).map((bg) => (
              <button
                key={bg.id}
                onClick={() => updateEffects({ captions: { ...selectedSegment?.effects.captions!, background: bg.id } } as any)}
                style={{
                  flex: 1,
                  padding: "4px",
                  fontSize: "9px",
                  fontFamily: "'JetBrains Mono', monospace",
                  background: selectedSegment?.effects.captions?.background === bg.id ? "rgba(232,98,14,0.15)" : "rgba(255,255,255,0.03)",
                  border: selectedSegment?.effects.captions?.background === bg.id ? "1px solid rgba(232,98,14,0.5)" : "1px solid #1f1f1f",
                  color: selectedSegment?.effects.captions?.background === bg.id ? "#E8620E" : "#666",
                  borderRadius: "3px",
                  cursor: "pointer",
                  transition: "all 150ms",
                }}
              >
                {bg.label}
              </button>
            ))}
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
      style={{
        padding: "6px 8px",
        borderRadius: "4px",
        background: active ? "rgba(232, 98, 14, 0.12)" : "rgba(255,255,255,0.03)",
        border: active ? "1px solid rgba(232, 98, 14, 0.4)" : "1px solid #1f1f1f",
        color: active ? "#E8620E" : "#555",
        cursor: "pointer",
        transition: "all 150ms ease",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "11px",
        fontFamily: "system-ui",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: active ? "#E8620E" : "#333",
          flexShrink: 0,
        }}
      />
      {label}
    </button>
  );
}
