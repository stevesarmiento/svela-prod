/**
 * Card loading shine.
 *
 * A port of the "copy code" highlight from the Rex docs
 * (superlogical.com/rex/docs, chunk `CCOL13-C.js`): a WebGL fragment shader
 * that models a soft light passing over a glossy, slightly bevelled chip. The
 * tuning constants and the shader source are kept verbatim so the look matches.
 *
 * Rex fires one sweep per click. Here the same sweep is replayed on a fixed
 * period while a card is loading, with a stable per-card phase offset so a
 * grid of cards doesn't flash in unison. The parent "pop" (scale bump) that
 * Rex does on copy is intentionally not ported: it would pulse the card
 * nonstop.
 *
 * One WebGL context is shared by every card. Browsers cap the number of live
 * WebGL contexts, and a grid can exceed it, so each card owns a cheap 2D
 * canvas and the shared GL canvas is drawn into it every frame.
 */

export const SHINE_TUNING = {
  maxPop: 0.016,
  maxShift: 0.1,
  slant: 0.358,
  coreWidth: 1.595,
  bloomWidth: 5.573,
  rimLobeWidth: 10.133,
  spanScale: 0.054,
  coreStrength: 0.3,
  bloomStrength: 0.175,
  rimStrength: 1.016,
  rimGlowWidth: 0.133,
  rimHairline: 0.625,
  rimTopBias: 0.331,
  largeDimming: 0.35,
  largeSlowdown: 1.6,
  lightFillBoost: 1.883,
  flankDeepening: 0.513,
} as const;

/** One sweep, before the large-block slowdown. */
export const BASE_DURATION_MS = 391;
/** Fraction of the sweep during which the light is actually travelling. */
const SHEEN_SPLIT = 0.42;
/** Block sizes (in line heights) between which the slowdown/dimming ramps. */
const SMALL_BLOCK_LINES = 10;
const LARGE_BLOCK_LINES = 70;
/** How often a loading card replays the sweep. */
export const SHINE_PERIOD_MS = 1200;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Where the light is, 0..1, for a sweep `progress` in [0, 1). Returns -1
 * when nothing should be drawn (the tail of the sweep, reserved for the pop).
 */
export function sheenAt(progress: number): number {
  if (!(progress >= 0 && progress < 1)) return -1;
  const span = 2 * Math.min(SHEEN_SPLIT, 1 - SHEEN_SPLIT);
  const a = progress / span;
  return a >= 0 && a <= 1 ? (1 - Math.cos(a * Math.PI)) / 2 : -1;
}

/** Sweep duration for a block of `width` × `height` px at `line` px. */
export function sweepDurationMs(
  width: number,
  height: number,
  line: number,
): number {
  const size = smoothstep(
    SMALL_BLOCK_LINES,
    LARGE_BLOCK_LINES,
    (width + height * SHINE_TUNING.slant + height * 2) / line,
  );
  return BASE_DURATION_MS * (1 + (SHINE_TUNING.largeSlowdown - 1) * size);
}

/** Stable per-card phase offset (FNV-1a 64), matching iOS `CardLoadingPhase`. */
export function phaseOffsetFor(identity: string): number {
  let hash = 14_695_981_039_346_656_037n;
  for (const byte of new TextEncoder().encode(identity)) {
    hash =
      ((hash ^ BigInt(byte)) * 1_099_511_628_211n) & 0xffff_ffff_ffff_ffffn;
  }
  return Number(hash % 1000n) / 1000;
}

const f = (n: number) => n.toFixed(4);

