import { redirect } from "next/navigation";
import { getPageActor } from "@/lib/access";
import { PracticeScreen } from "@/features/practice/components/practice-screen";
import { W2Selector } from "@/features/practice/components/w2-selector";
import Link from "next/link";

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  if (!await getPageActor()) redirect("/login");
  const { type } = await searchParams;
  return <><nav><Link href="/app/practice/r1">R1 · Completar palabras</Link> · <Link href="/app/practice">R3 · Lectura académica</Link> · <Link href="/app/practice/l2">L2 · Conversaciones</Link> · <Link href="/app/practice/w1">W1 · Construir oraciones</Link> · <Link href="/app/practice?type=W2">W2 · Redactar correo</Link></nav>{type === "W2" ? <W2Selector /> : <PracticeScreen />}</>;
}
