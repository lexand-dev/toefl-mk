import { redirect } from "next/navigation";
import { getPageActor } from "@/lib/access";
import { PracticeScreen } from "@/features/practice/components/practice-screen";

export default async function PracticePage() {
  if (!await getPageActor()) redirect("/login");
  return <PracticeScreen />;
}
