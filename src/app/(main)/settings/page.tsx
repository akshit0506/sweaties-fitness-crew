import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { GroupsSettings } from "@/components/groups/GroupsSettings";
import { SoundToggle } from "@/components/settings/SoundToggle";
import { SignOutButton } from "@/components/settings/SignOutButton";
import { getActiveGroup, getMyGroups } from "@/lib/data/groups";

export default async function SettingsPage() {
  const [groups, active] = await Promise.all([getMyGroups(), getActiveGroup()]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <SectionHeader>Your groups</SectionHeader>
        <GroupsSettings groups={groups} activeGroupId={active?.id ?? ""} />
      </div>

      <Card className="flex flex-col gap-3">
        <SectionHeader>Preferences</SectionHeader>
        <SoundToggle />
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionHeader>Account</SectionHeader>
        <SignOutButton />
      </Card>
    </div>
  );
}
