# 08: Vencimientos sin pestaña

**What to build:** Los intentos y preguntas con cuenta regresiva vencen y se cierran de manera consistente aunque el navegador ya no esté abierto, sin duplicar entregas ni perder respuestas.

**Blocked by:** 03 Práctica R3 de extremo a extremo; 07 Práctica L2 con audio e incidencias.

**Status:** ready-for-agent

- [ ] Un job diferido se programa para los vencimientos activos; una falla de programación tiene recuperación explícita.
- [ ] Toda petición comprueba la hora del servidor y concilia plazos pendientes, incluso si el job se retrasa.
- [ ] Envío manual, job y guardado simultáneos usan la misma semántica transaccional de cierre.
- [ ] Reintentos del job no generan más de una entrega; L2 preserva sus límites por pregunta y fases de audio.
