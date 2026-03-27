import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const MEDIA_JOBS = [
  {
    label: "hero",
    mp4Path: path.join(projectRoot, "public/video/hero.mp4"),
    rewriteMp4: false,
    webmPath: path.join(projectRoot, "public/video/hero.webm"),
    maxMb: 5,
    width: 854,
    fps: "25",
    mp4Crf: 24,
    webmCrf: 38,
    keyframeInterval: 50,
  },
  {
    label: "about",
    mp4Path: path.join(projectRoot, "public/videos/about.mp4"),
    rewriteMp4: true,
    webmPath: path.join(projectRoot, "public/videos/about.webm"),
    maxMb: 3,
    width: 960,
    fps: "24000/1001",
    mp4Crf: 29,
    webmCrf: 39,
    keyframeInterval: 48,
  },
  {
    label: "grill-show",
    mp4Path: path.join(projectRoot, "public/video/grill-show.mp4"),
    rewriteMp4: true,
    webmPath: path.join(projectRoot, "public/video/grill-show.webm"),
    maxMb: 3,
    width: 420,
    fps: "30",
    mp4Crf: 35,
    webmCrf: 42,
    keyframeInterval: 60,
  },
];

function hasCommand(command) {
  const result = spawnSync("which", [command], { stdio: "pipe", encoding: "utf8" });
  return result.status === 0;
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function fileSizeLabel(filePath) {
  const size = fs.statSync(filePath).size / (1024 * 1024);
  return `${size.toFixed(2)} MB`;
}

function fileSizeMb(filePath) {
  return fs.statSync(filePath).size / (1024 * 1024);
}

function isNewer(sourcePath, targetPath) {
  if (!fs.existsSync(targetPath)) {
    return false;
  }
  return fs.statSync(targetPath).mtimeMs >= fs.statSync(sourcePath).mtimeMs;
}

function buildVideoFilter(width, fps) {
  return `scale='min(${width},iw)':-2:flags=lanczos,fps=${fps}`;
}

function optimizeMp4(job) {
  if (!job.rewriteMp4) {
    return;
  }
  if (process.env.FORCE_VIDEO_OPTIMIZE !== "1" && fileSizeMb(job.mp4Path) <= job.maxMb) {
    return;
  }

  const tempOutput = `${job.mp4Path}.tmp.mp4`;
  run(
    "ffmpeg",
    [
      "-y",
      "-i",
      job.mp4Path,
      "-map_metadata",
      "-1",
      "-an",
      "-vf",
      buildVideoFilter(job.width, job.fps),
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-profile:v",
      "main",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-crf",
      String(job.mp4Crf),
      "-g",
      String(job.keyframeInterval),
      "-keyint_min",
      String(job.keyframeInterval),
      "-sc_threshold",
      "0",
      "-r",
      job.fps,
      tempOutput,
    ],
    `${job.label} mp4 optimization`,
  );

  fs.renameSync(tempOutput, job.mp4Path);
}

function optimizeWebm(job) {
  if (process.env.FORCE_VIDEO_OPTIMIZE !== "1" && isNewer(job.mp4Path, job.webmPath)) {
    return;
  }

  run(
    "ffmpeg",
    [
      "-y",
      "-i",
      job.mp4Path,
      "-map_metadata",
      "-1",
      "-an",
      "-vf",
      buildVideoFilter(job.width, job.fps),
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuv420p",
      "-b:v",
      "0",
      "-crf",
      String(job.webmCrf),
      "-row-mt",
      "1",
      "-tile-columns",
      "2",
      "-frame-parallel",
      "0",
      "-auto-alt-ref",
      "1",
      "-lag-in-frames",
      "25",
      "-g",
      String(job.keyframeInterval),
      "-r",
      job.fps,
      job.webmPath,
    ],
    `${job.label} webm optimization`,
  );
}

function main() {
  if (!hasCommand("ffmpeg")) {
    const missing = MEDIA_JOBS.filter((job) => !fs.existsSync(job.webmPath));
    if (missing.length > 0) {
      throw new Error("ffmpeg is required to build missing optimized video variants");
    }
    console.warn("[optimize-videos] ffmpeg not found; using existing media variants");
    return;
  }

  for (const job of MEDIA_JOBS) {
    if (!fs.existsSync(job.mp4Path)) {
      throw new Error(`Missing source video: ${job.mp4Path}`);
    }

    optimizeMp4(job);
    optimizeWebm(job);

    console.log(
      `[optimize-videos] ${job.label}: mp4=${fileSizeLabel(job.mp4Path)} webm=${fileSizeLabel(job.webmPath)}`,
    );
  }
}

main();
