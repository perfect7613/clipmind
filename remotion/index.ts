import { registerRoot, Composition } from "remotion";
import React from "react";
import { TextCard } from "./TextCard";
import { AnimatedCounter } from "./AnimatedCounter";
import { ListBuilder } from "./ListBuilder";

const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TextCard"
        component={TextCard}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          text: "Sample Text",
          primaryColor: "#E8620E",
          bgColor: "#111",
          fontFamily: "sans-serif",
        }}
      />
      <Composition
        id="AnimatedCounter"
        component={AnimatedCounter}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          value: 1000,
          label: "Total Views",
          primaryColor: "#E8620E",
          bgColor: "#111",
        }}
      />
      <Composition
        id="ListBuilder"
        component={ListBuilder}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          items: ["Item 1", "Item 2", "Item 3"],
          title: "Key Points",
          primaryColor: "#E8620E",
          bgColor: "#111",
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
