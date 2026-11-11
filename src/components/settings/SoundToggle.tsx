"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { isSoundMuted, playKudosSound, setSoundMuted, subscribeSoundMuted } from "@/lib/sound";

export function SoundToggle() {
  const muted = useSyncExternalStore(subscribeSoundMuted, isSoundMuted, () => false);

  function toggle() {
    setSoundMuted(!muted);
    if (muted) playKudosSound();
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-ink">Kudos sound</p>
      <Button onClick={toggle} aria-pressed={!muted}>
        {muted ? "Off" : "On"}
      </Button>
    </div>
  );
}
