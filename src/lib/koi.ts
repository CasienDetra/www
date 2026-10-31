type KoiPalette = {
  body: string;
  fin: string;
  red: string;
  black: string;
  eye: string;
  alpha: number;
  dim: number;
};

const DARK: KoiPalette = {
  body: "#ece4da",
  fin: "#d6cec6",
  red: "#f06a3a",
  black: "#5c5a6c",
  eye: "#14141a",
  alpha: 0.72,
  dim: 0.18,
};

const LIGHT: KoiPalette = {
  body: "#706c68",
  fin: "#8a847e",
  red: "#cc3e1c",
  black: "#24212a",
  eye: "#18161a",
  alpha: 0.78,
  dim: 0.2,
};

const TAU = Math.PI * 2;
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
  x: number;
  y: number;
  heading: number;
  speed: number;
  phase: number;
  wander: number;
  depth: number;
  depthPhase: number;
  seed: number;
  red: Patch[];
  black: Patch[];
};

type Rect = { left: number; top: number; right: number; bottom: number };
type Glyph = { ch: string; x: number; y: number };

const VARIETIES: Variety[] = ["kohaku", "sanke", "tancho", "kohaku", "sanke"];

function markings(variety: Variety, seed: number) {
  const r = rng(seed);
  const red: Patch[] = [];
  const black: Patch[] = [];
  if (variety === "tancho") {
    red.push({ s: 0.11, a: 0, rs: 0.07, ra: 0.7 });
    return { red, black };
  }
  if (r() < 0.8) {
    red.push({
      s: 0.1 + r() * 0.03,
      a: (r() - 0.5) * 0.12,
      rs: 0.06 + r() * 0.02,
      ra: 0.7 + r() * 0.2,
    });
  }
  const saddles = 2 + Math.floor(r() * 2);
  for (let i = 0; i < saddles; i++) {
    red.push({
      s: 0.26 + (0.4 / saddles) * (i + 0.5) + (r() - 0.5) * 0.04,
      a: (r() - 0.5) * 0.2,
      rs: 0.06 + r() * 0.03,
      ra: 0.55 + r() * 0.25,
    });
  }
  if (variety === "sanke") {
    const spots = 4 + Math.floor(r() * 4);
    for (let i = 0; i < spots; i++) {
      black.push({
        s: 0.2 + r() * 0.5,
        a: (r() - 0.5) * 0.9,
        rs: 0.025,
        ra: 0.15 + r() * 0.1,
      });
    }
  }
  return { red, black };
}

function bodyHalfWidth(t: number) {
  if (t < 0.1) return 0.105 * Math.pow(Math.sin((t / 0.1) * (Math.PI / 2)), 0.35);
  if (t < 0.3) return 0.105 + 0.04 * smoothstep(0.1, 0.3, t);
  if (t < 0.72) return 0.145 - 0.105 * smoothstep(0.3, 0.72, t);
  return 0.04 + 0.11 * smoothstep(0.72, 1, t);
}

function lineGlyph(dx: number, dy: number) {
  const d = Math.hypot(dx, dy) || 1;
  if (Math.abs(dy) < 0.38 * d) return "-";
  if (Math.abs(dx) < 0.38 * d) return "|";
  return dx * dy > 0 ? "\\" : "/";
}

function glyphFor(t: number, a: number, k: Koi) {
  const edge = Math.abs(a);
  if (t > 0.72) {
    if (edge > 0.9) return a > 0 ? "\\" : "/";
    const r = hash(k.seed ^ 0x51ed270b, Math.round(t * 60), Math.round(a * 12));
    return r < 0.3 ? "t" : r < 0.55 ? "%" : r < 0.8 ? "S" : "X";
  }
  const r = hash(k.seed, Math.round(t * 60), Math.round(a * 12));
  if (edge > 0.88) return r < 0.5 ? "S" : "X";
  if (edge > 0.62) return r < 0.5 ? "8" : r < 0.8 ? "%" : "@";
  return r < 0.45 ? "@" : r < 0.7 ? "#" : r < 0.9 ? "%" : "&";
}

function inPatch(p: Patch, s: number, a: number) {
  return ((s - p.s) / p.rs) ** 2 + ((a - p.a) / p.ra) ** 2 < 1;
}

