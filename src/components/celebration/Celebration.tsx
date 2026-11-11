"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { renderShareCard, shareCardImage, type ShareCardInput } from "@/lib/shareCard";

export type CelebrationData = Omit<ShareCardInput, "date">;

type CelebrationProps = {
  data: CelebrationData | null;
  onClose: () => void;
};

const CONFETTI_COLORS = ["#9c3b32", "#1c1a17", "#e6b93f", "#4f6b3a", "#f1ece1"];
const MILESTONES = [7, 14, 21, 30, 50, 75, 100, 150, 200, 365];

function headline(data: CelebrationData): { title: string; sub: string } {
  if (MILESTONES.includes(data.streakDays)) {
    return { title: `${data.streakDays} days straight!`, sub: "That's a real habit now." };
  }
  if (data.streakDays >= 2) {
    return { title: `${data.streakDays}-day streak`, sub: "Keep the chain unbroken." };
  }
  return {
    title: "Logged!",
    sub: `${data.daysThisPeriod} workout ${data.daysThisPeriod === 1 ? "day" : "days"} in ${data.periodLabel}.`,
  };
}

function useConfetti(active: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const pieces = Array.from({ length: 110 }, () => ({
      x: width / 2 + (Math.random() - 0.5) * 80,
      y: height * 0.38,
      vx: (Math.random() - 0.5) * 11,
      vy: -Math.random() * 13 - 3,
      size: 6 + Math.random() * 6,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    }));

    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      ctx.clearRect(0, 0, width, height);
      for (const p of pieces) {
        p.vy += 0.32;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = Math.max(0, 1 - frame / 170);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (frame < 170) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return canvasRef;
}

export function Celebration({ data, onClose }: CelebrationProps) {
  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState("");
  const canvasRef = useConfetti(data !== null);

  useEffect(() => {
    if (!data) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, onClose]);

  if (!data) return null;
  const close = () => {
    setNote("");
    onClose();
  };
  const { title, sub } = headline(data);

  async function handleShare() {
    if (!data) return;
    setSharing(true);
    setNote("");
    try {
      const blob = await renderShareCard({ ...data, date: new Date() });
      const result = await shareCardImage(
        blob,
        `${data.streakDays >= 2 ? `${data.streakDays}-day streak` : "Workout logged"} on SweaTies`
      );
      if (result === "downloaded") setNote("Saved to your device");
    } catch {
      setNote("Couldn't make the card — try again");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Workout logged"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60 px-6"
    >
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="relative flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border-2 border-ink bg-paper p-7 text-center">
        <span className="text-5xl" aria-hidden>
          {data.streakDays >= 2 ? "🔥" : "💪"}
        </span>
        <div>
          <h2 className="font-display text-4xl uppercase leading-none text-ink">{title}</h2>
          <p className="mt-2 text-sm text-muted">{sub}</p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Button variant="solid" fullWidth onClick={handleShare} disabled={sharing}>
            {sharing ? "Making card…" : "Share your card"}
          </Button>
          <Button fullWidth onClick={close}>
            Done
          </Button>
        </div>
        {note && (
          <p role="status" className="text-xs font-bold text-muted">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
