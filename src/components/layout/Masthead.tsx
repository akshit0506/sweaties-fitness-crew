import Link from "next/link";
import { getAthletes, getCurrentUser } from "@/lib/data/athletes";
import { getActiveGroup } from "@/lib/data/groups";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { APP_NAME } from "@/lib/config";
import { INTERACTIVE_CLASSES } from "@/lib/interactive";

export async function Masthead() {
  const [currentUser, athletes, group] = await Promise.all([
    getCurrentUser(),
    getAthletes(),
    getActiveGroup(),
  ]);

  return (
    <header
      className="flex flex-col gap-1.5 px-4 sm:px-6"
      style={{ paddingTop: "max(env(safe-area-inset-top), 1.25rem)" }}
    >
      <div className="flex items-start justify-between">
        <Link href="/settings" className={`rounded-md ${INTERACTIVE_CLASSES}`}>
          <Eyebrow>{`${group?.name ?? "SweaTies"} · ${athletes.length} ${athletes.length === 1 ? "member" : "members"} ▾`}</Eyebrow>
        </Link>
        <Link
          href="/settings"
          aria-label="Settings"
          className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 border-ink/20 text-lg leading-none hover:bg-ink/5 ${INTERACTIVE_CLASSES}`}
        >
          ⚙️
        </Link>
      </div>
      <h1 className="font-display text-3xl uppercase leading-none tracking-tight text-ink sm:text-4xl">
        {APP_NAME}
      </h1>
      <p className="font-accent text-xl text-rust">{currentUser.name}&rsquo;s records</p>
    </header>
  );
}