function colorFor(t: number, a: number, k: Koi, palette: KoiPalette) {
  if (k.black.some((p) => inPatch(p, t, a))) return palette.black;
  if (k.red.some((p) => inPatch(p, t, a))) return palette.red;
  if (t > 0.72) return palette.fin;
  return palette.body;
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
        k.x = clamp(k.x, 24, width - 24);
        k.y = clamp(k.y, 24, height - 24);
      }
    }
  }

  private seed() {
    const minSide = Math.min(this.width, this.height);
    const base = clamp(minSide * 0.36, 130, 300);
    const count = clamp(Math.round((this.width * this.height) / 190000), 3, 5);
    const r = rng(0x9e3779b9 ^ Math.round(this.width * 7 + this.height * 13));
    this.koi = [];
    for (let i = 0; i < count; i++) {
      const id = i + 1;
      const seed = (id * 2654435761) % 4294967296;
      const length = base * (0.72 + r() * 0.42);
      const variety = VARIETIES[i % VARIETIES.length];
      const { red, black } = markings(variety, seed);
      this.koi.push({
        length,
        x: this.width * (0.18 + r() * 0.64),
        y: this.height * (0.16 + r() * 0.68),
        heading: r() * TAU,
        speed: 24 + r() * 8,
        phase: r() * TAU,
        wander: r() * TAU,
        depth: r(),
        depthPhase: r() * TAU,
        seed,
        red,
        black,
      });
    }
  }

  step(dt: number) {
    this.time += dt;
    const { width: W, height: H } = this;
    const margin = Math.min(W, H) * 0.16;
    for (const k of this.koi) {
      k.wander += dt * (0.35 + 0.2 * Math.sin(k.seed));
      let sx = Math.cos(k.heading + Math.sin(k.wander) * 0.75);
      let sy = Math.sin(k.heading + Math.sin(k.wander) * 0.75);
      if (k.x < margin) sx += ((margin - k.x) / margin) * 2.2;
      if (k.x > W - margin) sx -= ((k.x - (W - margin)) / margin) * 2.2;
      if (k.y < margin) sy += ((margin - k.y) / margin) * 2.2;
      if (k.y > H - margin) sy -= ((k.y - (H - margin)) / margin) * 2.2;
      const want = Math.atan2(sy, sx);
      k.heading += angleDiff(k.heading, want) * Math.min(1, dt * 1.4);
      const target = 20 + 9 * Math.sin(this.time * 0.22 + k.seed) + 5 * Math.sin(this.time * 0.11 + k.seed * 0.5);
      k.speed += (target - k.speed) * Math.min(1, dt * 0.7);
      k.x = clamp(k.x + Math.cos(k.heading) * k.speed * dt, 20, W - 20);
      k.y = clamp(k.y + Math.sin(k.heading) * k.speed * dt, 20, H - 20);
      k.phase += dt * (2 + k.speed * 0.045);
      k.depthPhase += dt * 0.12;
      k.depth = 0.5 + 0.5 * Math.sin(k.depthPhase);
    }
  }
}

class Renderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private font = "";
  private fontSize = 10;
  private palette: KoiPalette;

  constructor(canvas: HTMLCanvasElement, palette: KoiPalette) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.palette = palette;
  }

  setPalette(palette: KoiPalette) {
    this.palette = palette;
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.fontSize = width < 500 ? 10 : 12;
    this.font = `500 ${this.fontSize}px 'Geist Mono Variable', ui-monospace, monospace`;
    const canvas = this.ctx.canvas;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(world: World, rects: Rect[]) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.font = this.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const buckets = new Map<string, Glyph[]>();
    for (const k of world.koi) this.build(k, buckets, rects);
    for (const [key, glyphs] of buckets) {
      const [color, alpha] = key.split("|");
      ctx.globalAlpha = Number(alpha);
      ctx.fillStyle = color;
      for (const g of glyphs) ctx.fillText(g.ch, g.x, g.y);
    }
    ctx.globalAlpha = 1;
  }

  private build(k: Koi, buckets: Map<string, Glyph[]>, rects: Rect[]) {
    const N = 18;
    const seg = k.length / (N - 1);
    const nodes: { x: number; y: number; t: number; tx: number; ty: number }[] = [];
    const amp = k.length * (0.018 + 0.018 * Math.min(1, k.speed / 36));
    for (let n = 0; n < N; n++) {
      const t = n / (N - 1);
      const lateral = Math.sin(k.phase - n * 0.52) * amp * Math.pow(t, 1.8);
      const px = k.x - Math.cos(k.heading) * seg * n - Math.sin(k.heading) * lateral;
      const py = k.y - Math.sin(k.heading) * seg * n + Math.cos(k.heading) * lateral;
      nodes.push({ x: px, y: py, t, tx: Math.cos(k.heading), ty: Math.sin(k.heading) });
    }
    for (let n = 0; n < N; n++) {
      const a = nodes[Math.max(0, n - 1)];
      const b = nodes[Math.min(N - 1, n + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      nodes[n].tx = dx / d;
      nodes[n].ty = dy / d;
    }
    const spineAt = (t: number) => {
      const f = t * (N - 1);
      const i = Math.min(N - 2, Math.floor(f));
      const u = f - i;
      const a = nodes[i];
      const b = nodes[i + 1];
      return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        tx: a.tx + (b.tx - a.tx) * u,
        ty: a.ty + (b.ty - a.ty) * u,
      };
    };
    const baseAlpha = this.palette.alpha * (0.55 + 0.45 * k.depth);
    const add = (x: number, y: number, ch: string, color: string, alpha: number) => {
      const a = Math.round(alpha * dimFactor(x, y, rects, this.palette.dim) * 20) / 20;
      if (a < 0.04) return;
      const key = `${color}|${a}`;
      let list = buckets.get(key);
      if (!list) {
        list = [];
        buckets.set(key, list);
      }
      list.push({ ch, x, y });
    };

    const step = this.fontSize * 0.6;
    const rows = Math.max(12, Math.ceil(k.length / step));
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const p = spineAt(t);
      const nx = -p.ty;
      const ny = p.tx;
      const hw = bodyHalfWidth(t) * k.length;
      const cols = Math.max(1, Math.ceil(hw / step));
      for (let j = -cols; j <= cols; j++) {
        const a = j / cols;
        if (t > 0.84 && Math.abs(a) < ((t - 0.84) / 0.16) * 0.55) continue;
        const color = colorFor(t, a, k, this.palette);
        add(
          p.x + nx * a * hw,
          p.y + ny * a * hw,
          glyphFor(t, a, k),
          color,
          color === this.palette.red ? baseAlpha * 1.4 : baseAlpha
        );
      }
    }

    const finT = 0.19;
    const fp = spineAt(finT);
    const fnx = -fp.ty;
    const fny = fp.tx;
    const fhw = bodyHalfWidth(finT) * k.length;
    for (const side of [-1, 1]) {
      for (let u = 0; u < 3; u++) {
        for (let v = 0; v < 4; v++) {
          const rayX = fp.tx * 0.5 + fnx * side * 0.8;
          const rayY = fp.ty * 0.5 + fny * side * 0.8;
          add(
            fp.x + fp.tx * (u * 5) + fnx * side * (fhw + 2 + v * 6),
            fp.y + fp.ty * (u * 5) + fny * side * (fhw + 2 + v * 6),
            lineGlyph(rayX, rayY),
            this.palette.fin,
            baseAlpha * 0.7
          );
        }
      }
    }

    const eyeT = 0.075;
    const ep = spineAt(eyeT);
    const ehw = bodyHalfWidth(eyeT) * k.length;
    for (const side of [-1, 1]) {
      add(
        ep.x - ep.ty * side * ehw * 0.62,
        ep.y + ep.tx * side * ehw * 0.62,
        "o",
        this.palette.eye,
        baseAlpha * 1.1
      );
    }

    const head = spineAt(0);
    const hnx = -head.ty;
    const hny = head.tx;
    for (const side of [-1, 1]) {
      for (let i = 1; i <= 3; i++) {
        add(
          head.x - head.tx * (i * 3) + hnx * side * (3 + i * 2.5),
          head.y - head.ty * (i * 3) + hny * side * (3 + i * 2.5),
          side > 0 ? "'" : "`",
          this.palette.fin,
          baseAlpha * 0.7
        );
      }
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
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.world.step(dt);
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
