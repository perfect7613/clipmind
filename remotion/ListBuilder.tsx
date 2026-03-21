import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const ListBuilder: React.FC<{
  items: string[];
  title: string;
  primaryColor: string;
  bgColor: string;
}> = ({ items, title, primaryColor = "#E8620E", bgColor = "#111" }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const framesPerItem = Math.floor(durationInFrames / (items.length + 1));

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bgColor,
        justifyContent: "center",
        alignItems: "center",
        padding: "60px 100px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 900 }}>
        <div
          style={{
            fontSize: 42,
            fontWeight: 700,
            color: primaryColor,
            marginBottom: 40,
            fontFamily: "sans-serif",
            opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          {title}
        </div>
        {items.map((item, i) => {
          const itemStart = (i + 1) * framesPerItem * 0.5;
          const opacity = interpolate(frame, [itemStart, itemStart + 8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const slideX = spring({
            frame: Math.max(0, frame - itemStart),
            fps,
            config: { stiffness: 180, damping: 18 },
          });

          return (
            <div
              key={i}
              style={{
                fontSize: 30,
                color: "#eee",
                padding: "12px 0",
                borderBottom: "1px solid #333",
                opacity,
                transform: `translateX(${(1 - slideX) * 30}px)`,
                fontFamily: "sans-serif",
              }}
            >
              <span style={{ color: primaryColor, marginRight: 12 }}>{i + 1}.</span>
              {item}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
