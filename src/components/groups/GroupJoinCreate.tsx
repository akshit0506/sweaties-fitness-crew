"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { createGroupAction, joinGroupAction } from "@/app/actions";

const INPUT_CLASSES =
  "w-full rounded-lg border-2 border-ink/15 bg-card px-4 py-3 text-sm text-ink outline-none focus:border-rust";

type GroupJoinCreateProps = {
  initialCode?: string;
  /** Where to go after success. Defaults to the home feed. */
  redirectTo?: string;
};

/** Create a private group, or join one with an invite code. Used by onboarding and settings. */
export function GroupJoinCreate({ initialCode = "", redirectTo = "/" }: GroupJoinCreateProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");

  async function run(kind: "create" | "join", action: () => Promise<{ error?: string }>) {
    setBusy(kind);
    setError("");
    const result = await action();
    if (result.error) {
      setError(result.error);
      setBusy(null);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) run("create", () => createGroupAction(name));
  }

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    if (code.trim()) run("join", () => joinGroupAction(code));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card emphasis>
        <form onSubmit={handleJoin} className="flex flex-col gap-3">
          <SectionHeader>Join with an invite code</SectionHeader>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="e.g. 7F3A9C21BD"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={16}
            aria-label="Invite code"
            className={`${INPUT_CLASSES} font-mono tracking-widest`}
          />
          <Button type="submit" variant="solid" fullWidth disabled={!code.trim() || busy !== null}>
            {busy === "join" ? "Joining…" : "Join group"}
          </Button>
        </form>
      </Card>

      <Card>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <SectionHeader>Or start your own crew</SectionHeader>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Group name — e.g. Sunrise Runners"
            maxLength={40}
            aria-label="Group name"
            className={INPUT_CLASSES}
          />
          <Button type="submit" fullWidth disabled={!name.trim() || busy !== null}>
            {busy === "create" ? "Creating…" : "Create group"}
          </Button>
        </form>
      </Card>

      {error && <p className="text-sm text-rust">{error}</p>}
    </div>
  );
}
