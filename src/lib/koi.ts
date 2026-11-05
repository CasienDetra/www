// Motion model inspired by stackedlol/ascii-sharks (MIT, © 2026 drewdi):
// a follow-the-leader spine with a bend limit per joint. The head steers and
// the body trails the path, so a koi arcs through a turn instead of pivoting
// around its nose.
//
// Motion pass: eased turning (angular velocity with inertia), tail-beat surge,
// speed that drops in tight turns, turn-coupled body bend, glide/burst tail
// amplitude, independently sculling pectoral fins, correlated wandering,
// subtle pond currents, individual swimming personalities, smoother
// variable-timestep stepping, and body-aware avoidance between koi.

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
  food: string;
  ripple: string;
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
  food: "#e8b15a",
  ripple: "#a9c0d0",
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
  food: "#a86a2a",
  ripple: "#6f7c85",
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
  /** Turn rate in rad/s (positive = clockwise on screen). Has inertia. */
  angVel: number;
  /** Smoothed turn rate used to bend the body into a turn. */
  turn: number;
  speed: number;
  phase: number;
  /** Tail-beat amplitude multiplier (glide/burst, bigger in turns). */
  amp: number;
  /** Pectoral fin flare per side: finPos is the v > 0 side, finNeg the v < 0 side. */
  finPos: number;
  finNeg: number;
  finPhase: number;
  /** Independent fin-stroke offset so both pectoral fins do not mirror perfectly. */
  finOffset: number;
  /** Slowly changing steering offset; smoothed to avoid twitchy random motion. */
  wanderAngle: number;
  /** Per-fish movement personality and timing. */
  temperament: number;
  swimOffset: number;
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
type Food = { x: number; y: number; vx: number; vy: number; glyph: string; born: number };
type Ripple = { x: number; y: number; born: number };

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
  if (s < 0.62) return 0.13 - 0.02 * smoothstep(0.56, 0.62, s);
  if (s < 0.7) return 0.11 - 0.08 * smoothstep(0.62, 0.7, s);
  // Butterfly tail: fans out from the stalk, with a V notch in the trailing edge.
  return 0.03 + 0.15 * Math.pow(smoothstep(0.7, 1, s), 0.8);
}

