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

// Cache the bundle location — only bundle once
let bundleLocation: string | null = null;

async function getBundleLocation(): Promise<string> {
  if (bundleLocation) return bundleLocation;

  const entryPoint = path.resolve(process.cwd(), "remotion/index.ts");

  // Check if entry exists
  try {
    await fs.access(entryPoint);
  } catch {
    throw new Error(`Remotion entry point not found: ${entryPoint}`);
  }

  console.log("[Remotion] Bundling project...");
  bundleLocation = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });
  console.log("[Remotion] Bundle ready:", bundleLocation);

  return bundleLocation;
}

/**
 * Map animation types to Remotion composition IDs.
 */
function getCompositionId(type: string): string {
  switch (type) {
    case "text_card":
      return "TextCard";
    case "animated_counter":
      return "AnimatedCounter";
    case "list_builder":
    case "building_flowchart":
      return "ListBuilder";
    default:
      return "TextCard"; // fallback
  }
}

/**
 * Build input props for a Remotion composition from animation data.
 */
function buildInputProps(animation: GeneratedAnimation): Record<string, unknown> {
  const baseProps = {
    primaryColor: animation.props?.primaryColor || "#E8620E",
    bgColor: animation.props?.bgColor || "#111",
    fontFamily: animation.props?.fontFamily || "sans-serif",
  };

  switch (animation.type) {
    case "text_card":
      return { ...baseProps, text: animation.props?.text || animation.props?.content || "Key Point" };
    case "animated_counter":
      return {
        ...baseProps,
        value: Number(animation.props?.value) || 100,
        label: animation.props?.label || animation.props?.text || "Count",
      };
    case "list_builder":
    case "building_flowchart":
      return {
        ...baseProps,
        items: animation.props?.items || [animation.props?.text || "Point 1"],
        title: animation.props?.title || "Key Points",
      };
    default:
      return { ...baseProps, text: animation.props?.text || "ClipMind" };
  }
}

/**
 * Render animations using Remotion's programmatic API.
 * Bundles once, then renders each animation as a separate composition.
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

  // Bundle the Remotion project (cached after first call)
  const serveUrl = await getBundleLocation();

  const rendered: RenderedAnimation[] = [];

  for (let i = 0; i < animations.length; i++) {
    const anim = animations[i];
    const outputPath = path.join(outputDir, `animation-${String(i + 1).padStart(2, "0")}.mp4`);
    const compositionId = getCompositionId(anim.type);
    const inputProps = buildInputProps(anim);
    const durationInFrames = Math.max(30, Math.round(anim.duration_s * fps));

    try {
      console.log(`[Remotion] Rendering ${compositionId} (${anim.duration_s}s) → ${outputPath}`);

      const composition = await selectComposition({
        serveUrl,
        id: compositionId,
        inputProps,
      });

      // Override duration from the animation spec
      await renderMedia({
        composition: { ...composition, durationInFrames },
        serveUrl,
        codec: "h264",
        outputLocation: outputPath,
        inputProps,
      });

      rendered.push({
        timestamp_s: anim.timestamp_s,
        duration_s: anim.duration_s,
        type: anim.type,
        filePath: outputPath,
      });

      console.log(`[Remotion] Done: ${outputPath}`);
    } catch (err) {
      console.error(`[Remotion] Failed to render animation ${i}:`, err);
      // Skip failed animations — graceful degradation
    }
  }

  return rendered;
}

/**
 * Clean up rendered animation files.
 */
export async function cleanupAnimations(outputDir: string): Promise<void> {
  await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
}
