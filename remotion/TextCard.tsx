import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const TextCard: React.FC<{
  text: string;
  primaryColor: string;
  bgColor: string;
  fontFamily: string;
}> = ({ text, primaryColor = "#E8620E", bgColor = "#111", fontFamily = "sans-serif" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const slideUp = spring({ frame, fps, config: { stiffness: 200, damping: 20 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bgColor,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontSize: 64,
          fontWeight: 700,
          color: primaryColor,
          opacity,
          transform: `translateY(${(1 - slideUp) * 40}px)`,
          padding: "0 80px",
          textAlign: "center",
          fontFamily,
          maxWidth: "80%",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
