"use client";

import { useTimelineStore } from "./timeline-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const COLOR_PROFILES = [
  { id: "warm", label: "Warm" },
  { id: "neutral", label: "Neutral" },
  { id: "cool", label: "Cool" },
  { id: "cinematic", label: "Cinematic" },
  { id: "flat", label: "Flat" },
];

const TRANSITION_TYPES = [
  { id: "crossfade", label: "Crossfade" },
  { id: "dip-to-black", label: "Dip to Black" },
  { id: "wipe-left", label: "Wipe Left" },
  { id: "fade", label: "Fade" },
];

export function EffectPanel() {
  const { effects, updateEffects, isModified } = useTimelineStore();

  return (
    <div className="space-y-4 p-4 bg-card rounded-lg border">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Effects</h3>
        {isModified && <Badge variant="secondary" className="text-xs">Modified</Badge>}
      </div>

      <Separator />

      {/* Color Profile */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Color Grade</label>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_PROFILES.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={effects.colorProfile === p.id ? "default" : "outline"}
              className="h-7 text-xs px-2.5"
              onClick={() => updateEffects({ colorProfile: p.id })}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Toggle Effects */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Effects</label>
        <div className="grid grid-cols-2 gap-2">
          <ToggleButton
            label="Vignette"
            active={effects.vignette}
            onToggle={() => updateEffects({ vignette: !effects.vignette })}
          />
          <ToggleButton
            label="Film Grain"
            active={effects.filmGrain}
            onToggle={() => updateEffects({ filmGrain: !effects.filmGrain })}
          />
          <ToggleButton
            label="Zoom"
            active={effects.zoom}
            onToggle={() => updateEffects({ zoom: !effects.zoom })}
          />
          <ToggleButton
            label="Speed Ramp"
            active={effects.speedRamp}
            onToggle={() => updateEffects({ speedRamp: !effects.speedRamp })}
          />
        </div>
      </div>

      {/* Transition */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transition</label>
        <div className="flex flex-wrap gap-1.5">
          {TRANSITION_TYPES.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={effects.transitionType === t.id ? "default" : "outline"}
              className="h-7 text-xs px-2.5"
              onClick={() => updateEffects({ transitionType: t.id })}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Speed Factor (when speed ramp is enabled) */}
      {effects.speedRamp && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Speed: {effects.speedFactor.toFixed(1)}x
          </label>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.1}
            value={effects.speedFactor}
            onChange={(e) => updateEffects({ speedFactor: parseFloat(e.target.value) })}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0.5x Slow</span>
            <span>1.0x</span>
            <span>2.0x Fast</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleButton({
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
      className={`text-xs px-3 py-2 rounded-md border transition-colors ${
        active
          ? "bg-primary/10 border-primary text-primary"
          : "bg-background border-border text-muted-foreground hover:border-muted-foreground"
      }`}
    >
      <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${active ? "bg-primary" : "bg-muted"}`} />
      {label}
    </button>
  );
}
