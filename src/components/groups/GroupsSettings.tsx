"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { GroupJoinCreate } from "@/components/groups/GroupJoinCreate";
import { leaveGroupAction, rotateInviteCodeAction, switchGroupAction } from "@/app/actions";
import type { Group } from "@/lib/types";

type GroupsSettingsProps = {
  groups: Group[];
  activeGroupId: string;
};

export function GroupsSettings({ groups, activeGroupId }: GroupsSettingsProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);

  async function handle(action: () => Promise<{ error?: string }>, after?: () => void) {
    setError("");
    setNotice("");
    const result = await action();
    if (result.error) {
      setError(result.error);
      return;
    }
    after?.();
    router.refresh();
  }

  async function shareInvite(group: Group) {
    const url = `${window.location.origin}/join/${group.inviteCode}`;
    const text = `Join "${group.name}" on SweaTies — invite code ${group.inviteCode}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "SweaTies", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setNotice("Invite link copied");
    } catch {
      // User dismissed the share sheet, or clipboard was blocked — nothing to do.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const isActive = group.id === activeGroupId;
        return (
          <Card key={group.id} className="flex flex-col gap-3" emphasis={isActive}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink">{group.name}</p>
                <Eyebrow>
                  {`${group.memberCount} ${group.memberCount === 1 ? "member" : "members"}${
                    group.role === "admin" ? " · admin" : ""
                  }`}
                </Eyebrow>
              </div>
              {isActive ? (
                <span className="text-xs font-bold uppercase tracking-wide text-rust">Viewing</span>
              ) : (
                <Button onClick={() => handle(() => switchGroupAction(group.id), () => router.push("/"))}>
                  Switch
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg bg-ink/5 px-3 py-2">
              <span className="font-mono text-sm font-bold tracking-widest text-ink">
                {group.inviteCode}
              </span>
              <button
                type="button"
                onClick={() => shareInvite(group)}
                className="text-xs font-bold uppercase tracking-wide text-rust"
              >
                Invite
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              {group.role === "admin" ? (
                <button
                  type="button"
                  className="text-xs font-bold uppercase tracking-wide text-muted hover:text-ink"
                  onClick={() =>
                    handle(
                      () => rotateInviteCodeAction(group.id),
                      () => setNotice("Invite code reset — the old one no longer works")
                    )
                  }
                >
                  Reset code
                </button>
              ) : (
                <span />
              )}
              {confirmLeave === group.id ? (
                <span className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide">
                  <button type="button" className="text-muted" onClick={() => setConfirmLeave(null)}>
                    Stay
                  </button>
                  <button
                    type="button"
                    className="text-rust"
                    onClick={() =>
                      handle(
                        () => leaveGroupAction(group.id),
                        () => setConfirmLeave(null)
                      )
                    }
                  >
                    Yes, leave
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="text-xs font-bold uppercase tracking-wide text-muted hover:text-rust"
                  onClick={() => setConfirmLeave(group.id)}
                >
                  Leave
                </button>
              )}
            </div>
          </Card>
        );
      })}

      {error && <p className="text-sm text-rust">{error}</p>}
      {notice && <p className="text-sm text-success">{notice}</p>}

      {adding ? (
        <GroupJoinCreate redirectTo="/" />
      ) : (
        <Button fullWidth onClick={() => setAdding(true)}>
          Join or create another group
        </Button>
      )}
    </div>
  );
}
