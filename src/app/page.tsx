import Link from "next/link";

export default function Home() {
  return <article><h1>Práctica TOEFL</h1><p>Accede para conservar tu práctica en varios dispositivos.</p>
    <nav><Link href="/register">Crear cuenta</Link><Link href="/login">Iniciar sesión</Link><Link href="/app">Mi espacio</Link></nav>
  </article>;
}