const VERTEX_SHADER = `
attribute vec2 corner;
void main() {
	gl_Position = vec4(corner, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 size;
uniform float line;
uniform float radius;
uniform float sheen;
// How light the block's fill is, from 0 to 1, and the colour its flanks
// deepen towards.
uniform float light_fill;
uniform vec3 tint;

void main() {
	vec2 pixel = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);

	// The block: how far this pixel is outside its rounded edge, negative inside.
	vec2 from_center = pixel - size * 0.5;
	vec2 corner = abs(from_center) - (size * 0.5 - radius);
	float outside = length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - radius;
	float coverage = clamp(0.5 - outside, 0.0, 1.0);

	// The highlight models a soft light passing over a glossy surface rather
	// than a drawn stripe: a slanted Gaussian core inside a wide bloom, with
	// no hard edge anywhere. It leans like "/", so lower rows see it further
	// left and the diagonal coordinate grows with both x and y.
	float slant = ${f(SHINE_TUNING.slant)};
	float diagonal = pixel.x + pixel.y * slant;
	float span = size.x + size.y * slant;

	// Widths follow the block, not just the font. The sweep always takes the
	// same time, so a highlight sized only from the line height would be a
	// thin line racing across a large block.
	float unit = max(line, span * ${f(SHINE_TUNING.spanScale)});
	float core_width = max(unit * ${f(SHINE_TUNING.coreWidth)}, 1.0);
	float bloom_width = max(unit * ${f(SHINE_TUNING.bloomWidth)}, 1.0);
	float rim_width = max(unit * ${f(SHINE_TUNING.rimLobeWidth)}, 1.0);

	// Travel from fully before the block to fully past it, measured by the
	// widest lobe so nothing pops in or out at either end.
	float reach = max(rim_width, bloom_width) * 1.5;
	float offset = diagonal - mix(-reach, span + reach, sheen);

	// The light also fades in and out over the sweep, so a small block, which
	// the highlight crosses in a few frames, still breathes.
	float envelope = smoothstep(0.0, 0.2, sheen) * (1.0 - smoothstep(0.8, 1.0, sheen));

	// A highlight crossing a large block lights far more of the page at once,
	// so it fades towards the dimming floor as the block grows. Edges keep
	// their full light: a rim is thin at any size.
	float calm = mix(1.0, ${f(SHINE_TUNING.largeDimming)},
		smoothstep(${f(SMALL_BLOCK_LINES)}, ${f(LARGE_BLOCK_LINES)}, (span + size.y * 2.0) / line));
	float core = exp(-pow(offset / core_width, 2.0)) * envelope * calm;
	float bloom = exp(-pow(offset / bloom_width, 2.0)) * envelope * calm;
	float rim = exp(-pow(offset / rim_width, 2.0)) * envelope;

	// The block is treated as a glossy, slightly bevelled chip lit from above:
	// edges facing up catch the most light and edges facing down the least.
	// The lit edge is a crisp hairline right at the edge and a softer falloff
	// inside it.
	float depth = max(-outside, 0.0);
	vec2 normal = corner.x > 0.0 && corner.y > 0.0
		? normalize(corner) * sign(from_center)
		: corner.x > corner.y ? vec2(sign(from_center.x), 0.0) : vec2(0.0, sign(from_center.y));
	float top_bias = ${f(SHINE_TUNING.rimTopBias)};
	float facing = (1.0 - top_bias) - top_bias * normal.y;
	float hairline_width = max(line * 0.035, 1.0);
	float glow_width = max(line * ${f(SHINE_TUNING.rimGlowWidth)}, 1.0);
	float edge = facing * mix(exp(-depth / glow_width),
		exp(-depth * depth / (hairline_width * hairline_width)), ${f(SHINE_TUNING.rimHairline)});

	// The surface lifts gently under the highlight while its edges catch far
	// more of it, which is what makes the block read as glossy.
	float edge_light = edge * ${f(SHINE_TUNING.rimStrength)} * (rim * 0.55 + bloom * 0.45);
	float amount = core * ${f(SHINE_TUNING.coreStrength)} + bloom * ${f(SHINE_TUNING.bloomStrength)} + edge_light;

	if (light_fill > 0.5) {
		// A light fill has no headroom for light, so the highlight shows by
		// contrast: its flanks deepen while the core stays clean. The app
		// deepens a fill towards a richer version of its own colour; the
		// docs' panel is white and has none, so it borrows the accent. This
		// is multiplied into the block, which leaves dark text dark.
		float flank = max(bloom - core, 0.0);
		float deepen = clamp(flank * ${f(SHINE_TUNING.flankDeepening)} * light_fill + edge_light, 0.0, 1.0);
		gl_FragColor = vec4(mix(vec3(1.0), tint, deepen), 1.0) * coverage;
	} else {
		// White laid over the block at this alpha is a screen blend, which
		// brightens without clipping and keeps the hue of what it lights.
		amount = clamp(amount * (1.0 + light_fill * ${f(SHINE_TUNING.lightFillBoost)}), 0.0, 1.0);
		gl_FragColor = vec4(amount * coverage);
	}
}`;

