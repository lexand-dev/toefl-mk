import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = { title: "Práctica TOEFL", description: "Tu espacio de práctica" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><header><a href="/">Práctica TOEFL</a></header><main>{children}</main></body></html>;
}
