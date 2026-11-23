// "Forged ring": the launch film, rendered offline (scripts/splash-film/render.mjs), never on phones.
// A ray-marched solitaire: molten gold pours in white-hot, runs round the band from the bottom up
// both sides with liquid bulging fronts and sparks, glows on a dark stone floor, cools through
// orange and red to polished gold; the head and prongs rise; the diamond is set; light flares off it.
// Physically motivated rather than physically exact: Fresnel gold against a studio environment,
// blackbody-like heat colours, a diamond traced through internal reflections with dispersion.
precision highp float;
uniform vec2 uRes;
uniform float uT;

#define PI 3.14159265
const float R = 1.0;
const vec2 BAND = vec2(0.105, 0.19);
const float FLOOR_Y = -1.105;
const float GEM_Y = 1.30;
const float GR = 0.27;

float sat(float x) { return clamp(x, 0., 1.); }
float ease(float x) { x = sat(x); return x * x * (3. - 2. * x); }
float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// ---------------------------------------------------------------- timeline (seconds)
// 0.00–0.35 the pour reaches the bottom of the ring · 0.35–1.45 the band forms up both sides ·
// 1.45–1.95 head and prongs rise · 2.00–2.45 the diamond is set · 2.5–3.6 it catches the light
float flowFront(float t) { float u = sat((t - 0.35) / 1.1); return PI * (1. - (1. - u) * (1. - u)); }
float formTime(float th) { return 0.35 + 1.1 * (1. - sqrt(sat(1. - abs(th) / PI))); }
float cooling(float t) { return 1. - smoothstep(1.9, 2.65, t); }
float bandHeat(float th, float t) { float tf = formTime(th); return t < tf ? 0. : exp(-(t - tf) / 0.6) * cooling(t); }
float headGrow(float t) { return ease((t - 1.45) / 0.5); }
float headHeat(float t) { return t < 1.45 ? 0. : exp(-max(0., t - 1.8) / 0.4) * cooling(t); }
float gemDrop(float t) { float u = sat((t - 2.0) / 0.45); return 1. - pow(1. - u, 3.); }
float pourOn(float t) { return step(0., t) * (1. - step(1.3, t)); }
float pourBottom(float t) { return mix(3.2, -R + 0.02, ease(t / 0.33)); }
float pourTop(float t) { return t < 1.0 ? 4.0 : mix(4.0, -R, ease((t - 1.0) / 0.3)); }

// ---------------------------------------------------------------- shapes
float sdEllipse2(vec2 q, vec2 e) { float k0 = length(q / e); float k1 = length(q / (e * e)); return k0 * (k0 - 1.) / k1; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h) - r; }
float sdCone(vec3 p, float h, float r1, float r2) {
  vec2 q = vec2(length(p.xz), p.y); vec2 k1 = vec2(r2, h); vec2 k2 = vec2(r2 - r1, 2. * h);
  vec2 ca = vec2(q.x - min(q.x, (q.y < 0.) ? r1 : r2), abs(q.y) - h);
  vec2 cb = q - k1 + k2 * sat(dot(k1 - q, k2) / dot(k2, k2));
  float s = (cb.x < 0. && ca.y < 0.) ? -1. : 1.; return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}
float smin(float a, float b, float k) { float h = sat(0.5 + 0.5 * (b - a) / k); return mix(b, a, h) - k * h * (1. - h); }

float sdGem(vec3 p) {
  float r = length(p.xz), a = atan(p.z, p.x);
  float s8 = 2. * PI / 8., s16 = 2. * PI / 16.;
  float a8 = mod(a + s8 * 0.5, s8) - s8 * 0.5, a16 = mod(a, s16) - s16 * 0.5;
  vec2 q8 = vec2(r * cos(a8), p.y), q16 = vec2(r * cos(a16), p.y);
  float d = r - GR;
  d = max(d, p.y - 0.105);
  d = max(d, dot(q8 - vec2(GR, 0.012), normalize(vec2(0.105, GR - 0.15))));
  d = max(d, dot(q16 - vec2(GR, 0.012), normalize(vec2(0.07, GR - 0.19))));
  d = max(d, dot(q8 - vec2(GR, -0.012), normalize(vec2(0.25, -GR))));
  d = max(d, dot(q16 - vec2(GR, -0.012), normalize(vec2(0.33, -GR - 0.02))));
  return d;
}
vec3 gemCenter(float t) { return vec3(0., GEM_Y + (1. - gemDrop(t)) * 1.1, 0.); }

