import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import type { GeneratedAnimation } from "./animation-generator";

const execFileAsync = promisify(execFile);

export interface RenderedAnimation {
  timestamp_s: number;
  duration_s: number;
  type: string;
  filePath: string;
}

/**
 * Render generated Remotion components to MP4 files.
 * Writes each component to a temp directory and renders via Remotion CLI.
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
      const outputPath = await renderSingleAnimation(
        anim, i, outputDir, fps, width, height
      );
      rendered.push({
        timestamp_s: anim.timestamp_s,
        duration_s: anim.duration_s,
        type: anim.type,
        filePath: outputPath,
      });
    } catch (err) {
      console.error(`Failed to render animation ${i}:`, err);
      // Skip failed animations — graceful degradation
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

  const durationFrames = Math.round(animation.duration_s * fps);
  const outputPath = path.join(outputDir, `animation-${String(index + 1).padStart(2, "0")}.mp4`);

  // Write the component file — wrap in a default export to ensure consistent import
  const componentPath = path.join(animDir, "Animation.tsx");
  const wrappedCode = `import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

const AnimComponent = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const slideUp = spring({ frame, fps, config: { stiffness: 200, damping: 20 } });

  return (
    <AbsoluteFill style={{
      backgroundColor: '#111',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <div style={{
        fontSize: 64,
        fontWeight: 700,
        color: '${animation.props?.primaryColor || "#E8620E"}',
        opacity,
        transform: \`translateY(\${(1 - slideUp) * 40}px)\`,
        padding: '0 80px',
        textAlign: 'center',
        fontFamily: 'sans-serif',
      }}>
        ${JSON.stringify(animation.props?.text || animation.type || "ClipMind")}
      </div>
    </AbsoluteFill>
  );
};

export default AnimComponent;
`;
  await fs.writeFile(componentPath, wrappedCode, "utf-8");

  // Write the Remotion entry point
  const entryPath = path.join(animDir, "index.tsx");
  await fs.writeFile(
    entryPath,
    `import { registerRoot, Composition } from 'remotion';
import AnimComponent from './Animation';

const Root = () => (
  <Composition
    id="Animation"
    component={AnimComponent}
    durationInFrames={${durationFrames}}
    fps={${fps}}
    width={${width}}
    height={${height}}
  />
);

registerRoot(Root);
`,
    "utf-8"
  );

  // Write tsconfig for the animation
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

  // Render via Remotion CLI — use the project's node_modules binary
  const projectRoot = path.resolve(process.cwd());
  const remotionBin = path.join(projectRoot, "node_modules", ".bin", "remotion");

  try {
    await execFileAsync(remotionBin, [
      "render",
      entryPath,
      "Animation",
      outputPath,
      "--codec", "h264",
      "--crf", "18",
    ], {
      timeout: 120000,
      cwd: animDir,
      env: { ...process.env, NODE_PATH: path.join(projectRoot, "node_modules") },
    });
  } catch (err: any) {
    throw new Error(`Remotion render failed: ${err.stderr || err.message}`);
  }

  return outputPath;
}

/**
 * Clean up rendered animation files.
 */
export async function cleanupAnimations(outputDir: string): Promise<void> {
  await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
}
