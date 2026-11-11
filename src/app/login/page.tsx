"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { APP_NAME } from "@/lib/config";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Mode = "join" | "signin";
type Status = "idle" | "busy" | "error";

const PHONE_PATTERN = /^\d{10}$/;

const INPUT_CLASSES =
  "w-full rounded-lg border-2 border-ink/15 bg-card px-4 py-3 text-sm text-ink outline-none focus:border-rust";

// An anonymous session already existing (from an earlier abandoned attempt
// on this device) shouldn't be thrown away and replaced — that would orphan
// it for no reason. Only sign in anonymously if there's genuinely no
// session yet.
async function ensureAnonymousSession(supabase: ReturnType<typeof createBrowserSupabaseClient>) {
  const { data } = await supabase.auth.getUser();
  if (data.user) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

/** Only same-origin paths — never let ?next= bounce someone to another site. */
function safeNextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login")
    ? next
    : "/";
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("join");
  const [name, setName] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const phoneValid = PHONE_PATTERN.test(phoneDigits);
  const canSubmit = phoneValid && (mode === "signin" || name.trim().length > 0);

  function switchMode(next: Mode) {
    setMode(next);
    setStatus("idle");
    setErrorMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || status === "busy") return;
    setStatus("busy");
    setErrorMessage("");

    const supabase = createBrowserSupabaseClient();
    try {
      await ensureAnonymousSession(supabase);
      const phone = `+91${phoneDigits}`;
      const { error } =
        mode === "join"
          ? await supabase.rpc("sign_up_with_phone", { display_name: name.trim(), phone })
          : await supabase.rpc("sign_in_with_phone", { phone });
      if (error) throw error;

      // Full navigation so no stale client state survives the identity change.
      window.location.assign(safeNextPath());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong — try again."
      );
      setStatus("error");
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1.5">
        <Eyebrow>Private crews only</Eyebrow>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight text-ink">
          {APP_NAME}
        </h1>
        <p className="font-accent text-xl text-rust">Sweat together. Cheer louder.</p>
      </div>

      <Card emphasis>
        <div className="mb-4 flex gap-2" role="tablist" aria-label="Sign in or join">
          {(["join", "signin"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={mode === option}
              onClick={() => switchMode(option)}
              className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                mode === option
                  ? "border-ink bg-ink text-card"
                  : "border-ink/15 bg-card text-ink hover:bg-ink/5"
              }`}
            >
              {option === "join" ? "I'm new" : "Sign in"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === "join" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm font-bold text-ink">
                Your name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                maxLength={40}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="What your crew calls you"
                className={INPUT_CLASSES}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-sm font-bold text-ink">
              Mobile number
            </label>
            <div className="flex items-center gap-2">
              <span className="flex h-[46px] items-center rounded-lg border-2 border-ink/15 bg-ink/5 px-3 text-sm font-bold text-ink">
                +91
              </span>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                required
                value={phoneDigits}
                onChange={(event) =>
                  setPhoneDigits(event.target.value.replace(/\D/g, "").slice(0, 10))
                }
                placeholder="10-digit number"
                className={`${INPUT_CLASSES} flex-1`}
              />
            </div>
            <p className="text-xs text-muted">
              {mode === "join"
                ? "Your number is your sign-in. It's never shown to anyone and no code is sent."
                : "Use the number you signed up with."}
            </p>
          </div>

          {status === "error" && <p className="text-sm text-rust">{errorMessage}</p>}

          <Button type="submit" variant="solid" fullWidth disabled={status === "busy" || !canSubmit}>
            {status === "busy" ? "Checking…" : mode === "join" ? "Get started" : "Sign in"}
          </Button>
        </form>
      </Card>

      <p className="text-center text-xs text-muted">
        You&apos;ll create or join a private group next — only people in your group can see your
        workouts.
      </p>

      <InstallPrompt />
    </div>
  );
}
