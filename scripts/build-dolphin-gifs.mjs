/**
 * Build 4.0s animated GIFs for the Notio dolphin mascot using FFmpeg.
 * Dark-UI safe: near-white still backgrounds are forced to #090D15 before animating.
 * Output: 288x216 (4:3), 12 fps = 48 frames (4.0s).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FFMPEG =
  "C:\\Users\\unti\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe";
const FFPROBE =
  "C:\\Users\\unti\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffprobe.exe";

const DIR = path.resolve("public/dolphin");
const TMP = path.join(DIR, ".gif-build");
const FPS = 12;
const DUR = 4;
const W = 288;
const H = 216;
const SW = 324;
const SH = 243;
const BG = "0x090D15";

/** Replace near-white pixels with Notio dark bg, then pad/scale. */
function darkenStill(srcName, outName) {
  const src = path.join(DIR, srcName);
  const out = path.join(TMP, outName);
  // lum > ~230 → force dark; then letterbox onto #090D15
  const vf =
    `format=rgb24,` +
    `geq=r='if(gt((r(X,Y)+g(X,Y)+b(X,Y))/3,230),9,r(X,Y))':` +
    `g='if(gt((r(X,Y)+g(X,Y)+b(X,Y))/3,230),13,g(X,Y))':` +
    `b='if(gt((r(X,Y)+g(X,Y)+b(X,Y))/3,230),21,b(X,Y))',` +
    `scale=${SW}:${SH}:force_original_aspect_ratio=decrease:flags=lanczos,` +
    `pad=${SW}:${SH}:(ow-iw)/2:(oh-ih)/2:${BG}`;
  execFileSync(FFMPEG, ["-y", "-i", src, "-vf", vf, "-frames:v", "1", out], {
    stdio: "pipe",
  });
  return out;
}

fs.mkdirSync(TMP, { recursive: true });

const stills = {
  welcome: darkenStill("welcome.jpg", "welcome.png"),
  happy: darkenStill("happy.jpg", "happy.png"),
  levelUp: darkenStill("level-up.jpg", "level-up.png"),
  reassuring: darkenStill("reassuring.jpg", "reassuring.png"),
  listening: darkenStill("listening.jpg", "listening.png"),
  thinking: darkenStill("thinking.jpg", "thinking.png"),
  companion: darkenStill("companion.png", "companion.png"),
};

const PAL = `fps=${FPS},split[s0][s1];[s0]palettegen=max_colors=64:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;

const CLIPS = [
  {
    out: "welcome.gif",
    inputs: [stills.welcome],
    filter: `[0:v]crop=w=${W}:h=${H}:x='(iw-ow)/2+5*sin(2*PI*t/4)':y='(ih-oh)/2+8*sin(2*PI*t/2)',${PAL}`,
  },
  {
    out: "welcome-student.gif",
    inputs: [stills.welcome, stills.happy, stills.levelUp],
    filter:
      `[0:v]crop=${W}:${H}:'(iw-ow)/2':'(ih-oh)/2+9*sin(2*PI*t/1.33)',fps=${FPS}[w];` +
      `[1:v]crop=${W}:${H}:'(iw-ow)/2+6*sin(2*PI*t/2)':'(ih-oh)/2-9*abs(sin(2*PI*t/1.33))',fps=${FPS}[h];` +
      `[2:v]crop=${W}:${H}:'(iw-ow)/2':'(ih-oh)/2-6*sin(2*PI*t/2)',fps=${FPS}[l];` +
      `[w][h]blend=all_expr='if(between(T,0.7,2.3),B,A)'[wh];` +
      `[wh][l]blend=all_expr='if(between(T,2.0,3.3),B,A)',${PAL}`,
  },
  {
    out: "welcome-other.gif",
    inputs: [stills.welcome, stills.reassuring],
    filter:
      `[0:v]crop=${W}:${H}:'(iw-ow)/2+5*sin(2*PI*t/4)':'(ih-oh)/2+6*sin(2*PI*t/2)',fps=${FPS}[w];` +
      `[1:v]crop=${W}:${H}:'(iw-ow)/2-5*sin(2*PI*t/4)':'(ih-oh)/2+7*sin(2*PI*t/2)',fps=${FPS}[r];` +
      `[w][r]blend=all_expr='if(between(T,0.8,3.2),B,A)',${PAL}`,
  },
  {
    out: "calm.gif",
    inputs: [stills.companion],
    filter: `[0:v]crop=w=${W}:h=${H}:x='(iw-ow)/2+4*sin(2*PI*t/4)':y='(ih-oh)/2+6*sin(2*PI*t/4)',${PAL}`,
  },
  {
    // Listening uses only black-bg listening still — never blend white welcome.jpg
    out: "listening.gif",
    inputs: [stills.listening],
    filter: `[0:v]crop=w=${W}:h=${H}:x='(iw-ow)/2-7+7*sin(2*PI*t/1.0)':y='(ih-oh)/2+7*sin(2*PI*t/2.0)',${PAL}`,
  },
  {
    out: "thinking.gif",
    inputs: [stills.thinking],
    filter: `[0:v]crop=w=${W}:h=${H}:x='(iw-ow)/2+6*sin(2*PI*t/2.0)':y='(ih-oh)/2+6*cos(2*PI*t/2.0)',${PAL}`,
  },
];

for (const clip of CLIPS) {
  const outPath = path.join(DIR, clip.out);
  const args = ["-y"];
  for (const inp of clip.inputs) {
    args.push("-loop", "1", "-t", String(DUR), "-i", inp);
  }
  args.push("-filter_complex", clip.filter, "-t", String(DUR), "-loop", "0", outPath);
  execFileSync(FFMPEG, args, { stdio: "pipe" });
  const stat = fs.statSync(outPath);
  const probe = execFileSync(
    FFPROBE,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-count_frames",
      "-show_entries",
      "stream=width,height,nb_read_frames,duration",
      "-of",
      "csv=p=0",
      outPath,
    ],
    { encoding: "utf8" },
  ).trim();
  console.log(`${clip.out}: ${probe} size=${Math.round(stat.size / 1024)}KB`);
}

fs.rmSync(TMP, { recursive: true, force: true });
