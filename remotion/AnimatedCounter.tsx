import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const AnimatedCounter: React.FC<{
  value: number;
  label: string;
  primaryColor: string;
  bgColor: string;
}> = ({ value, label, primaryColor = "#E8620E", bgColor = "#111" }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  const countUpEnd = Math.floor(durationInFrames * 0.6);
  const currentValue = Math.round(
    interpolate(frame, [5, countUpEnd], [0, value], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  const scale = spring({ frame, fps, config: { stiffness: 100, damping: 15 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bgColor,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ textAlign: "center", opacity, transform: `scale(${scale})` }}>
        <div style={{ fontSize: 96, fontWeight: 800, color: primaryColor, fontFamily: "sans-serif" }}>
          {currentValue.toLocaleString()}
        </div>
        <div style={{ fontSize: 28, color: "#aaa", marginTop: 12, fontFamily: "sans-serif" }}>
          {label}
        </div>
      </div>
    </AbsoluteFill>
  );
};