type Rgb = [number, number, number];

interface SharedGl {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  uniform: (name: string) => WebGLUniformLocation | null;
}

let shared: SharedGl | null | undefined;

function createSharedGl(): SharedGl | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", {
    antialias: false,
    premultipliedAlpha: true,
  });
  if (!gl) return null;
  const program = gl.createProgram();
  if (!program) return null;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX_SHADER],
    [gl.FRAGMENT_SHADER, FRAGMENT_SHADER],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const corner = gl.getAttribLocation(program, "corner");
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  const locations = new Map<string, WebGLUniformLocation | null>();
  return {
    canvas,
    gl,
    uniform: (name) => {
      if (!locations.has(name))
        locations.set(name, gl.getUniformLocation(program, name));
      return locations.get(name) ?? null;
    },
  };
}

/** The one WebGL context every shine shares. `null` when WebGL is unavailable. */
export function getSharedGl(): SharedGl | null {
  if (shared === undefined || shared?.gl.isContextLost())
    shared = createSharedGl();
  return shared;
}

/** Resolve any CSS colour to 0..1 RGB via a 1×1 canvas. */
export function parseColor(css: string): Rgb {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return [1, 1, 1];
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 255, g = 255, b = 255] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

/** How light a fill is, 0..1, on the same ramp Rex uses. */
export function lightnessOf([r, g, b]: Rgb): number {
  return smoothstep(0.55, 0.85, 0.2126 * r + 0.7152 * g + 0.0722 * b);
}

export interface ShineTarget {
  ctx: CanvasRenderingContext2D;
  /** Device pixels. */
  width: number;
  height: number;
  /** Device pixels. */
  line: number;
  /** Device pixels. */
  radius: number;
  lightFill: number;
  tint: Rgb;
  phaseOffset: number;
  durationMs: number;
}

const targets = new Set<ShineTarget>();
let frame: number | null = null;

function renderTarget(target: ShineTarget, sheen: number, shared: SharedGl) {
  const { gl, canvas, uniform } = shared;
  const { width, height } = target;
  if (canvas.width < width || canvas.height < height) {
    canvas.width = Math.max(canvas.width, width);
    canvas.height = Math.max(canvas.height, height);
  }
  gl.viewport(0, 0, width, height);
  gl.uniform2f(uniform("size"), width, height);
  gl.uniform1f(uniform("line"), target.line);
  gl.uniform1f(uniform("radius"), target.radius);
  gl.uniform1f(uniform("light_fill"), target.lightFill);
  gl.uniform3fv(uniform("tint"), target.tint);
  gl.uniform1f(uniform("sheen"), sheen);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (sheen >= 0) gl.drawArrays(gl.TRIANGLES, 0, 3);

  target.ctx.clearRect(0, 0, width, height);
  if (sheen >= 0) {
    // GL's origin is bottom-left, so the rendered block sits at the bottom of
    // the (possibly larger) shared canvas.
    target.ctx.drawImage(
      canvas,
      0,
      canvas.height - height,
      width,
      height,
      0,
      0,
      width,
      height,
    );
  }
}

function tick(now: number) {
  frame = null;
  const shared = getSharedGl();
  if (!shared) return;
  for (const target of targets) {
    const cycleMs = Math.max(SHINE_PERIOD_MS, target.durationMs);
    const phase = (now / cycleMs + target.phaseOffset) % 1;
    // The sweep itself runs at Rex's real speed; the rest of the cycle is idle.
    const progress = (phase * cycleMs) / target.durationMs;
    renderTarget(target, sheenAt(progress), shared);
  }
  if (targets.size > 0) frame = requestAnimationFrame(tick);
}

/** Start drawing the shine into `target`. Returns a function that stops it. */
export function registerShineTarget(target: ShineTarget): () => void {
  targets.add(target);
  if (frame === null) frame = requestAnimationFrame(tick);
  return () => {
    targets.delete(target);
    target.ctx.clearRect(0, 0, target.width, target.height);
    if (targets.size === 0 && frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };
}
