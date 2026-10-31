// Motion model inspired by stackedlol/ascii-sharks (MIT, © 2026 drewdi):
// a follow-the-leader spine with a bend limit per joint. The head steers and
// the body trails the path, so a koi arcs through a turn instead of pivoting
// around its nose.

type Palette = {
  body: string;
  bodyShade: string;
  fin: string;
  finShade: string;
  red: string;
  redShade: string;
  black: string;
  eye: string;
  glyphBody: string;
  glyphRed: string;
  glyphBlack: string;
  glyphFin: string;
  grid: string;
  alpha: number;
  dim: number;
};

const DARK: Palette = {
  body: "#f0ece3",
  bodyShade: "#c9c4ba",
  fin: "#5f5f65",
  finShade: "#3c3c42",
  red: "#ef6a2e",
  redShade: "#c94f1f",
  black: "#24242a",
  eye: "#f6f3ec",
  glyphBody: "#1b1b20",
  glyphRed: "#24140c",
  glyphBlack: "#d8d4cb",
  glyphFin: "#b8b5bb",
  grid: "rgba(255,255,255,0.018)",
  alpha: 0.92,
  dim: 0.4,
};

const LIGHT: Palette = {
  body: "#55514b",
  bodyShade: "#4a4640",
  fin: "#8a8378",
  finShade: "#a39c90",
  red: "#c4461c",
  redShade: "#a33915",
  black: "#29251f",
  eye: "#f4efe5",
  glyphBody: "#f2ede4",
  glyphRed: "#f6e9dc",
  glyphBlack: "#efe9dd",
  glyphFin: "#efe9dd",
  grid: "rgba(0,0,0,0.015)",
  alpha: 0.86,
  dim: 0.36,
};

