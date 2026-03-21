import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { GeneratedAnimation } from "./animation-generator";

export interface RenderedAnimation {
  timestamp_s: number;
  duration_s: number;
  type: string;
  filePath: string;
}

/**
 * Render Claude-generated Remotion components to MP4.
 * Each animation is:
 * 1. Written to a temp directory as a .tsx file
 * 2. Wrapped with a Remotion entry point (registerRoot + Composition)
 * 3. Bundled with @remotion/bundler
 * 4. Rendered with @remotion/renderer
 */
export async function renderAnimations(
  animations: GeneratedAnimation[],
  fps: number = 30,
  width: number = 1920,
  height: number = 1080
): Promise<RenderedAnimation[]> {
  if (animations.length === 0) return [];

  const outputDir = path.join(os.tmpdir(), `clipmind-animations-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  const rendered: RenderedAnimation[] = [];

  for (let i = 0; i < animations.length; i++) {
    const anim = animations[i];
    try {
      const outputPath = await renderSingleAnimation(anim, i, outputDir, fps, width, height);
      rendered.push({
        timestamp_s: anim.timestamp_s,
        duration_s: anim.duration_s,
        type: anim.type,
        filePath: outputPath,
      });
    } catch (err) {
      console.error(`[Remotion] Failed to render animation ${i}:`, err);
      // Graceful degradation — skip this animation
    }
  }

  return rendered;
}

async function renderSingleAnimation(
  animation: GeneratedAnimation,
  index: number,
  outputDir: string,
  fps: number,
  width: number,
  height: number
): Promise<string> {
  const animDir = path.join(outputDir, `anim-${index}`);
  await fs.mkdir(animDir, { recursive: true });

  const durationInFrames = Math.max(30, Math.round(animation.duration_s * fps));
  const outputPath = path.join(outputDir, `animation-${String(index + 1).padStart(2, "0")}.mp4`);

  // Write the generated component
  const componentPath = path.join(animDir, "Component.tsx");
  await fs.writeFile(componentPath, animation.component_code, "utf-8");

  // Write the Remotion entry point that imports the generated component
  const entryPath = path.join(animDir, "index.tsx");
  await fs.writeFile(entryPath, `
import { registerRoot, Composition } from "remotion";
import AnimComponent from "./Component";

const Root = () => (
  <Composition
    id="DynamicAnimation"
    component={AnimComponent}
    durationInFrames={${durationInFrames}}
    fps={${fps}}
    width={${width}}
    height={${height}}
  />
);

registerRoot(Root);
`, "utf-8");

  // Write tsconfig for compilation
  await fs.writeFile(
    path.join(animDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "ESNext",
        moduleResolution: "node",
        jsx: "react-jsx",
        strict: false,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      include: ["*.tsx"],
    }),
    "utf-8"
  );

  console.log(`[Remotion] Bundling animation ${index + 1}...`);

  // Bundle with Remotion's webpack bundler
  const bundleLocation = await bundle({
    entryPoint: entryPath,
    webpackOverride: (config) => config,
  });

  console.log(`[Remotion] Rendering animation ${index + 1} (${durationInFrames} frames)...`);

  // Select the composition and render
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "DynamicAnimation",
  });

  await renderMedia({
    composition: { ...composition, durationInFrames, fps, width, height },
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
  });

  console.log(`[Remotion] Done: ${outputPath}`);
  return outputPath;
}

/**
 * Clean up rendered animation files.
 */
export async function cleanupAnimations(outputDir: string): Promise<void> {
  await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
}