float sdBand(vec3 p, float t) {
  float th = atan(p.x, -p.y);
  float fr = flowFront(t);
  float flowing = 1. - step(PI - 0.02, fr);
  float bulge = flowing * exp(-pow((abs(th) - fr) * 5., 2.));
  vec2 q = vec2(length(p.xy) - R, p.z);
  float d = sdEllipse2(q, BAND * (1. + 0.4 * bulge));
  if (fr < PI - 0.001) d = max(d, (abs(th) - fr) * R);
  if (fr < 0.002) d = 1e3;
  // the liquid heads of the two streams
  float blobR = 0.14 * smoothstep(0.26, 0.42, t) * flowing;
  if (blobR > 0.) {
    vec3 f1 = vec3(R * sin(fr), -R * cos(fr), 0.), f2 = vec3(-R * sin(fr), -R * cos(fr), 0.);
    d = smin(d, min(length(p - f1), length(p - f2)) - blobR, 0.08);
  }
  float heat = bandHeat(th, t);
  d -= heat * 0.014 * (noise(p * 9. + vec3(0., -t * 4., t * 2.)) - 0.5);
  return d;
}
float sdHead(vec3 p, float t) {
  if (t < 1.45) return 1e3;
  vec3 g = p - vec3(0., GEM_Y, 0.);
  float head = sdCone(g - vec3(0., -0.205, 0.), 0.085, 0.075, 0.175);
  float prong = 1e3;
  for (int i = 0; i < 4; i++) {
    float an = PI * 0.25 + float(i) * PI * 0.5;
    vec3 dir = vec3(cos(an), 0., sin(an));
    prong = min(prong, sdCapsule(g, dir * 0.10 + vec3(0., -0.29, 0.), dir * (GR * 0.97) + vec3(0., 0.05, 0.), 0.022));
  }
  float d = min(head, prong);
  float top = R - 0.06 + 0.43 * headGrow(t);
  return max(d, p.y - top);
}
float sdPour(vec3 p, float t) {
  if (pourOn(t) < 0.5) return 1e3;
  float y0 = pourBottom(t), y1 = pourTop(t);
  if (y1 <= y0) return 1e3;
  float wob = 0.012 * sin(p.y * 9. + t * 25.);
  float r = 0.035 + 0.01 * noise(vec3(0., p.y * 6. - t * 30., 0.));
  return sdCapsule(p + vec3(wob, 0., 0.), vec3(0., y0, 0.), vec3(0., y1, 0.), r);
}

// x: distance, y: material (1 metal, 2 diamond, 3 floor, 4 molten pour)
vec2 mapScene(vec3 p, float t) {
  float band = sdBand(p, t);
  float head = sdHead(p, t);
  float metal = min(band, head);
  if (head < 1e2) metal = smin(band, head, 0.06);
  vec2 res = vec2(metal, 1.);
  float pour = sdPour(p, t);
  if (pour < res.x) res = vec2(pour, 4.);
  if (t >= 2.0) { float gem = sdGem(p - gemCenter(t)); if (gem < res.x) res = vec2(gem, 2.); }
  float fl = p.y - FLOOR_Y;
  if (fl < res.x) res = vec2(fl, 3.);
  return res;
}
vec3 normalAt(vec3 p, float t) {
  vec2 e = vec2(1., -1.) * 0.0008;
  return normalize(e.xyy * mapScene(p + e.xyy, t).x + e.yyx * mapScene(p + e.yyx, t).x + e.yxy * mapScene(p + e.yxy, t).x + e.xxx * mapScene(p + e.xxx, t).x);
}
vec3 gemNormal(vec3 q) {
  vec2 e = vec2(1., -1.) * 0.0006;
  return normalize(e.xyy * sdGem(q + e.xyy) + e.yyx * sdGem(q + e.yyx) + e.yxy * sdGem(q + e.yxy) + e.xxx * sdGem(q + e.xxx));
}

