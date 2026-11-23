#!/usr/bin/env node
// Renders the launch film from forge.frag, frame by frame, in headless Chromium (software WebGL;
// slow but exact), then adds glow (bloom), film grain and encodes MP4 + WebM + a poster with ffmpeg.
//
//   node scripts/splash-film/render.mjs                 full film into public/splash/
//   node scripts/splash-film/render.mjs --preview 0.5,1.2,2.8 --size 600   a few stills to check
//
// Frames are rendered at twice the output size and scaled down (anti-aliasing).
import { chromium } from "playwright";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = Number(arg("--size", "800"));
const FPS = 30, DURATION = 3.6;
// Bump when the film changes: the files are cached for a year under their name (next.config.ts),
// and the name is referenced in src/components/Splash.tsx.
const NAME = "ring-v1";
const preview = arg("--preview", null);
const frag = readFileSync(join(here, "forge.frag"), "utf8");
const work = arg("--work", join(tmpdir(), "takara-film"));
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const S = OUT * 2;
const html = `<html><body style="margin:0;background:#000"><canvas id=c width=${S} height=${S}></canvas><script>
const gl=document.getElementById('c').getContext('webgl',{preserveDrawingBuffer:true,antialias:false});
const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o};
const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'));
gl.attachShader(p,sh(gl.FRAGMENT_SHADER,${JSON.stringify(frag)}));gl.linkProgram(p);gl.useProgram(p);
const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
const l=gl.getAttribLocation(p,'a');gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,2,gl.FLOAT,false,0,0);
gl.uniform2f(gl.getUniformLocation(p,'uRes'),${S},${S});
const uT=gl.getUniformLocation(p,'uT');
// Draw in horizontal bands so no single draw call runs long enough to trip the GPU watchdog.
window.draw=(t)=>{gl.uniform1f(uT,t);gl.enable(gl.SCISSOR_TEST);const n=8;for(let i=0;i<n;i++){gl.scissor(0,i*${S}/n,${S},${S}/n);gl.drawArrays(gl.TRIANGLES,0,3);gl.finish();}
  return document.getElementById('c').toDataURL('image/png');};
</script></body></html>`;
writeFileSync(join(work, "film.html"), html);

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--disable-gpu-watchdog"] });
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
page.setDefaultTimeout(0);
await page.goto("file://" + join(work, "film.html"));

const times = preview ? preview.split(",").map(Number) : Array.from({ length: Math.round(FPS * DURATION) }, (_, i) => i / FPS);
let n = 0;
const t0 = Date.now();
for (const t of times) {
  const data = await page.evaluate((t) => window.draw(t), t);
  writeFileSync(join(work, `f${String(n++).padStart(4, "0")}.png`), Buffer.from(data.split(",")[1], "base64"));
  if (n % 10 === 0 || preview) console.log(`frame ${n}/${times.length} (t=${t.toFixed(2)}s) ${((Date.now() - t0) / n / 1000).toFixed(1)} s/frame`);
}
await browser.close();

// Glow: the brightest parts (molten metal, the glint) blurred twice and screened back on; a
// little grain so the dark velvet doesn't band. Then down to the output size.
const bloom =
  `[0:v]split=3[base][h1][h2];` +
  `[h1]curves=all='0/0 0.62/0 1/1',gblur=sigma=${S / 160}[g1];` +
  `[h2]curves=all='0/0 0.75/0 1/1',gblur=sigma=${S / 45}[g2];` +
  `[base][g1]blend=all_mode=screen:all_opacity=0.75[b1];[b1][g2]blend=all_mode=screen:all_opacity=0.6[b2];` +
  `[b2]scale=${OUT}:${OUT}:flags=lanczos,noise=alls=3:allf=t,format=yuv420p[v]`;
const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });

if (preview) {
  const outDir = arg("--out", join(work, "preview"));
  mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < n; i++) {
    ff(["-i", join(work, `f${String(i).padStart(4, "0")}.png`), "-filter_complex", bloom.replace(",format=yuv420p", ""), "-map", "[v]", join(outDir, `t${times[i].toFixed(2)}.png`)]);
  }
  console.log("previews in", outDir);
} else {
  const dest = join(root, "public", "splash");
  mkdirSync(dest, { recursive: true });
  const input = ["-framerate", String(FPS), "-i", join(work, "f%04d.png")];
  ff([...input, "-filter_complex", bloom, "-map", "[v]", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-profile:v", "high", "-movflags", "+faststart", "-an", join(dest, `${NAME}.mp4`)]);
  ff([...input, "-filter_complex", bloom, "-map", "[v]", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-row-mt", "1", "-an", join(dest, `${NAME}.webm`)]);
  // Poster: the finished ring (last frame), for slow connections and as the video's first paint.
  ff(["-sseof", "-0.05", "-i", join(dest, `${NAME}.mp4`), "-frames:v", "1", "-q:v", "4", join(dest, `${NAME}.jpg`)]);
  console.log("wrote", dest);
}
