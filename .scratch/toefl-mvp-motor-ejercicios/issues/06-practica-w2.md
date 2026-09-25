# 06: Práctica W2 sin nota automática

**What to build:** Un alumno redacta un correo W2 con consigna y contador, conserva el borrador tras recargar, entrega una sola vez y revisa el texto enviado y una lista de autoevaluación sin nota de calidad.

**Blocked by:** 03 Práctica R3 de extremo a extremo.

**Status:** ready-for-agent

- [ ] El texto usa autoguardado con debounce, estados de sincronización y confirmación antes de navegar o entregar.
- [ ] Un cambio antiguo no sobrescribe el borrador más reciente; el tiempo no se restablece tras recarga.
- [ ] Una entrega vacía o no evaluada no se presenta como correcta ni entra en la precisión objetiva.
- [ ] El resultado y autoevaluación sobreviven a reintentos y pueden consultarse desde el historial.