// ---------------------------------------------------------------- light
vec3 env(vec3 d) {
  vec3 c = vec3(0.008, 0.006, 0.005) + vec3(0.05, 0.035, 0.02) * smoothstep(-0.3, 1., d.y);
  c += vec3(6.2, 5.6, 4.9) * smoothstep(0.82, 0.975, dot(d, normalize(vec3(-0.45, 0.82, 0.42))));
  vec3 h = normalize(vec3(d.x, 0., d.z));
  float tall = smoothstep(-0.65, -0.1, d.y) * (1. - smoothstep(0.45, 0.85, d.y));
  c += vec3(3.8, 3.5, 3.0) * smoothstep(0.90, 0.965, dot(h, normalize(vec3(-1., 0., 0.35)))) * tall;
  c += vec3(2.7, 2.5, 2.2) * smoothstep(0.92, 0.975, dot(h, normalize(vec3(1., 0., 0.12)))) * tall;
  c += vec3(2.0, 1.6, 1.1) * smoothstep(0.72, 0.95, dot(d, normalize(vec3(0.25, 0.35, -1.))));
  c += vec3(0.3, 0.2, 0.08) * smoothstep(-0.05, -0.85, d.y);
  return c;
}
// heat 1 = white-hot, 0.6 = orange, 0.3 = dull red, 0 = cold
vec3 heatColor(float h) {
  vec3 c = mix(vec3(0.35, 0.03, 0.0), vec3(1.0, 0.32, 0.04), smoothstep(0.08, 0.45, h));
  c = mix(c, vec3(1.0, 0.72, 0.30), smoothstep(0.4, 0.75, h));
  c = mix(c, vec3(1.0, 0.86, 0.55), smoothstep(0.75, 1.0, h)); // molten gold: yellow-orange, not blue-white
  return c * (0.2 + 5.5 * h * h);
}
vec3 gold(vec3 rd, vec3 n) {
  float cosv = sat(dot(-rd, n));
  vec3 F0 = vec3(1.0, 0.74, 0.33);
  vec3 F = F0 + (1. - F0) * pow(1. - cosv, 5.);
  vec3 r = reflect(rd, n);
  vec3 b1 = normalize(cross(n, vec3(0., 1., 0.)) + 1e-4), b2 = cross(n, b1);
  vec3 e = env(r) * 0.4 + (env(normalize(r + b1 * 0.05)) + env(normalize(r - b1 * 0.05)) + env(normalize(r + b2 * 0.05)) + env(normalize(r - b2 * 0.05))) * 0.15;
  return e * F;
}
vec3 diamond(vec3 p, vec3 rd, vec3 n, float t) {
  vec3 gc = gemCenter(t);
  float cosv = sat(dot(-rd, n));
  float fr = 0.17 + 0.83 * pow(1. - cosv, 5.);
  vec3 col = env(reflect(rd, n)) * fr;
  vec3 dir = refract(rd, n, 1. / 2.42);
  vec3 q = p - n * 0.003;
  float thr = 1. - fr;
  for (int b = 0; b < 5; b++) {
    float tt = 0.004;
    for (int i = 0; i < 28; i++) { float d = -sdGem(q + dir * tt - gc); if (d < 0.0008) break; tt += max(d, 0.002); }
    q += dir * tt;
    vec3 no = gemNormal(q - gc);
    vec3 ex = refract(dir, -no, 2.42);
    if (dot(ex, ex) > 0.) {
      vec3 exR = refract(dir, -no, 2.39), exB = refract(dir, -no, 2.47);
      vec3 rr = dot(exR, exR) > 0. ? exR : ex, bb = dot(exB, exB) > 0. ? exB : ex;
      col += thr * 0.8 * vec3(env(rr).r, env(ex).g, env(bb).b);
      thr *= 0.2;
    }
    dir = reflect(dir, -no);
    q += dir * 0.004;
  }
  // fire: tiny coloured flashes on facets as the stone turns
  vec3 fq = floor(n * 7. + 0.5);
  float id = hash(dot(fq, vec3(1., 57., 113.)));
  float tw = pow(max(0., sin(t * 7.0 + id * 40.)), 26.);
  vec3 hue = 0.5 + 0.5 * cos(6.2832 * (id + vec3(0., 0.33, 0.67)));
  return col * 1.15 + tw * (0.6 + 2.5 * hue) * smoothstep(2.4, 2.7, t);
}

