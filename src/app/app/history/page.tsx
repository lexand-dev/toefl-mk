import { redirect } from "next/navigation";
import { getPageActor } from "@/lib/access";
import { HistoryScreen } from "@/features/history/components/history-screen";

export default async function HistoryPage() {
  if (!await getPageActor()) redirect("/login");
  return <HistoryScreen />;
}
