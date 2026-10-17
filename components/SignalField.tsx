"use client";

import { useEffect, useRef } from "react";

// Signal Field — see docs/signal-field.md for the philosophy.
// A seeded field of drifting "postings"; a sweep crosses them; the rare
// matches ignite amber and report back through onIgnite.

type Point = {
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
  match: boolean;
  glow: number;
  prevD: number;
  label: number;
};

type Ripple = { x: number; y: number; age: number };

type Props = {
  seed?: number;
  labelCount?: number;
  onIgnite?: (label: number) => void;
};

const SWEEP_PERIOD = 12; // seconds per revolution
const TRAIL = Math.PI * 0.62; // conic wash behind the arm
const MATCH_RATE = 0.05;
const GLOW_HALF_LIFE = 2.6; // seconds
const RINGS = 5;
const TAU = Math.PI * 2;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgb(hex: string, fallback: [number, number, number]): [number, number, number] {
  const h = hex.trim().replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(h)) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return fallback;
}

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export function SignalField({ seed = 1729, labelCount = 8, onIgnite }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const igniteRef = useRef(onIgnite);
  igniteRef.current = onIgnite;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let points: Point[] = [];
    let ripples: Ripple[] = [];
    let rand = mulberry32(seed);
    let raf = 0;
    let running = true;
    let visible = true;
    let last = performance.now();
    let clock = 0;
    let lastIgniteReport = -10;

    // Smooth seeded flow field: layered sinusoids with seeded phases/frequencies.
    const fr = mulberry32(seed ^ 0x9e3779b9);
    const waves = Array.from({ length: 3 }, (_, i) => ({
      fx: (0.0018 + fr() * 0.002) * (i + 1),
      fy: (0.0016 + fr() * 0.002) * (i + 1),
      ph: fr() * TAU,
      sp: 0.05 + fr() * 0.08,
      amp: 1 / (i + 1),
    }));
    const flowAngle = (x: number, y: number, t: number) => {
      let v = 0;
      for (const w of waves) v += w.amp * Math.sin(x * w.fx + w.ph + t * w.sp) + w.amp * Math.cos(y * w.fy - w.ph * 0.7 - t * w.sp);
      return v * Math.PI * 0.75;
    };

    let colors = readColors();
    function readColors() {
      const cs = getComputedStyle(document.documentElement);
      return {
        accent: rgb(cs.getPropertyValue("--accent"), [219, 98, 77]),
        signal: rgb(cs.getPropertyValue("--signal-soft"), [245, 158, 11]),
        muted: rgb(cs.getPropertyValue("--muted"), [75, 85, 99]),
        line: rgb(cs.getPropertyValue("--line"), [239, 228, 221]),
      };
    }

    function spawn(p: Partial<Point> = {}, fresh = false): Point {
      return {
        x: rand() * width,
        y: rand() * height,
        age: fresh ? rand() * 20 : 0,
        life: 18 + rand() * 24,
        size: 1.1 + rand() * 1.3,
        match: rand() < MATCH_RATE,
        glow: 0,
        prevD: 0,
        label: Math.floor(rand() * labelCount),
        ...p,
      };
    }

    function layout() {
      const rect = canvas!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      rand = mulberry32(seed);
      const count = Math.max(55, Math.min(190, Math.round((width * height) / 3600)));
      points = Array.from({ length: count }, () => spawn({}, true));
      ripples = [];
    }

    function sweepAngle(t: number) {
      return ((t / SWEEP_PERIOD) * TAU) % TAU;
    }

    function step(dt: number) {
      clock += dt;
      const cx = width / 2;
      const cy = height / 2;
      const s = sweepAngle(clock);
      const decay = Math.pow(0.5, dt / GLOW_HALF_LIFE);

      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        p.age += dt;
        if (p.age > p.life) {
          points[i] = spawn();
          continue;
        }
        const a = flowAngle(p.x, p.y, clock);
        const speed = 5 + p.size * 2;
        p.x += Math.cos(a) * speed * dt;
        p.y += Math.sin(a) * speed * dt;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        // Has the arm just crossed this point?
        const ang = (Math.atan2(p.y - cy, p.x - cx) + TAU) % TAU;
        const d = (s - ang + TAU) % TAU;
        if (p.prevD > Math.PI && d < Math.PI) {
          if (p.match) {
            p.glow = 1;
            ripples.push({ x: p.x, y: p.y, age: 0 });
            if (clock - lastIgniteReport > 3.4) {
              lastIgniteReport = clock;
              igniteRef.current?.(p.label);
            }
          } else {
            p.glow = Math.max(p.glow, 0.32);
          }
        }
        p.prevD = d;
        p.glow *= decay;
      }

      ripples = ripples.filter((r) => (r.age += dt) < 1.6);
    }

    function draw() {
      const cx = width / 2;
      const cy = height / 2;
      const R = Math.hypot(cx, cy);
      const s = sweepAngle(clock);
      const { accent, signal, muted, line } = colors;
      ctx!.clearRect(0, 0, width, height);

      // Range rings and crosshair — hairlines.
      ctx!.lineWidth = 1;
      ctx!.strokeStyle = rgba(line, 0.9);
      const ringStep = Math.min(cx, cy) / (RINGS - 0.4);
      for (let i = 1; i <= RINGS; i++) {
        ctx!.beginPath();
        ctx!.arc(cx, cy, ringStep * i, 0, TAU);
        ctx!.stroke();
      }
      ctx!.strokeStyle = rgba(line, 0.6);
      ctx!.beginPath();
      ctx!.moveTo(cx - R, cy);
      ctx!.lineTo(cx + R, cy);
      ctx!.moveTo(cx, cy - R);
      ctx!.lineTo(cx, cy + R);
      ctx!.stroke();

      // Sweep wash + arm.
      ctx!.beginPath();
      ctx!.moveTo(cx, cy);
      ctx!.arc(cx, cy, R, s - TRAIL, s);
      ctx!.closePath();
      if ("createConicGradient" in ctx!) {
        const g = ctx!.createConicGradient(s - TRAIL, cx, cy);
        g.addColorStop(0, rgba(accent, 0));
        g.addColorStop(TRAIL / TAU, rgba(accent, 0.2));
        g.addColorStop(Math.min(1, TRAIL / TAU + 0.001), rgba(accent, 0));
        ctx!.fillStyle = g;
      } else {
        ctx!.fillStyle = rgba(accent, 0.07);
      }
      ctx!.fill();
      ctx!.strokeStyle = rgba(accent, 0.75);
      ctx!.lineWidth = 1.5;
      ctx!.beginPath();
      ctx!.moveTo(cx, cy);
      ctx!.lineTo(cx + Math.cos(s) * R, cy + Math.sin(s) * R);
      ctx!.stroke();

      // Ripples from fresh matches.
      for (const r of ripples) {
        const k = r.age / 1.6;
        ctx!.strokeStyle = rgba(signal, 0.55 * (1 - k));
        ctx!.lineWidth = 1.5;
        ctx!.beginPath();
        ctx!.arc(r.x, r.y, 4 + k * 26, 0, TAU);
        ctx!.stroke();
      }

      // Points.
      for (const p of points) {
        const fadeIn = Math.min(1, p.age / 1.5);
        const fadeOut = Math.min(1, (p.life - p.age) / 2);
        const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
        if (alpha <= 0) continue;
        if (p.match && p.glow > 0.02) {
          const halo = 3 + p.glow * 9;
          const g = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo * 2);
          g.addColorStop(0, rgba(signal, 0.55 * p.glow * alpha));
          g.addColorStop(1, rgba(signal, 0));
          ctx!.fillStyle = g;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, halo * 2, 0, TAU);
          ctx!.fill();
          ctx!.fillStyle = rgba(signal, Math.min(1, 0.55 + p.glow) * alpha);
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.size + 1.6 * p.glow + 0.6, 0, TAU);
          ctx!.fill();
        } else {
          const lift = p.glow;
          ctx!.fillStyle = lift > 0.04 ? rgba(accent, (0.35 + lift) * alpha) : rgba(muted, 0.32 * alpha);
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.size + lift * 1.2, 0, TAU);
          ctx!.fill();
        }
      }
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      draw();
      if (running && visible) raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function renderStill() {
      // One composed frame: advance the system silently, then draw.
      for (let i = 0; i < 240; i++) step(1 / 30);
      draw();
    }

    layout();
    if (reduced) {
      renderStill();
    } else {
      // Warm up so the first painted frame already has life in it.
      for (let i = 0; i < 90; i++) step(1 / 30);
      draw();
      start();
    }

    const ro = new ResizeObserver(() => {
      layout();
      if (reduced) renderStill();
      else {
        for (let i = 0; i < 60; i++) step(1 / 30);
        draw();
      }
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([entry]) => {
      running = entry.isIntersecting;
      if (running && visible && !reduced) start();
    });
    io.observe(canvas);

    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      if (running && visible && !reduced) start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      colors = readColors();
      if (reduced) draw();
    };
    mq.addEventListener("change", onScheme);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      mq.removeEventListener("change", onScheme);
    };
  }, [seed, labelCount]);

  return <canvas ref={canvasRef} className="signal-canvas" aria-hidden="true" />;
}
