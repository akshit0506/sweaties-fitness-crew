import { GroupJoinCreate } from "@/components/groups/GroupJoinCreate";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { fetchCurrentAthlete } from "@/lib/data/current-athlete";
import { APP_NAME } from "@/lib/config";

export const dynamic = "force-dynamic";

type JoinPageProps = { params: Promise<{ code: string }> };

// Invite links look like /join/7F3A9C21BD. The proxy sends signed-out
// visitors through /login first and brings them back here afterwards.
export default async function JoinPage({ params }: JoinPageProps) {
  const [{ code }, athlete] = await Promise.all([params, fetchCurrentAthlete()]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1.5">
        <Eyebrow>{`You're invited, ${athlete.name}`}</Eyebrow>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight text-ink">
          {APP_NAME}
        </h1>
        <p className="text-sm text-muted">Confirm the code below to join the group.</p>
      </div>
      <GroupJoinCreate initialCode={decodeURIComponent(code).toUpperCase()} />
    </div>
  );
}
