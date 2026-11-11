import { redirect } from "next/navigation";
import { GroupJoinCreate } from "@/components/groups/GroupJoinCreate";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SignOutButton } from "@/components/settings/SignOutButton";
import { fetchCurrentAthlete } from "@/lib/data/current-athlete";
import { getActiveGroup } from "@/lib/data/groups";
import { APP_NAME } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const athlete = await fetchCurrentAthlete();
  if (await getActiveGroup()) redirect("/");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1.5">
        <Eyebrow>{`Welcome, ${athlete.name}`}</Eyebrow>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight text-ink">
          {APP_NAME}
        </h1>
        <p className="text-sm text-muted">
          {APP_NAME} is for small, private crews. Join the group you were invited to, or start
          one and share the code with your people.
        </p>
      </div>

      <GroupJoinCreate />
      <SignOutButton />
    </div>
  );
}