const TAU = Math.PI * 2;
const N = 18;
const BODY_GLYPHS = "SX%t8#@&";
const RED_GLYPHS = "SX%t";
const BLACK_GLYPHS = "SX%@";
const FIN_GLYPHS = "';:t%S";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const angleDiff = (a: number, b: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
const hash = (x: number, y: number, z: number) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

type Variety = "kohaku" | "sanke" | "tancho";
type Patch = { s: number; a: number; rs: number; ra: number };

type Koi = {
  length: number;
  /** Spine positions, snout first: [x0, y0, x1, y1, ...]. */
  nodes: Float32Array;
  heading: number;
  speed: number;
  phase: number;
  depth: number;
  orbitDir: 1 | -1;
  orbitRx: number;
  orbitRy: number;
  seed: number;
  red: Patch[];
  black: Patch[];
};

type Rect = { left: number; top: number; right: number; bottom: number };
type Kind = "body" | "bodyShade" | "red" | "redShade" | "black" | "fin" | "finShade" | "eye";
type Sample = { s: number; v: number; d: number; nx: number; ny: number; hw: number };

const VARIETIES: Variety[] = ["kohaku", "sanke", "kohaku", "tancho", "sanke"];

function markings(variety: Variety, seed: number) {
  const r = rng(seed);
  const red: Patch[] = [];
  const black: Patch[] = [];
  if (variety === "tancho") {
    red.push({ s: 0.08, a: 0, rs: 0.075, ra: 0.85 });
    return { red, black };
  }
  const count = variety === "kohaku" ? 3 : 2 + Math.floor(r() * 2);
  for (let i = 0; i < count; i++) {
    red.push({
      s: 0.14 + (i / count) * 0.4 + (r() - 0.5) * 0.05,
      a: (r() - 0.5) * 0.25,
      rs: 0.105 + r() * 0.05,
      ra: 0.75 + r() * 0.22,
    });
  }
  if (variety === "sanke") {
    const spots = 5 + Math.floor(r() * 4);
    for (let i = 0; i < spots; i++) {
      black.push({
        s: 0.16 + r() * 0.5,
        a: (r() - 0.5) * 1.2,
        rs: 0.018 + r() * 0.018,
        ra: 0.14 + r() * 0.16,
      });
    }
  }
  return { red, black };
}

/** Half-width of the body and tail fan, as a fraction of length. */
function bodyHalfWidth(s: number) {
  if (s < 0.08) return 0.12 * Math.pow(Math.sin((s / 0.08) * (Math.PI / 2)), 0.55);
  if (s < 0.32) return 0.12 + 0.07 * smoothstep(0.08, 0.32, s);
  if (s < 0.56) return 0.19 - 0.06 * smoothstep(0.32, 0.56, s);
  if (s < 0.72) return 0.13 - 0.04 * smoothstep(0.56, 0.72, s);
  const u = (s - 0.72) / 0.28;
  const fan = 0.09 + 0.04 * Math.sin(Math.min(1, u * 1.2) * (Math.PI / 2));
  return fan * (1 - 0.12 * smoothstep(0.92, 1, s));
}

function inTriangle(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number
) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function inPectoral(s: number, v: number, length: number) {
  const u = s * length;
  const a = Math.abs(v);
  return (
    inTriangle(u, a, length * 0.16, 0, length * 0.29, 0, length * 0.31, length * 0.28) ||
    inTriangle(u, a, length * 0.46, 0, length * 0.55, 0, length * 0.58, length * 0.22)
  );
}

function inPatch(p: Patch, s: number, a: number) {
  return ((s - p.s) / p.rs) ** 2 + ((a - p.a) / p.ra) ** 2 < 1;
}

function lineGlyph(dx: number, dy: number) {
  const d = Math.hypot(dx, dy) || 1;
  if (Math.abs(dy) < 0.38 * d) return "-";
  if (Math.abs(dx) < 0.38 * d) return "|";
  return dx * dy > 0 ? "\\" : "/";
}

function dimFactor(x: number, y: number, rects: Rect[], floor: number) {
  let dim = 1;
  for (const r of rects) {
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const d = Math.hypot(dx, dy);
    if (d < 40) dim = Math.min(dim, floor + (1 - floor) * smoothstep(0, 40, d));
  }
  return dim;
}

class World {
  width = 0;
  height = 0;
  time = 0;
  koi: Koi[] = [];

  resize(width: number, height: number) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    if (first) this.seed();
    else {
      for (const k of this.koi) {
        k.nodes[0] = clamp(k.nodes[0], 20, width - 20);
        k.nodes[1] = clamp(k.nodes[1], 20, height - 20);
      }
    }
  }

  private seed() {
    const W = this.width;
    const H = this.height;
    const minSide = Math.min(W, H);
    const base = clamp(minSide * 0.4, 180, 340);
    const count = clamp(Math.round((W * H) / 200000), 3, 5);
    const r = rng(0x9e3779b9 ^ Math.round(W * 7 + H * 13));
    this.koi = [];
    for (let i = 0; i < count; i++) {
      const id = i + 1;
      const seed = (id * 2654435761) % 4294967296;
      const length = base * (0.75 + r() * 0.3);
      const variety = VARIETIES[i % VARIETIES.length];
      const { red, black } = markings(variety, seed);
      const orbitDir: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const orbitRx = W * (0.28 + r() * 0.18);
      const orbitRy = H * (0.24 + r() * 0.18);
      const angle = (i / count) * TAU + (r() - 0.5) * 0.8;
      const x = W / 2 + Math.cos(angle) * orbitRx;
      const y = H / 2 + Math.sin(angle) * orbitRy;
      const heading = angle + (orbitDir * Math.PI) / 2;
      const nodes = new Float32Array(N * 2);
      const seg = length / (N - 1);
      for (let n = 0; n < N; n++) {
        nodes[n * 2] = x - Math.cos(heading) * seg * n;
        nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
      }
      this.koi.push({
        length,
        nodes,
        heading,
        speed: 26 + r() * 10,
        phase: r() * TAU,
        depth: 0.55 + r() * 0.45,
        orbitDir,
        orbitRx,
        orbitRy,
        seed,
        red,
        black,
      });
    }
    this.koi.sort((a, b) => a.depth - b.depth);
  }

  step(dt: number) {
    this.time += dt;
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    const margin = minSide * 0.1;
    const cx = W / 2;
    const cy = H / 2;

    for (const k of this.koi) {
      const headX = k.nodes[0];
      const headY = k.nodes[1];
      let dx = Math.cos(k.heading);
      let dy = Math.sin(k.heading);

      // Slow wander: a drifting offset ahead of the snout.
      const wander =
        0.5 * Math.sin(this.time * 0.19 + k.seed) +
        0.3 * Math.sin(this.time * 0.11 + k.seed * 2.3);
      dx += Math.cos(k.heading + wander) * 0.5;
      dy += Math.sin(k.heading + wander) * 0.5;

      // Patrol an ellipse around the pond.
      const ex = (headX - cx) / k.orbitRx;
      const ey = (headY - cy) / k.orbitRy;
      const er = Math.hypot(ex, ey) || 1;
      const radial = clamp((1 - er) * 1.5, -1, 1);
      dx += ((-ey / er) * k.orbitDir + (ex / er) * radial * 0.8) * 0.6;
      dy += ((ex / er) * k.orbitDir + (ey / er) * radial * 0.8) * 0.6;

      // Give the other koi room.
      for (const o of this.koi) {
        if (o === k) continue;
        const ox = o.nodes[0] - headX;
        const oy = o.nodes[1] - headY;
        const d = Math.hypot(ox, oy);
        const range = (k.length + o.length) * 0.32;
        if (d < range && d > 1e-3) {
          const w = (1 - d / range) * 2.2;
          dx -= (ox / d) * w;
          dy -= (oy / d) * w;
        }
      }

      // Soft walls.
      if (headX < margin) dx += (1 - headX / margin) * 2.4;
      if (headX > W - margin) dx -= (1 - (W - headX) / margin) * 2.4;
      if (headY < margin) dy += (1 - headY / margin) * 2.4;
      if (headY > H - margin) dy -= (1 - (H - headY) / margin) * 2.4;

      const desired = Math.atan2(dy, dx);
      // A koi cannot pivot: the turn rate is capped, so it traces an arc.
      const maxTurn = (0.55 + 10 / k.length) * dt;
      k.heading += clamp(angleDiff(k.heading, desired), -maxTurn, maxTurn);

      const cruise = 26 + 10 * (k.length / 360);
      const target = cruise * (1 + 0.12 * Math.sin(this.time * 0.23 + k.seed));
      k.speed += (target - k.speed) * Math.min(1, dt * 0.8);
      k.phase += dt * (1.4 + k.speed * 0.05);

      k.nodes[0] = clamp(headX + Math.cos(k.heading) * k.speed * dt, -k.length * 0.3, W + k.length * 0.3);
      k.nodes[1] = clamp(headY + Math.sin(k.heading) * k.speed * dt, -k.length * 0.3, H + k.length * 0.3);

      // Follow-the-leader spine, with a bend limit per joint.
      const seg = k.length / (N - 1);
      const maxBend = 0.18;
      let prevAngle = k.heading + Math.PI;
      for (let n = 1; n < N; n++) {
        const px = k.nodes[(n - 1) * 2];
        const py = k.nodes[(n - 1) * 2 + 1];
        let angle = Math.atan2(k.nodes[n * 2 + 1] - py, k.nodes[n * 2] - px);
        angle = prevAngle + clamp(angleDiff(prevAngle, angle), -maxBend, maxBend);
        k.nodes[n * 2] = px + Math.cos(angle) * seg;
        k.nodes[n * 2 + 1] = py + Math.sin(angle) * seg;
        prevAngle = angle;
      }
    }
  }
}

