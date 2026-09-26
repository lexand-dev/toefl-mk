import { redirect } from "next/navigation";
import { getPageActor } from "@/lib/access";
import { W1Attempt } from "@/features/practice/components/w1-attempt";

export default async function W1AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await getPageActor()) redirect("/login");
  const { id } = await params;
  return <W1Attempt id={id} />;
}
