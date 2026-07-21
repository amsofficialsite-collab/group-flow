import AppShell from "@/components/AppShell";
import GroupManager from "@/components/groups/GroupManager";

export default function GroupsPage() {
  return (
    <AppShell title="Facebook Groups">
      <GroupManager />
    </AppShell>
  );
}