// ---------------------------------------------------------------- camera
vec3 camPos(float t) {
  float yaw = mix(-0.8, 0.12, ease(t / 3.6));
  float dist = mix(9.4, 8.4, ease(t / 3.6));
  return vec3(sin(yaw) * dist, 0.55, cos(yaw) * dist);
}
const vec3 TARGET = vec3(0.);
const float FOCAL = 2.3;
vec3 camRay(vec2 uv, vec3 ro) {
  vec3 f = normalize(TARGET - ro), r = normalize(cross(f, vec3(0., 1., 0.))), u = cross(r, f);
  return normalize(uv.x * r + uv.y * u + FOCAL * f);
}
vec2 project(vec3 P, vec3 ro) {
  vec3 f = normalize(TARGET - ro), r = normalize(cross(f, vec3(0., 1., 0.))), u = cross(r, f);
  vec3 v = P - ro;
  return vec2(dot(v, r), dot(v, u)) * FOCAL / dot(v, f);
}

float march(vec3 ro, vec3 rd, float t, out vec2 hit, float tmax) {
  float d = 0.;
  hit = vec2(1e3, 0.);
  for (int i = 0; i < 160; i++) {
    vec3 p = ro + rd * d;
    hit = mapScene(p, t);
    if (hit.x < 0.0006 || d > tmax) break;
    d += hit.x * 0.8;
  }
  return d;
}

vec3 bg(vec2 uv) {
  vec3 c = vec3(0.016, 0.012, 0.009);
  c += vec3(0.05, 0.034, 0.018) * exp(-dot(uv * vec2(1.0, 1.3), uv * vec2(1.0, 1.3)) * 3.);
  return c;
}

vec3 shadeSurface(vec3 p, vec3 rd, vec2 hit, float t) {
  vec3 n = normalAt(p, t);
  if (hit.y < 1.5) {
    // the stream heads are the freshest metal: clamp to the front so they glow white-hot
    float th = min(abs(atan(p.x, -p.y)), flowFront(t));
    float h = max(p.y > R - 0.1 && abs(p.x) < 0.3 && t > 1.45 ? headHeat(t) : 0., bandHeat(th, t));
    vec3 g = gold(rd, n);
    float glow = smoothstep(0.02, 0.2, h);
    return mix(g, heatColor(h) + g * 0.25, glow);
  }
  if (hit.y < 2.5) return diamond(p, rd, n, t);
  if (hit.y > 3.5) return heatColor(0.92);
  return vec3(0.);
}

