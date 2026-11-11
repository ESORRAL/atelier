import { useEffect, useRef } from "react";

// Animated WebGL "eclipse" shader, adapted from GradFlow (https://gradflow.meerbahadin.dev).
// Colors are CSS variable names (tokens), read at mount and again when the theme changes.

export interface BlackHoleProps {
  /** Token of the corona around the disc. */
  color1?: string;
  /** Token of the sky, and the disc itself. */
  color2?: string;
  /** Token of the hot rim. */
  color3?: string;
  /** Animation speed. 0 freezes it. */
  speed?: number;
  /** Size of the disc. Higher is smaller. */
  scale?: number;
  /** Film grain, 0 to 0.5. */
  noise?: number;
  /** Disc center in the canvas, 0..1 from the bottom-left corner. */
  center?: [number, number];
  /** Render resolution, 0.25 to 1. Lower is cheaper; fine for a soft background. */
  quality?: number;
  /** Frame cap, 0 for none. */
  maxFps?: number;
  className?: string;
}

const VERTEX = `
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT = `
  precision highp float;

  uniform float u_time;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform vec3 u_color3;
  uniform float u_scale;
  uniform float u_noise;
  uniform vec2 u_resolution;
  uniform vec2 u_center;
  varying vec2 vUv;

  float grain(vec2 st) {
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec2 centered(vec2 uv) {
    vec2 p = uv - u_center;
    p.x *= u_resolution.x / max(u_resolution.y, 1.0);
    return p;
  }

  // a dark disc with a crisp bright rim and a long soft corona; one side burns brighter, and it drifts.
  vec3 shade(vec2 uv, float time) {
    vec2 p = centered(uv) * 2.0;
    float t = time * 0.6;

    float r = length(p);
    float a = atan(p.y, p.x);
    float radius = 0.58 / sqrt(max(u_scale, 0.05));

    float wobble = 0.007 * sin(a * 3.0 + t * 0.7) + 0.004 * sin(a * 5.0 - t * 0.5);
    float d = r - radius - wobble;
    float away = max(d, 0.0);

    float arc = 0.5 + 0.5 * cos(a - t * 0.35 - 1.2);
    arc *= arc;

    float outside = smoothstep(-0.05, 0.0, d);
    float corona = exp(-away * (6.5 - 4.0 * arc)) * outside;
    float rim = exp(-abs(d) * 46.0);
    float flare = exp(-away * 2.2) * arc * outside;

    vec3 color = u_color2 * (1.0 - 0.45 * smoothstep(0.0, 1.8, r));
    color *= mix(0.4, 1.0, smoothstep(-0.3, 0.02, d));

    color += u_color1 * (corona * (0.5 + 0.5 * arc) + flare * 0.35);
    color += u_color3 * (rim * (0.35 + 0.65 * arc) + corona * corona * arc * 0.55);

    return clamp(color, 0.0, 1.0);
  }

  void main() {
    vec3 color = shade(vUv, u_time);
    if (u_noise > 0.001) {
      float g = grain(vUv * 200.0 + u_time * 0.1);
      color *= 1.0 - u_noise * 0.4 + u_noise * g * 0.4;
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Reads a color token (hex as written in tokens.css) as 0..1 RGB. */
function tokenToVec3(name: string): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

export function BlackHole({
  color1 = "--color-accent",
  color2 = "--color-bg-base",
  color3 = "--color-accent-hover",
  speed = 0.6,
  scale = 1.2,
  noise = 0.1,
  center = [0.5, 0.5],
  quality = 1,
  maxFps = 0,
  className,
}: BlackHoleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The draw loop reads the latest props from here, so changing one never rebuilds the program.
  const props = useRef({ color1, color2, color3, speed, scale, noise, center, quality, maxFps });
  props.current = { color1, color2, color3, speed, scale, noise, center, quality, maxFps };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return; // shortcut: no WebGL means an empty canvas, the parent's background shows instead

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const u = {
      time: uniform("u_time"),
      color1: uniform("u_color1"),
      color2: uniform("u_color2"),
      color3: uniform("u_color3"),
      scale: uniform("u_scale"),
      noise: uniform("u_noise"),
      resolution: uniform("u_resolution"),
      center: uniform("u_center"),
    };

    let colors = [tokenToVec3(color1), tokenToVec3(color2), tokenToVec3(color3)];
    const readColors = () => {
      const p = props.current;
      colors = [tokenToVec3(p.color1), tokenToVec3(p.color2), tokenToVec3(p.color3)];
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * Math.min(Math.max(props.current.quality, 0.25), 1);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    };

    let elapsed = 0;
    let last: number | null = null;
    let frame = 0;

    const draw = (now: number) => {
      const p = props.current;
      // Speed is accumulated over time, so changing it never makes the pattern jump.
      if (last !== null) elapsed += Math.min((now - last) / 1000, 0.1) * p.speed;
      last = now;

      resize();
      gl.uniform1f(u.time, elapsed);
      gl.uniform3fv(u.color1, colors[0]);
      gl.uniform3fv(u.color2, colors[1]);
      gl.uniform3fv(u.color3, colors[2]);
      gl.uniform1f(u.scale, p.scale);
      gl.uniform1f(u.noise, p.noise);
      gl.uniform2f(u.resolution, canvas.width, canvas.height);
      gl.uniform2f(u.center, p.center[0], p.center[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    let lastFrame = 0;
    const loop = (now: number) => {
      const cap = props.current.maxFps;
      // data-idle is set by main.tsx when the window is hidden or unfocused: draw nothing.
      if (root.hasAttribute("data-idle")) last = null;
      else if (!cap || now - lastFrame >= 1000 / cap - 2) {
        lastFrame = now;
        draw(now);
      }
      if (!still) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    // With motion off there is no loop: repaint the still frame on resize and on theme change.
    const repaint = () => {
      readColors();
      if (still) draw(performance.now());
    };
    const resizeObserver = new ResizeObserver(repaint);
    resizeObserver.observe(canvas);
    const themeObserver = new MutationObserver(repaint);
    themeObserver.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", repaint);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      scheme.removeEventListener("change", repaint);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
