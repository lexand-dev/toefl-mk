import { redirect } from "next/navigation";
import { getPageActor } from "@/lib/access";
import { L2Selector } from "@/features/practice/l2/components/selector";

export default async function L2Page() {
  if (!await getPageActor()) redirect("/login");
  return <L2Selector />;
}
