import { redirect } from "next/navigation";
import { getPageActor } from "@/lib/access";
import { PracticeScreen } from "@/features/practice/components/practice-screen";
import { W2Selector } from "@/features/practice/components/w2-selector";
import Link from "next/link";

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  if (!await getPageActor()) redirect("/login");
  const { type } = await searchParams;
  return <><nav><Link href="/app/practice">R3 · Lectura académica</Link> · <Link href="/app/practice?type=W2">W2 · Redactar correo</Link></nav>{type === "W2" ? <W2Selector /> : <PracticeScreen />}</>;
}
