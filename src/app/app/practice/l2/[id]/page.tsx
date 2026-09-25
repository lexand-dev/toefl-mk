import { redirect } from "next/navigation";
import { getPageActor } from "@/lib/access";
import { L2AttemptScreen } from "@/features/practice/l2/components/attempt";

export default async function L2AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await getPageActor()) redirect("/login");
  const { id } = await params;
  return <L2AttemptScreen id={id} />;
}
