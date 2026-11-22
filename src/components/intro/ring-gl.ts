/**
 * A gold ring with a brilliant-cut diamond, drawn live on the phone's graphics chip.
 *
 * No 3D library: one full-screen triangle and a ray-marched fragment shader (about 6 KB of code
 * instead of ~150 KB for three.js). The ring is described by distance functions; gold is
 * shaded with a physically-based Fresnel term against a procedural photo-studio environment
 * (soft boxes, strip lights, a warm floor), the diamond with reflection, a faked internal bounce
 * with colour dispersion ("fire") and per-facet sparkle. Everything outside the ring is
 * transparent, so the page's own background shows through.
 */

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uRot;      // yaw, pitch (radians)
uniform float uGlint;   // 0..1 overall sparkle strength

#define PI 3.14159265
const float R = 1.0;                 // ring radius
const vec2 BAND = vec2(0.105, 0.19); // band half thickness (radial, axial)
const vec3 GEM = vec3(0.0, 1.30, 0.0);
const float GR = 0.27;               // girdle radius

mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float hash(float n){return fract(sin(n)*43758.5453123);}
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}

float sdEllipse2(vec2 q, vec2 e){float k0=length(q/e);float k1=length(q/(e*e));return k0*(k0-1.0)/k1;}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-r;}
float sdCone(vec3 p, float h, float r1, float r2){ // capped cone along y, from -h (r1) to +h (r2)
  vec2 q=vec2(length(p.xz),p.y);vec2 k1=vec2(r2,h);vec2 k2=vec2(r2-r1,2.0*h);
  vec2 ca=vec2(q.x-min(q.x,(q.y<0.)?r1:r2),abs(q.y)-h);
  vec2 cb=q-k1+k2*clamp(dot(k1-q,k2)/dot(k2,k2),0.,1.);
  float s=(cb.x<0.&&ca.y<0.)?-1.:1.;return s*sqrt(min(dot(ca,ca),dot(cb,cb)));}

// Brilliant cut, girdle at y=0, table up. Facets come from folding space into 8 and 16 sectors.
float sdGem(vec3 p){
  float r=length(p.xz);
  float a=atan(p.z,p.x);
  float s8=2.0*PI/8.0, s16=2.0*PI/16.0;
  float a8=mod(a+s8*0.5,s8)-s8*0.5;
  float a16=mod(a,s16)-s16*0.5;
  vec2 q8=vec2(r*cos(a8),p.y);
  vec2 q16=vec2(r*cos(a16),p.y);
  float d=r-GR;                                   // girdle
  d=max(d,p.y-0.105);                             // table
  d=max(d,dot(q8-vec2(GR,0.012),normalize(vec2(0.105,GR-0.15))));     // crown (bezel)
  d=max(d,dot(q16-vec2(GR,0.012),normalize(vec2(0.07,GR-0.19))));     // upper girdle
  d=max(d,dot(q8-vec2(GR,-0.012),normalize(vec2(0.25,-GR))));         // pavilion
  d=max(d,dot(q16-vec2(GR,-0.012),normalize(vec2(0.33,-GR-0.02))));   // lower girdle
  return d;
}

vec2 map(vec3 p){
  // band: ring in the xy plane, axis z
  vec2 q=vec2(length(p.xy)-R,p.z);
  float band=sdEllipse2(q,BAND);
  // head: a tapered collet and four prongs holding the stone
  vec3 g=p-GEM;
  float head=sdCone(g-vec3(0.,-0.205,0.),0.085,0.075,0.175);
  float prong=1e5;
  for(int i=0;i<4;i++){
    float an=PI*0.25+float(i)*PI*0.5;
    vec3 dir=vec3(cos(an),0.,sin(an));
    prong=min(prong,sdCapsule(g,dir*0.10+vec3(0.,-0.29,0.),dir*(GR*0.97)+vec3(0.,0.05,0.),0.022));
  }
  float metal=min(band,min(head,prong));
  // smooth the joint between band and head
  float k=0.06;float h=clamp(0.5+0.5*(head-band)/k,0.,1.);
  metal=min(metal,mix(head,band,h)-k*h*(1.-h));
  float gem=sdGem(g);
  return gem<metal?vec2(gem,2.):vec2(metal,1.);
}

vec3 normalAt(vec3 p){
  vec2 e=vec2(1.,-1.)*0.0009;
  return normalize(e.xyy*map(p+e.xyy).x+e.yyx*map(p+e.yyx).x+e.yxy*map(p+e.yxy).x+e.xxx*map(p+e.xxx).x);
}