function buildRenderSpine(k: Koi, spine: Float32Array, arc: Float32Array) {
  const swim = 0.7 + 0.3 * Math.min(1, k.speed / 38);
  for (let n = 0; n < N; n++) {
    const s = n / (N - 1);
    const a = Math.max(0, n - 1);
    const b = Math.min(N - 1, n + 1);
    let tx = k.nodes[a * 2] - k.nodes[b * 2];
    let ty = k.nodes[a * 2 + 1] - k.nodes[b * 2 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const amp = k.length * 0.045 * (0.12 + 0.88 * Math.pow(s, 1.8)) * swim;
    const off = amp * Math.sin(k.phase - s * 5);
    spine[n * 2] = k.nodes[n * 2] - ty * off;
    spine[n * 2 + 1] = k.nodes[n * 2 + 1] + tx * off;
  }
  // The caudal fan is stiff: straighten the tail nodes along the tail-base
  // tangent so the fan stays a fan instead of curling with the spine.
  const tb = 11;
  let btx = k.nodes[tb * 2] - k.nodes[(tb - 1) * 2];
  let bty = k.nodes[tb * 2 + 1] - k.nodes[(tb - 1) * 2 + 1];
  const bl = Math.hypot(btx, bty) || 1;
  btx /= bl;
  bty /= bl;
  const bx = spine[tb * 2];
  const by = spine[tb * 2 + 1];
  const seg = k.length / (N - 1);
  for (let n = tb + 1; n < N; n++) {
    const s = n / (N - 1);
    const amp = k.length * 0.045 * (0.12 + 0.88 * Math.pow(s, 1.8)) * swim;
    const off = amp * Math.sin(k.phase - s * 5);
    const dist = (n - tb) * seg;
    const tx2 = bx + btx * dist - bty * off;
    const ty2 = by + bty * dist + btx * off;
    const blend = Math.sqrt((n - tb) / (N - 1 - tb));
    spine[n * 2] = spine[n * 2] * (1 - blend) + tx2 * blend;
    spine[n * 2 + 1] = spine[n * 2 + 1] * (1 - blend) + ty2 * blend;
  }
  arc[0] = 0;
  for (let n = 1; n < N; n++) {
    arc[n] = arc[n - 1] + Math.hypot(spine[n * 2] - spine[(n - 1) * 2], spine[n * 2 + 1] - spine[(n - 1) * 2 + 1]);
  }
  return arc[N - 1] || 1;
}

function pointAt(spine: Float32Array, arc: Float32Array, arcTotal: number, s: number) {
  const target = s * arcTotal;
  let n = 0;
  while (n < N - 2 && arc[n + 1] < target) n++;
  const seg = arc[n + 1] - arc[n] || 1;
  const u = clamp((target - arc[n]) / seg, 0, 1);
  const x = spine[n * 2] + (spine[(n + 1) * 2] - spine[n * 2]) * u;
  const y = spine[n * 2 + 1] + (spine[(n + 1) * 2 + 1] - spine[n * 2 + 1]) * u;
  return {
    x,
    y,
    tx: (spine[(n + 1) * 2] - spine[n * 2]) / seg,
    ty: (spine[(n + 1) * 2 + 1] - spine[n * 2 + 1]) / seg,
  };
}

function sampleSpine(spine: Float32Array, arc: Float32Array, arcTotal: number, x: number, y: number): Sample {
  let best = Infinity;
  let bestS = 0;
  let bestSign = 1;
  let bestNx = 0;
  let bestNy = 0;
  for (let n = 0; n < N - 1; n++) {
    const ax = spine[n * 2];
    const ay = spine[n * 2 + 1];
    const sx = spine[(n + 1) * 2] - ax;
    const sy = spine[(n + 1) * 2 + 1] - ay;
    const len2 = sx * sx + sy * sy || 1;
    const u = clamp(((x - ax) * sx + (y - ay) * sy) / len2, 0, 1);
    const qx = ax + sx * u;
    const qy = ay + sy * u;
    const d2 = (x - qx) ** 2 + (y - qy) ** 2;
    if (d2 < best) {
      best = d2;
      const len = Math.sqrt(len2);
      bestS = (arc[n] + u * len) / arcTotal;
      bestSign = sx * (y - ay) - sy * (x - ax) >= 0 ? 1 : -1;
      bestNx = (-sy / len) * bestSign;
      bestNy = (sx / len) * bestSign;
    }
  }
  const d = Math.sqrt(best);
  return { s: bestS, v: d * bestSign, d, nx: bestNx, ny: bestNy, hw: bodyHalfWidth(bestS) };
}

function classify(k: Koi, p: Sample): Kind | null {
  const hwPx = p.hw * k.length;
  if (p.s <= 0.72) {
    if (hwPx > 0 && Math.abs(p.v) <= hwPx) {
      const a = p.v / hwPx;
      if (k.black.some((patch) => inPatch(patch, p.s, a))) return "black";
      if (k.red.some((patch) => inPatch(patch, p.s, a))) {
        const lit = p.nx * -0.7 + p.ny * -0.7;
        return Math.abs(a) > 0.64 || lit < -0.28 ? "redShade" : "red";
      }
      const lit = p.nx * -0.7 + p.ny * -0.7;
      if (Math.abs(a) > 0.72 || lit < -0.25) return "bodyShade";
      if (hash(Math.round(p.s * 60), Math.round(a * 20), k.seed) < 0.05) return "bodyShade";
      return "body";
    }
  } else if (Math.abs(p.v) <= hwPx) {
    const edge = Math.abs(p.v) > hwPx * 0.72 || p.s > 0.96;
    return edge ? "finShade" : "fin";
  }
  if (inPectoral(p.s, p.v, k.length)) {
    return hash(Math.round(p.s * 80), Math.round(p.v / 10), k.seed) < 0.35 ? "finShade" : "fin";
  }
  return null;
}

class Renderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private cw = 12;
  private ch = 12;
  private font = "";
  private palette: Palette;
  private spine = new Float32Array(N * 2);
  private arc = new Float32Array(N);

  constructor(canvas: HTMLCanvasElement, palette: Palette) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.palette = palette;
  }

  setPalette(palette: Palette) {
    this.palette = palette;
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.cw = clamp(Math.round(width / 100), 8, 11);
    this.ch = this.cw;
    const fontSize = Math.max(7, Math.round(this.cw * 0.72));
    this.font = `600 ${fontSize}px 'Geist Mono Variable', ui-monospace, monospace`;
    const canvas = this.ctx.canvas;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(world: World, rects: Rect[]) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.width >= 500) {
      ctx.strokeStyle = this.palette.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= this.width; x += this.cw) {
        const px = Math.round(x) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, this.height);
      }
      for (let y = 0; y <= this.height; y += this.ch) {
        const py = Math.round(y) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(this.width, py);
      }
      ctx.stroke();
    }
    ctx.font = this.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const k of world.koi) this.drawKoi(k, rects);
    ctx.globalAlpha = 1;
  }

  private drawKoi(k: Koi, rects: Rect[]) {
    const cw = this.cw;
    const ch = this.ch;
    const length = k.length;
    const arcTotal = buildRenderSpine(k, this.spine, this.arc);

    const eye = pointAt(this.spine, this.arc, arcTotal, 0.06);
    const eyeHw = bodyHalfWidth(0.06) * length;
    const eyes = [
      { x: eye.x - eye.ty * eyeHw * 0.62, y: eye.y + eye.tx * eyeHw * 0.62 },
      { x: eye.x + eye.ty * eyeHw * 0.62, y: eye.y - eye.tx * eyeHw * 0.62 },
    ];

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let n = 0; n < N; n++) {
      minX = Math.min(minX, this.spine[n * 2]);
      maxX = Math.max(maxX, this.spine[n * 2]);
      minY = Math.min(minY, this.spine[n * 2 + 1]);
      maxY = Math.max(maxY, this.spine[n * 2 + 1]);
    }
    const pad = length * 0.3;
    const c0 = Math.max(0, Math.floor((minX - pad) / cw));
    const c1 = Math.min(Math.ceil(this.width / cw) - 1, Math.floor((maxX + pad) / cw));
    const r0 = Math.max(0, Math.floor((minY - pad) / ch));
    const r1 = Math.min(Math.ceil(this.height / ch) - 1, Math.floor((maxY + pad) / ch));
    if (c0 > c1 || r0 > r1) return;

    const depthAlpha = 0.55 + 0.45 * k.depth;
    const eyeR = cw * 0.55;
    const corners = [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ];

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x = c * cw;
        const y = r * ch;
        const mx = x + cw / 2;
        const my = y + ch / 2;
        const sample = sampleSpine(this.spine, this.arc, arcTotal, mx, my);
        let kind: Kind | null = null;
        let coverage = 1;

        for (const e of eyes) {
          if ((mx - e.x) ** 2 + (my - e.y) ** 2 < eyeR * eyeR) {
            kind = "eye";
            break;
          }
        }

        if (!kind) {
          kind = classify(k, sample);
          if (kind) {
            const hwPx = sample.hw * length;
            const nearEdge = sample.s < 0.03 || sample.s > 0.97 || Math.abs(sample.v) > hwPx - cw * 0.6;
            if (nearEdge) {
              let hits = 0;
              for (const [fx, fy] of corners) {
                const sp = sampleSpine(this.spine, this.arc, arcTotal, x + fx * cw, y + fy * ch);
                if (classify(k, sp)) hits++;
              }
              coverage = (1 + hits) / 5;
            }
          } else if (sample.d <= length * 0.27 + cw) {
            for (const [fx, fy] of corners) {
              const sp = sampleSpine(this.spine, this.arc, arcTotal, x + fx * cw, y + fy * ch);
              const hit = classify(k, sp);
              if (hit) {
                kind = hit;
                coverage = 0.2;
                break;
              }
            }
          }
        }

        if (!kind) continue;
        this.paintCell(kind, x, y, sample, k, depthAlpha, coverage, rects);
      }
    }
    this.ctx.globalAlpha = 1;
  }

  private paintCell(
    kind: Kind,
    x: number,
    y: number,
    p: Sample,
    k: Koi,
    depthAlpha: number,
    coverage: number,
    rects: Rect[]
  ) {
    const ctx = this.ctx;
    const palette = this.palette;
    const cw = this.cw;
    const ch = this.ch;
    const mx = x + cw / 2;
    const my = y + ch / 2;
    const dim = dimFactor(mx, my, rects, palette.dim);
    let alpha = palette.alpha * depthAlpha * dim;
    if (kind === "fin" || kind === "finShade") alpha *= 0.85;
    if (alpha < 0.02) return;

    const key = Math.round(p.s * 60);
    const key2 = Math.round(p.v / (cw * 0.8));
    const r = hash(key, key2, k.seed);
    const filled = coverage >= 0.5;
    let fill = palette.body;
    let glyphColor = palette.glyphBody;
    let glyph = "";

    switch (kind) {
      case "eye":
        fill = palette.black;
        glyphColor = palette.eye;
        glyph = "o";
        break;
      case "black":
        fill = palette.black;
        glyphColor = palette.glyphBlack;
        glyph = BLACK_GLYPHS[(hash(key, key2, k.seed + 5) * BLACK_GLYPHS.length) | 0];
        break;
      case "red":
      case "redShade":
        fill = kind === "redShade" ? palette.redShade : palette.red;
        glyphColor = palette.glyphRed;
        if (r < 0.3) glyph = RED_GLYPHS[(hash(key, key2, k.seed + 7) * RED_GLYPHS.length) | 0];
        break;
      case "fin":
      case "finShade":
        fill = kind === "finShade" ? palette.finShade : palette.fin;
        glyphColor = palette.glyphFin;
        if (r < 0.3) glyph = FIN_GLYPHS[(hash(key, key2, k.seed + 13) * FIN_GLYPHS.length) | 0];
        break;
      case "bodyShade":
        fill = palette.bodyShade;
        glyphColor = palette.glyphBody;
        if (r < 0.32) glyph = BODY_GLYPHS[(hash(key, key2, k.seed + 3) * BODY_GLYPHS.length) | 0];
        break;
      default:
        fill = palette.body;
        glyphColor = palette.glyphBody;
        if (r < 0.32) glyph = BODY_GLYPHS[(hash(key, key2, k.seed + 3) * BODY_GLYPHS.length) | 0];
        break;
    }

    // The tail tip frays into glyphs instead of solid cells.
    const frayed = kind === "fin" || kind === "finShade" ? p.s > 0.86 && r < 0.18 : false;
    const solid = filled && !frayed;

    if (solid) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
    } else {
      alpha *= 0.55;
      ctx.globalAlpha = alpha;
      if (kind === "black") glyphColor = palette.glyphBlack;
      else if (kind === "red" || kind === "redShade") glyphColor = palette.redShade;
      else if (kind === "fin" || kind === "finShade") glyphColor = palette.finShade;
      else glyphColor = palette.bodyShade;
      glyph = lineGlyph(-p.ny, p.nx);
    }

    if (glyph) {
      ctx.fillStyle = glyphColor;
      ctx.fillText(glyph, mx, my + 1);
    }
  }
}

