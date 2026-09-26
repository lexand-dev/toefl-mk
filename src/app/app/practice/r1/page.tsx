import { redirect } from "next/navigation";
import { getPageActor } from "@/lib/access";
import { R1Selector } from "@/features/practice/components/r1-selector";

export default async function R1Page() {
  if (!await getPageActor()) redirect("/login");
  return <R1Selector />;
}
