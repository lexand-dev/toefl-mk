import { redirect } from "next/navigation";
import { getPageActor } from "@/lib/access";
import { W1Selector } from "@/features/practice/components/w1-selector";

export default async function W1Page() {
  if (!await getPageActor()) redirect("/login");
  return <W1Selector />;
}
