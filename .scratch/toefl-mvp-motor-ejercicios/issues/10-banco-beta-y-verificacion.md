# 10: Banco beta y verificación integral

**What to build:** La beta reúne contenido original suficiente para demostrar los cinco recorridos y supera pruebas transversales de seguridad, recuperación, accesibilidad y consistencia antes de exponerse a alumnos.

**Blocked by:** 04 Práctica R1 de huecos; 05 Práctica W1 accesible; 06 Práctica W2 sin nota automática; 07 Práctica L2 con audio e incidencias; 08 Vencimientos sin pestaña; 09 Historial y actividad.

**Status:** blocked

- [ ] Cada tipo tiene contenido original con autoría, procedencia, derechos, claves y explicaciones revisables; publicación requiere revisión humana.
- [ ] Los conteos anunciados corresponden al contenido realmente disponible y ningún lote repite material para alcanzar una cantidad.
- [ ] Se completan y revisan lotes de los cinco tipos desde navegador y API, con teclado para W1.
- [ ] Se verifican carreras, recargas, vencimiento, error de audio, aislamiento de usuarios y revisiones históricas.
- [ ] La beta no presenta puntuación oficial TOEFL, CEFR global ni evaluación automática de calidad W2.

## Comments

- El código importa 19 borradores originales, cubre los cinco tipos y verifica con PostgreSQL la importación idempotente, permisos, privacidad y disponibilidad real. CI ejecuta migraciones, typecheck, tests y build. Se han comprobado los flujos HTTP de los cinco tipos y la interfaz R1; W1 y W2 tuvieron pruebas de navegador en sus ramas aisladas.
- Para abrir la beta a alumnos faltan la grabación original y carga de audio L2 a Vercel Blob, la revisión humana independiente y publicación de materiales, y la comprobación del recorrido L2 completo con audio real. Sin credenciales de Blob/Trigger.dev ni personas revisoras no puede declararse cumplida la validación de servicios externos ni marcarse listo este ticket.