function inTailNotch(s: number, v: number, length: number) {
  if (s <= 0.88) return false;
  const u = (s - 0.88) / 0.12;
  return Math.abs(v) < u * 0.06 * length;
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

/** `flare` stretches the fins sideways: >1 is held out, <1 is tucked in. */
function inPectoral(s: number, v: number, length: number, flare: number) {
  const u = s * length;
  const a = Math.abs(v);
  return (
    inTriangle(u, a, length * 0.16, 0, length * 0.29, 0, length * 0.31, length * 0.28 * flare) ||
    inTriangle(u, a, length * 0.46, 0, length * 0.55, 0, length * 0.58, length * 0.22 * flare)
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

/** Spine nodes of other koi that a koi should steer around (head, mid, tail base). */
const AVOID_NODES = [0, 6, 12];

class World {
  width = 0;
  height = 0;
  time = 0;
  koi: Koi[] = [];
  food: Food[] = [];
  ripples: Ripple[] = [];

  feed(x: number, y: number) {
    if (this.width < 1 || this.height < 1) return;
    const cx = clamp(x, 0, this.width);
    const cy = clamp(y, 0, this.height);
    const glyphs = ["*", "+", "'", ",", '"'];
    // A handful of flakes, not one pellet: scatter them across the surface.
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * TAU;
      const rad = Math.sqrt(Math.random()) * 55;
      const sp = 6 + Math.random() * 16;
      this.food.push({
        x: cx + Math.cos(a) * rad,
        y: cy + Math.sin(a) * rad * 0.75,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.75,
        glyph: glyphs[(Math.random() * glyphs.length) | 0],
        born: this.time,
      });
    }
    if (this.food.length > 64) this.food.splice(0, this.food.length - 64);
    this.ripples.push({ x: cx, y: cy, born: this.time });
    if (this.ripples.length > 4) this.ripples.shift();
  }

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
        angVel: 0,
        turn: 0,
        speed: 26 + r() * 10,
        phase: r() * TAU,
        amp: 1,
        finPos: 1,
        finNeg: 1,
        finPhase: r() * TAU,
        finOffset: r() * 1.4,
        wanderAngle: (r() - 0.5) * 0.25,
        temperament: 0.84 + r() * 0.32,
        swimOffset: r() * TAU,
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

    if (this.food.length) {
      for (const f of this.food) {
        f.x = clamp(f.x + f.vx * dt, 4, W - 4);
        f.y = clamp(f.y + f.vy * dt, 4, H - 4);
        const drag = Math.exp(-dt * 1.6);
        f.vx *= drag;
        f.vy *= drag;
      }
      if (this.food.some((f) => this.time - f.born > 18)) {
        this.food = this.food.filter((f) => this.time - f.born <= 18);
      }
    }
    if (this.ripples.some((r) => this.time - r.born > 2)) {
      this.ripples = this.ripples.filter((r) => this.time - r.born <= 2);
    }
    const cx = W / 2;
    const cy = H / 2;

    for (const k of this.koi) {
      const headX = k.nodes[0];
      const headY = k.nodes[1];
      const seedPhase = k.seed % 1000;
      let dx = Math.cos(k.heading);
      let dy = Math.sin(k.heading);

      // The nearest pellet is the one worth chasing.
      let food: Food | null = null;
      let foodD = Infinity;
      for (const f of this.food) {
        const d = Math.hypot(f.x - headX, f.y - headY);
        if (d < foodD) {
          foodD = d;
          food = f;
        }
      }

      // Correlated wander: each fish slowly changes its preferred direction.
      // Unlike frame-to-frame randomness, this has memory and feels deliberate.
      const wanderTarget =
        0.34 * Math.sin(this.time * 0.13 + k.swimOffset) +
        0.16 * Math.sin(this.time * 0.071 + seedPhase * 0.017);
      k.wanderAngle += (wanderTarget - k.wanderAngle) * Math.min(1, dt * 0.42);
      dx += Math.cos(k.heading + k.wanderAngle) * 0.58;
      dy += Math.sin(k.heading + k.wanderAngle) * 0.58;

      // A subtle drifting pond current gives the whole school a shared
      // environmental influence without pulling every koi in the same direction.
      const currentX = Math.sin(this.time * 0.075 + headY * 0.002) * 0.12;
      const currentY = Math.cos(this.time * 0.061 + headX * 0.0017) * 0.10;
      dx += currentX;
      dy += currentY;

      // Food overrides the patrol urge: head straight for the nearest pellet.
      if (food) {
        const fx = food.x - headX;
        const fy = food.y - headY;
        const fd = Math.hypot(fx, fy) || 1;
        dx += (fx / fd) * 7;
        dy += (fy / fd) * 7;
      }

      // Patrol an ellipse around the pond.
      const ex = (headX - cx) / k.orbitRx;
      const ey = (headY - cy) / k.orbitRy;
      const er = Math.hypot(ex, ey) || 1;
      const radial = clamp((1 - er) * 1.5, -1, 1);
      dx += ((-ey / er) * k.orbitDir + (ex / er) * radial * 0.8) * 0.6;
      dy += ((ex / er) * k.orbitDir + (ey / er) * radial * 0.8) * 0.6;

      // Give the other koi room: steer away from their head, belly and tail,
      // not just the snout, so nobody swims through another fish's body.
      for (const o of this.koi) {
        if (o === k) continue;
        const range = (k.length + o.length) * 0.2;
        for (const idx of AVOID_NODES) {
          const ox = o.nodes[idx * 2] - headX;
          const oy = o.nodes[idx * 2 + 1] - headY;
          const d = Math.hypot(ox, oy);
          if (d < range && d > 1e-3) {
            const w = (1 - d / range) * 1.6;
            dx -= (ox / d) * w;
            dy -= (oy / d) * w;
          }
        }
      }

      // Soft walls.
      if (headX < margin) dx += (1 - headX / margin) * 2.4;
      if (headX > W - margin) dx -= (1 - (W - headX) / margin) * 2.4;
      if (headY < margin) dy += (1 - headY / margin) * 2.4;
      if (headY > H - margin) dy -= (1 - (H - headY) / margin) * 2.4;

      const desired = Math.atan2(dy, dx);

      // A koi cannot pivot, and it cannot snap into a turn either: the turn
      // rate is capped AND eased, so turns wind up, arc, and unwind.
      const maxTurn = (0.55 + 10 / k.length) * (food ? 2 : 1); // rad/s
      const err = angleDiff(k.heading, desired);
      const targetVel = clamp(err * 1.6, -maxTurn, maxTurn);
      k.angVel += (targetVel - k.angVel) * Math.min(1, dt * 2.2);
      k.heading += k.angVel * dt;
      k.turn += (k.angVel - k.turn) * Math.min(1, dt * 3);
      const turnFrac = Math.min(1, Math.abs(k.angVel) / maxTurn);

      // Fish slow down in tight turns.
      const cruise = (26 + 10 * (k.length / 360)) * k.temperament;
      // Longer, softer burst-and-glide cycles. The two smooth envelopes keep
      // acceleration gradual instead of making the fish pulse mechanically.
      const swimCycle = 0.5 + 0.5 * Math.sin(this.time * 0.18 + k.swimOffset);
      const burst = smoothstep(0.70, 0.96, swimCycle);
      const coast = 1 - smoothstep(0.18, 0.48, swimCycle);
      const feeding = food !== null;
      const target =
        cruise * (0.96 + 0.20 * burst - 0.10 * coast) * (1 - 0.30 * turnFrac) * (feeding ? 3.2 : 1);
      const rate = feeding ? dt * 5 : dt * (0.72 + 0.12 * k.temperament);
      k.speed += (target - k.speed) * Math.min(1, rate);

      // Tail beat: faster with speed and in turns. Each half-beat gives a
      // small forward surge, so the fish pulses along instead of gliding evenly.
      k.phase += dt * (2.2 + k.speed * 0.05 + turnFrac * 0.8);
      const surge = 1 + 0.08 * Math.cos(2 * k.phase + 0.6);
      const v = k.speed * surge;

      // Burst and coast: the tail works harder in slow pulses and in turns.
      const tailCycle = 0.5 + 0.5 * Math.sin(this.time * 0.18 + k.swimOffset);
      const tailBurst = smoothstep(0.64, 0.96, tailCycle);
      // During a feeding burst the tail locks straight instead of beating.
      const ampTarget = feeding ? 0.03 : 0.76 + 0.28 * tailBurst + 0.34 * turnFrac;
      k.amp += (ampTarget - k.amp) * Math.min(1, dt * (feeding ? 6 : 1.5));

      // Pectoral fins: gentle sculling, held out when slow, and the fin on
      // the inside of a turn flares out like a brake.
      k.finPhase += dt * (1.35 + k.speed * 0.012 + 0.65 * turnFrac);
      const slowFlare = 0.22 * clamp(1 - k.speed / 42, 0, 1);
      const finBasePos =
        0.94 + slowFlare +
        0.10 * Math.sin(k.finPhase) +
        0.045 * Math.sin(k.finPhase * 2 + k.finOffset);
      const finBaseNeg =
        0.94 + slowFlare +
        0.10 * Math.sin(k.finPhase + 1.05 + k.finOffset) +
        0.045 * Math.sin(k.finPhase * 2 + 2.1);
      const posTurn = Math.max(0, -k.angVel) / maxTurn; // left turn -> left fin (v > 0)
      const negTurn = Math.max(0, k.angVel) / maxTurn; // right turn -> right fin (v < 0)
      const finRate = Math.min(1, dt * 3.6);
      k.finPos += (clamp(finBasePos + 0.28 * posTurn, 0.82, 1.34) - k.finPos) * finRate;
      k.finNeg += (clamp(finBaseNeg + 0.28 * negTurn, 0.82, 1.34) - k.finNeg) * finRate;

      k.nodes[0] = clamp(headX + Math.cos(k.heading) * v * dt, -k.length * 0.3, W + k.length * 0.3);
      k.nodes[1] = clamp(headY + Math.sin(k.heading) * v * dt, -k.length * 0.3, H + k.length * 0.3);

      if (food && Math.hypot(food.x - k.nodes[0], food.y - k.nodes[1]) < k.length * 0.18) {
        const eaten = this.food.indexOf(food);
        if (eaten >= 0) this.food.splice(eaten, 1);
      }

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
  // Lateral offset at body position s: travelling tail wave, plus an extra
  // bend into the direction of the turn that grows toward the tail.
  // (+offset = fish's right, matching positive turn rate.)
  const offAt = (s: number) => {
    const tailWeight = Math.pow(s, 1.8);
    const travellingWave =
      k.length * 0.055 * (0.14 + 0.48 * tailWeight) *
      swim * k.amp * Math.sin(k.phase - s * 5.4);
    const secondaryWave =
      k.length * 0.008 * tailWeight * Math.sin(k.phase * 0.5 - s * 2.1 + k.swimOffset);
    const turnBend = k.turn * k.length * 0.06 * Math.pow(s, 1.6);
    return travellingWave + secondaryWave + turnBend;
  };

  for (let n = 0; n < N; n++) {
    const s = n / (N - 1);
    const a = Math.max(0, n - 1);
    const b = Math.min(N - 1, n + 1);
    let tx = k.nodes[a * 2] - k.nodes[b * 2];
    let ty = k.nodes[a * 2 + 1] - k.nodes[b * 2 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const off = offAt(s);
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
    const off = offAt(s);
    const dist = (n - tb) * seg;
    const tx2 = bx + btx * dist - bty * off;
    const ty2 = by + bty * dist + btx * off;
    const blend = 1;
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

function tailCoords(
  base: { x: number; y: number; tx: number; ty: number },
  x: number,
  y: number
) {
  const dx = x - base.x;
  const dy = y - base.y;
  return { u: dx * base.tx + dy * base.ty, v: dx * -base.ty + dy * base.tx };
}

function tailSampleAt(
  base: { x: number; y: number; tx: number; ty: number },
  tailLen: number,
  u: number,
  v: number,
  length: number,
  cw: number
): Sample | null {
  // The peduncle is thinner than one cell, so let the fan start one cell
  // inside the body and keep it at least ~1.2 cells wide. Otherwise the stalk
  // can fall between glyph rows and the fan reads as detached.
  if (u < -cw || u > tailLen) return null;
  const s = clamp(0.7 + (u / tailLen) * 0.3, 0.7, 1);
  const hwPx = Math.max(bodyHalfWidth(s) * length, cw * 0.6);
  if (Math.abs(v) > hwPx) return null;
  if (inTailNotch(s, v, length)) return null;
  const sign = v >= 0 ? 1 : -1;
  return { s, v, d: Math.abs(v), nx: -base.ty * sign, ny: base.tx * sign, hw: hwPx / length };
}

function classify(k: Koi, p: Sample): Kind | null {
  const hwPx = p.hw * k.length;
  if (p.s <= 0.7) {
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
  if (inPectoral(p.s, p.v, k.length, p.v < 0 ? k.finNeg : k.finPos)) {
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
  private foodFont = "";
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
    this.foodFont = `600 ${Math.max(11, Math.round(this.cw * 1.25))}px 'Geist Mono Variable', ui-monospace, monospace`;
    const canvas = this.ctx.canvas;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(world: World, rects: Rect[]) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    // the grid behind the koi
    // if (this.width >= 500) {
    //   ctx.strokeStyle = this.palette.grid;
    //   ctx.lineWidth = 1;
    //   ctx.beginPath();
    //   for (let x = 0; x <= this.width; x += this.cw) {
    //     const px = Math.round(x) + 0.5;
    //     ctx.moveTo(px, 0);
    //     ctx.lineTo(px, this.height);
    //   }
    //   for (let y = 0; y <= this.height; y += this.ch) {
    //     const py = Math.round(y) + 0.5;
    //     ctx.moveTo(0, py);
    //     ctx.lineTo(this.width, py);
    //   }
    //   ctx.stroke();
    // }
    ctx.font = this.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (world.ripples.length) this.drawRipples(world.ripples, world.time);
    for (const k of world.koi) this.drawKoi(k, rects);
    if (world.food.length) this.drawFood(world.food);
    ctx.globalAlpha = 1;
  }

  private drawRipples(ripples: Ripple[], time: number) {
    const ctx = this.ctx;
    ctx.font = this.foodFont;
    ctx.fillStyle = this.palette.ripple;
    for (const r of ripples) {
      for (let ring = 0; ring < 2; ring++) {
        const p = (time - r.born - ring * 0.16) / 1.7;
        if (p <= 0 || p >= 1) continue;
        const radius = 8 + p * 95;
        const n = Math.max(10, Math.floor(radius * 0.38));
        ctx.globalAlpha = (1 - p) * (ring ? 0.24 : 0.5);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          const glyph = Math.cos(a) < 0 ? "(" : ")";
          ctx.fillText(glyph, r.x + Math.cos(a) * radius, r.y + Math.sin(a) * radius);
        }
      }
    }
    ctx.font = this.font;
  }

  private drawFood(food: Food[]) {
    const ctx = this.ctx;
    ctx.font = this.foodFont;
    ctx.fillStyle = this.palette.food;
    ctx.globalAlpha = 1;
    for (const f of food) ctx.fillText(f.glyph, f.x, f.y);
  }

  private drawKoi(k: Koi, rects: Rect[]) {
    const cw = this.cw;
    const ch = this.ch;
    const length = k.length;
    const arcTotal = buildRenderSpine(k, this.spine, this.arc);
    const tailBase = pointAt(this.spine, this.arc, arcTotal, 0.7);
    const tailLen = arcTotal * 0.3;

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
    // Wider than before: flared pectoral fins reach further from the spine.
    const pad = length * 0.38;
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
        const tc = tailCoords(tailBase, mx, my);
        const tail = tailSampleAt(tailBase, tailLen, tc.u, tc.v, length, cw);
        const sample = tail ?? sampleSpine(this.spine, this.arc, arcTotal, mx, my);
        let kind: Kind | null = null;
        let coverage = 1;

        for (const e of eyes) {
          if ((mx - e.x) ** 2 + (my - e.y) ** 2 < eyeR * eyeR) {
            kind = "eye";
            break;
          }
        }

        if (!kind && tail) {
          kind = Math.abs(tail.v) > tail.hw * length * 0.72 || tail.s > 0.96 ? "finShade" : "fin";
        }

        // The tail is owned entirely by tailSampleAt: don't let the spine
        // classifier backfill its notch or cap cells past the trailing edge.
        if (!kind && sample.s <= 0.7) {
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
          } else if (sample.d <= length * 0.36 + cw) {
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

  /** Drop a pellet at viewport coordinates. */
  feed(clientX: number, clientY: number) {
    if (this.disposed) return;
    const rect = this.canvas.getBoundingClientRect();
    this.world.feed(clientX - rect.left, clientY - rect.top);
    if (this.reduced.matches) this.drawStill();
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
    this.raf = requestAnimationFrame(this.frame);
  };

  private frame = (now: number) => {
    // Step by the real elapsed time (split into <= 1/60 s slices) rather than
    // a fixed 60 Hz accumulator, so motion stays smooth on 90/120/144 Hz
    // displays instead of stuttering from uneven step counts per frame.
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const steps = Math.max(1, Math.ceil(dt * 60));
    for (let i = 0; i < steps; i++) this.world.step(dt / steps);
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
