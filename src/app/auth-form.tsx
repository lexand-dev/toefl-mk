"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Mode = "register" | "login" | "forgot" | "reset";

export function AuthForm({ mode, token }: { mode: Mode; token?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const title = { register: "Crear cuenta", login: "Iniciar sesión", forgot: "Recuperar contraseña", reset: "Nueva contraseña" }[mode];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPending(true);
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "");
    const password = String(fields.get("password") ?? "");
    try {
      if (mode === "register") {
        const result = await authClient.signUp.email({ name: String(fields.get("name") ?? ""), email, password, callbackURL: "/login" });
        if (result.error) { setError(result.error.message ?? "No se pudo crear la cuenta"); return; }
        setMessage("Revisa tu correo para verificar la cuenta antes de iniciar sesión.");
      } else if (mode === "login") {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) { setError(result.error.message ?? "No se pudo iniciar sesión"); return; }
        router.push("/app");
        router.refresh();
      } else if (mode === "forgot") {
        const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        if (result.error) { setError(result.error.message ?? "No se pudo solicitar el enlace"); return; }
        setMessage("Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.");
      } else {
        if (!token) { setError("El enlace es inválido o ha caducado."); return; }
        const result = await authClient.resetPassword({ token, newPassword: password });
        if (result.error) { setError(result.error.message ?? "El enlace es inválido o ha caducado."); return; }
        setMessage("Contraseña actualizada. Inicia sesión de nuevo en todos tus dispositivos.");
      }
    } catch {
      setError("No se pudo conectar con el servicio. Inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return <><h1>{title}</h1><form onSubmit={submit}>
    {mode === "register" && <label>Nombre<input name="name" required autoComplete="name" /></label>}
    {mode !== "reset" && <label>Correo electrónico<input name="email" type="email" required autoComplete="email" /></label>}
    {(mode === "register" || mode === "login" || mode === "reset") && <label>Contraseña<input name="password" type="password" minLength={8} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>}
    <button type="submit" disabled={pending}>{pending ? "Espera…" : title}</button>
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status" className="success">{message}</p>}
  </form><nav>
    {mode !== "login" && <Link href="/login">Iniciar sesión</Link>}
    {mode !== "register" && <Link href="/register">Crear cuenta</Link>}
    {mode === "login" && <Link href="/forgot-password">¿Olvidaste la contraseña?</Link>}
  </nav></>;
}
