import { redirect } from "next/navigation";
import { getPageActor } from "@/lib/access";
import { R1Attempt } from "@/features/practice/components/r1-attempt";

export default async function R1AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await getPageActor()) redirect("/login");
  const { id } = await params;
  return <R1Attempt id={id} />;
}