export class KoiPondEngine {
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private world = new World();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private frames = 0;
  private visible = true;
  private disposed = false;
  private dimRects: Rect[] = [];
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private themeObserver: MutationObserver;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const palette = document.documentElement.classList.contains("dark") ? DARK : LIGHT;
    this.renderer = new Renderer(canvas, palette);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.intersectionObserver.observe(canvas);
    this.themeObserver = new MutationObserver(() => {
      this.renderer.setPalette(document.documentElement.classList.contains("dark") ? DARK : LIGHT);
      this.schedule();
    });
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    this.reduced.addEventListener("change", this.onReduced);
    document.addEventListener("astro:before-swap", this.onBeforeSwap);
    this.resize();
    this.schedule();
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.themeObserver.disconnect();
    this.reduced.removeEventListener("change", this.onReduced);
    document.removeEventListener("astro:before-swap", this.onBeforeSwap);
  }

  private onBeforeSwap = () => this.destroy();

  private resize() {
    if (this.disposed) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.renderer.resize(rect.width, rect.height, Math.min(window.devicePixelRatio || 1, 2));
    this.world.resize(rect.width, rect.height);
    this.measureDims();
    if (this.reduced.matches) this.drawStill();
    else this.schedule();
  }

  private measureDims() {
    const scope = this.canvas.closest("[data-koi-pond]") ?? this.canvas.parentElement;
    if (!scope) return;
    const origin = this.canvas.getBoundingClientRect();
    this.dimRects = Array.from(scope.querySelectorAll("[data-koi-dim]")).map((el) => {
      const b = el.getBoundingClientRect();
      return {
        left: b.left - origin.left - 6,
        top: b.top - origin.top - 6,
        right: b.right - origin.left + 6,
        bottom: b.bottom - origin.top + 6,
      };
    });
  }

  private schedule = () => {
    cancelAnimationFrame(this.raf);
    if (this.disposed || !this.visible) return;
    if (this.reduced.matches) {
      this.drawStill();
      return;
    }
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  };

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= 1 / 60 && steps < 4) {
      this.world.step(1 / 60);
      this.acc -= 1 / 60;
      steps++;
    }
    if (steps === 4) this.acc = 0;
    if (++this.frames % 30 === 0) this.measureDims();
    this.renderer.render(this.world, this.dimRects);
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawStill() {
    if (this.world.time < 4) {
      for (let i = 0; i < 240; i++) this.world.step(1 / 60);
    }
    this.measureDims();
    this.renderer.render(this.world, this.dimRects);
  }

  private onReduced = () => {
    if (this.reduced.matches) this.drawStill();
    else this.schedule();
  };
}