void main() {
  float t = uT;
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 ro = camPos(t);
  vec3 rd = camRay(uv, ro);
  vec2 hit;
  float d = march(ro, rd, t, hit, 30.);
  vec3 col = bg(uv);
  if (hit.x < 0.002) {
    vec3 p = ro + rd * d;
    if (hit.y > 2.5 && hit.y < 3.5) {
      // dark polished stone: a dim reflection, the glow of hot metal, and darkness further out
      float fade = 1. - smoothstep(1.4, 4.2, length(p.xz));
      vec3 n = vec3(0., 1., 0.);
      vec3 rr = reflect(rd, n);
      rr.xz += (vec2(noise(p * 30.), noise(p * 30. + 7.)) - 0.5) * 0.004;
      rr = normalize(rr);
      vec2 h2;
      float d2 = march(p + n * 0.003, rr, t, h2, 12.);
      vec3 refl = bg(uv) * 0.6;
      if (h2.x < 0.002 && h2.y != 3.) refl = shadeSurface(p + n * 0.003 + rr * d2, rr, h2, t);
      float fres = 0.05 + 0.95 * pow(1. - sat(dot(-rd, n)), 5.);
      vec3 base = vec3(0.010, 0.008, 0.007);
      float th = atan(p.x, -max(p.y, -R));
      float sB = sdEllipse2(vec2(length(vec2(p.x, max(p.y + 0.0, -R))) - R, p.z), BAND);
      vec3 pool = heatColor(bandHeat(atan(p.x, R), t)) * exp(-max(sB, 0.) * 6.) * 0.12 * smoothstep(0.3, 0.45, t);
      pool += heatColor(1.) * 0.05 * exp(-length(p.xz) * 6.) * pourOn(t) * smoothstep(0.28, 0.4, t);
      float ao = 1. - 0.65 * (1. - smoothstep(0., 0.35, abs(p.z) + max(0., abs(p.x) - 0.2))) * smoothstep(0.3, 0.5, t);
      col = mix(bg(uv), (base + refl * (0.12 + 0.5 * fres)) * ao + pool, fade);
    } else {
      col = shadeSurface(p, rd, hit, t);
    }
  }

  // sparks thrown off the molten fronts and the pour
  float px = 1. / uRes.y;
  vec3 spark = vec3(0.);
  for (int i = 0; i < 70; i++) {
    float fi = float(i);
    float tb = 0.32 + 1.12 * hash(fi * 1.7 + 0.3);
    float age = t - tb;
    float life = 0.3 + 0.45 * hash(fi * 3.1);
    if (age < 0. || age > life) continue;
    float side = hash(fi * 5.3) > 0.5 ? 1. : -1.;
    float th0 = side * flowFront(tb);
    vec3 o = fi < 20. ? vec3(0., -R + 0.05, 0.) : vec3(R * sin(th0), -R * cos(th0), (hash(fi * 7.7) - 0.5) * 0.2);
    vec3 v = normalize(vec3(o.x * 0.7 + (hash(fi * 9.1) - 0.5) * 1.6, 1.0 + hash(fi * 11.3) * 1.6, (hash(fi * 13.7) - 0.5) * 1.8)) * (1.4 + hash(fi * 17.1) * 1.9);
    vec3 P1 = o + v * age + vec3(0., -3.6, 0.) * age * age;
    vec3 P0 = o + v * max(0., age - 0.03) + vec3(0., -3.6, 0.) * max(0., age - 0.03) * max(0., age - 0.03);
    vec2 a = project(P0, ro), b = project(P1, ro);
    vec2 pa = uv - a, ba = b - a;
    float hseg = sat(dot(pa, ba) / max(dot(ba, ba), 1e-8));
    float dist = length(pa - ba * hseg);
    float k = pow(1. - age / life, 1.4);
    spark += heatColor(0.75 + 0.25 * k) * 0.2 * k * exp(-dist / (1.8 * px));
  }
  col += spark;

  // the glint: a star of light off the diamond, with two smaller echoes
  vec2 g = project(gemCenter(t) + vec3(-0.06, 0.06, 0.12), ro);
  float gl = exp(-pow((t - 2.78) / 0.13, 2.)) + 0.45 * exp(-pow((t - 3.18) / 0.09, 2.)) + 0.3 * exp(-pow((t - 3.45) / 0.07, 2.));
  if (gl > 0.002) {
    vec2 dd = (uv - g) * rot(0.18 + t * 0.25);
    float r = length(dd);
    float star = 0.;
    for (int k = 0; k < 4; k++) {
      float an = float(k) * PI * 0.25;
      vec2 dir = vec2(cos(an), sin(an));
      float along = abs(dot(dd, dir)), across = abs(dot(dd, vec2(-dir.y, dir.x)));
      float len = (k == 0 || k == 2) ? 0.15 : 0.06;
      star += exp(-across / (0.0011 + along * 0.008)) * exp(-along / len);
    }
    vec3 halo = vec3(1.0, 0.96, 0.9) * (exp(-r / 0.008) * 1.6 + exp(-r / 0.05) * 0.35);
    col += (vec3(1.0, 0.97, 0.92) * star * 1.1 + halo) * gl;
  }

  col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0., 1.);
  col = pow(col, vec3(1. / 2.2));
  gl_FragColor = vec4(col, 1.);
}
