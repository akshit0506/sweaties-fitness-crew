export type ShareCardInput = {
  name: string;
  groupName: string;
  activities: string[];
  durationLabel?: string;
  streakDays: number;
  daysThisPeriod: number;
  periodLabel: string;
  date: Date;
};

const PAPER = "#f1ece1";
const INK = "#1c1a17";
const RUST = "#9c3b32";
const MUTED = "#6b655b";

function cssFont(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

/** Draws a 1080×1350 (4:5) brag card and returns it as a PNG. */
export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  // Make sure the web fonts are actually loaded before painting with them.
  try {
    await document.fonts.ready;
  } catch {
    // Fall back to system fonts.
  }

  const display = cssFont("--font-anton", "Impact, sans-serif");
  const accent = cssFont("--font-roboto-slab", "Georgia, serif");
  const sans = cssFont("--font-geist-sans", "system-ui, sans-serif");

  const width = 1080;
  const height = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);

  // Double ink frame.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.strokeRect(48, 48, width - 96, height - 96);
  ctx.lineWidth = 2;
  ctx.strokeRect(64, 64, width - 128, height - 128);

  ctx.textBaseline = "alphabetic";
  const left = 120;
  const contentWidth = width - left * 2;

  ctx.fillStyle = RUST;
  ctx.font = `700 34px ${sans}`;
  ctx.fillText(input.groupName.toUpperCase(), left, 160);

  ctx.fillStyle = INK;
  ctx.font = `120px ${display}`;
  ctx.fillText("SWEATIES", left, 290);

  ctx.fillStyle = MUTED;
  ctx.font = `500 34px ${sans}`;
  ctx.fillText(
    input.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    left,
    350
  );

  // Hero: streak when there is one, otherwise the period tally.
  const hasStreak = input.streakDays >= 2;
  const heroNumber = hasStreak ? input.streakDays : input.daysThisPeriod;
  const heroLabel = hasStreak
    ? "DAY STREAK"
    : `WORKOUT ${input.daysThisPeriod === 1 ? "DAY" : "DAYS"} IN ${input.periodLabel.toUpperCase()}`;

  ctx.fillStyle = RUST;
  ctx.font = `440px ${display}`;
  ctx.fillText(String(heroNumber), left - 8, 800);

  ctx.fillStyle = INK;
  ctx.font = `700 46px ${sans}`;
  ctx.fillText(fitText(ctx, heroLabel, contentWidth), left, 880);

  ctx.fillStyle = INK;
  ctx.fillRect(left, 940, contentWidth, 4);

  ctx.font = `64px ${accent}`;
  ctx.fillText(fitText(ctx, input.name, contentWidth), left, 1040);

  ctx.fillStyle = MUTED;
  ctx.font = `500 42px ${sans}`;
  const detail = [input.activities.join(" · "), input.durationLabel].filter(Boolean).join("  —  ");
  ctx.fillText(fitText(ctx, detail || "Logged a workout", contentWidth), left, 1110);

  ctx.fillStyle = RUST;
  ctx.font = `700 30px ${sans}`;
  ctx.fillText("Sweat together. Cheer louder.", left, 1220);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't render the card."))),
      "image/png"
    );
  });
}

/** Opens the native share sheet with the image, or downloads it where files can't be shared. */
export async function shareCardImage(blob: Blob, text: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], "sweaties-workout.png", { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // Any other failure: fall through to a plain download.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