// Photo-studio light: dark warm room, a large soft box above left, two tall strip lights, a rim
// light behind and a warm bounce from below.
vec3 env(vec3 d){
  vec3 c=vec3(0.010,0.008,0.006)+vec3(0.06,0.042,0.024)*smoothstep(-0.3,1.0,d.y);
  c+=vec3(6.0,5.5,4.8)*smoothstep(0.82,0.975,dot(d,normalize(vec3(-0.45,0.82,0.42))));
  vec3 h=normalize(vec3(d.x,0.,d.z));
  float tall=smoothstep(-0.65,-0.1,d.y)*(1.-smoothstep(0.45,0.85,d.y));
  c+=vec3(3.6,3.3,2.9)*smoothstep(0.90,0.965,dot(h,normalize(vec3(-1.,0.,0.35))))*tall;
  c+=vec3(2.6,2.4,2.1)*smoothstep(0.92,0.975,dot(h,normalize(vec3(1.,0.,0.12))))*tall;
  c+=vec3(1.9,1.5,1.0)*smoothstep(0.72,0.95,dot(d,normalize(vec3(0.25,0.35,-1.))));
  c+=vec3(0.35,0.22,0.09)*smoothstep(-0.05,-0.85,d.y);
  return c;
}

vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.);}

void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  vec3 ro=vec3(0.,0.26,8.4);
  vec3 rd=normalize(vec3(uv,-2.45));
  rd.yz*=rot(0.012);
  // spin the world the other way round instead of the ring
  mat2 ry=rot(uRot.x), rx=rot(uRot.y);
  ro.yz*=rx; rd.yz*=rx; ro.xz*=ry; rd.xz*=ry;

  float t=5.6;vec2 h=vec2(1e5,0.);float glow=1e5;
  for(int i=0;i<96;i++){
    vec3 p=ro+rd*t;h=map(p);
    glow=min(glow,h.x);
    if(h.x<0.0007||t>14.) break;
    t+=h.x*0.85;
  }

  vec3 col=vec3(0.);float alpha=0.;
  if(h.x<0.0015){
    vec3 p=ro+rd*t;vec3 n=normalAt(p);
    float cosv=clamp(dot(-rd,n),0.,1.);
    if(h.y<1.5){
      vec3 F0=vec3(1.0,0.74,0.33);
      vec3 F=F0+(1.-F0)*pow(1.-cosv,5.);
      vec3 r=reflect(rd,n);
      // three slightly spread samples = a little polish roughness, and softer aliasing
      vec3 b1=normalize(cross(n,vec3(0.,1.,0.))+1e-4);vec3 b2=cross(n,b1);
      vec3 e=env(r)*0.5+env(normalize(r+b1*0.06))*0.25+env(normalize(r+b2*0.06))*0.25;
      col=e*F;
    }else{
      float fr=0.17+0.83*pow(1.-cosv,5.);
      vec3 refl=env(reflect(rd,n));
      vec3 nm=vec3(n.x,-n.y,n.z);
      vec3 tR=refract(rd,n,1./2.40),tG=refract(rd,n,1./2.42),tB=refract(rd,n,1./2.46);
      vec3 inside=vec3(env(reflect(tR,nm)).r,env(reflect(tG,nm)).g,env(reflect(tB,nm)).b);
      // per-facet sparkle that flickers as the stone turns
      vec3 fq=floor(n*7.0+0.5);
      float id=hash(dot(fq,vec3(1.,57.,113.)));
      float tw=pow(max(0.,sin(uTime*3.1+id*40.+uRot.x*9.)),20.);
      inside=pow(inside,vec3(1.35))*1.6;
      col=refl*fr+inside*(1.-fr)*vec3(0.92,0.96,1.0)+vec3(tw*id*6.0)*uGlint;
    }
    alpha=1.;
  }
  // soft golden halo hugging the ring
  float halo=exp(-glow*26.)*0.13;
  col+=vec3(1.0,0.72,0.32)*halo*(1.-alpha);
  alpha=max(alpha,halo);

  // drifting gold dust behind
  vec2 g=uv*vec2(18.,18.)+vec2(0.,uTime*0.25);
  vec2 cell=floor(g);vec2 f=fract(g)-0.5;
  float rnd=hash2(cell);
  if(rnd>0.92){
    vec2 off=vec2(hash2(cell+3.1),hash2(cell+7.7))-0.5;
    float dd=length(f-off*0.6);
    float tw=0.5+0.5*sin(uTime*1.7+rnd*60.);
    float dust=smoothstep(0.09,0.0,dd)*tw*0.7*(1.-alpha);
    col+=vec3(1.,0.8,0.45)*dust;alpha=max(alpha,dust);
  }

  col=aces(col*1.15);
  col=pow(col,vec3(1./2.2));
  gl_FragColor=vec4(col,alpha); // premultiplied: colour already scaled by coverage
}`;

export type RingRenderer = { frame: (t: number, yaw: number, pitch: number) => void; resize: (w: number, h: number) => void; destroy: () => void };

/** Sets up WebGL on the canvas. Returns null when WebGL (or high float precision) isn't there. */
export function createRing(canvas: HTMLCanvasElement): RingRenderer | null {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: "high-performance" });
  if (!gl) return null;
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  if (!hp || hp.precision === 0) return null;

  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, VERT);
  const fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uRot = gl.getUniformLocation(prog, "uRot");
  const uGlint = gl.getUniformLocation(prog, "uGlint");
  gl.uniform1f(uGlint, 1);
  gl.clearColor(0, 0, 0, 0);

  return {
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    },
    frame(t, yaw, pitch) {
      gl.uniform1f(uTime, t);
      gl.uniform2f(uRot, yaw, pitch);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
