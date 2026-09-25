import { redirect } from "next/navigation";
import { getPageActor } from "@/lib/access";
import { AttemptScreen } from "@/features/practice/components/attempt-screen";

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await getPageActor()) redirect("/login");
  const { id } = await params;
  return <AttemptScreen id={id} />;
}
