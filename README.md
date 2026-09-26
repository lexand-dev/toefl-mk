# Práctica TOEFL

Plataforma de práctica original para Reading, Listening y Writing. El MVP implementa el ciclo completo de R1, R3, L2, W1 y W2: seleccionar un lote, responder, reanudar, entregar y revisar resultados.

## Implementación

- [Especificación del MVP](.scratch/toefl-mvp-motor-ejercicios/spec.md)
- [Tickets y dependencias](.scratch/toefl-mvp-motor-ejercicios/issues/)
- [Referencia funcional](especificacion-funcional-toefl.md)
- [Modelo de datos](mvp-y-modelo-de-datos-toefl.md)

El contenido educativo, las explicaciones y los audios publicados por la aplicación serán originales y tendrán revisión editorial.

## Cuenta y acceso (ticket 01)

Requiere Node.js 20.9+ y PostgreSQL (Neon en despliegue). Ejecuta `npm install`, copia `.env.example` a `.env.local` y configura `DATABASE_URL`, `BETTER_AUTH_URL` (origen público, sin `/api/auth`), `BETTER_AUTH_SECRET` (secreto aleatorio de al menos 32 caracteres), `RESEND_API_KEY` y `RESEND_FROM` (remitente de un dominio verificado en Resend). En Vercel configura estas mismas variables. No uses el remitente de prueba `resend.dev` para usuarios reales. Sin credenciales válidas de Resend no se entregarán correos; la aplicación no simula envíos en producción.

Ejecuta `npm run db:migrate` contra la base de datos antes de `npm run dev` o `npm run build && npm start`. Las migraciones versionadas de Drizzle Kit en `drizzle/` son la fuente ejecutable; `schema-mvp-toefl.sql` es solo una referencia y **no** debe ejecutarse. Para cambios posteriores de esquema, actualiza `src/db/schema.ts` y ejecuta `npm run db:generate`. El rol público es siempre `learner`; con una cuenta previamente verificada, ejecuta una sola vez `npm run admin:bootstrap -- correo@dominio.com` en un entorno privado con `DATABASE_URL` configurada. Nunca expongas ese comando como endpoint. Los controles de rol para el trabajo editorial futuro se encuentran en `src/lib/access.ts`; toda ruta editorial futura debe verificar el rol en servidor (y toda ruta de intentos debe verificar además su propietario).

Las rutas `/register`, `/login`, `/forgot-password` y `/reset-password` usan los endpoints de Better Auth en `/api/auth/*`. `/app`, `/editor`, `/admin` y `/api/me`, `/api/editor`, `/api/admin` comprueban la sesión en servidor. Las sesiones simultáneas expiran tras siete días de inactividad; la actividad renueva el plazo (intervalo de renovación de 24 horas). No hay caché de cookie para sesiones.

### Pruebas locales

Usa **una base de datos desechable exclusiva**: los tests truncan las tablas de autenticación. Por ejemplo:

```sh
docker run --rm -d --name toefl-auth-test -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=toefl -p 127.0.0.1:55431:5432 postgres:16
DATABASE_URL=postgres://postgres:postgres@localhost:55431/toefl BETTER_AUTH_URL=http://localhost:3000 BETTER_AUTH_SECRET=local-test-secret-with-at-least-32-random-characters npm test
docker stop toefl-auth-test
```

Las pruebas ejercitan las rutas públicas contra PostgreSQL y sustituyen únicamente el envío externo de correo: verifican los enlaces y estados persistidos sin afirmar entrega real en Resend. Comprueban también el comando de bootstrap, renovación de sesiones y persistencia del limitador entre instancias de autenticación. `npm run typecheck` y `npm run build` comprueban la aplicación.

## Publicación editorial (ticket 02)

Después de `npm run db:migrate`, un administrador verificado puede abrir `/admin` y un editor verificado `/editor`. El rol `editor` permite ser autor y revisor (pero nadie puede revisar su propio material); `admin` es el único rol que publica o retira. Desde el banco se crean borradores R1, R3, L2, W1 y W2, se editan las consignas y claves privadas en JSON, se previsualizan ítems y recursos y se envían a revisión. Otra persona con rol editorial debe comprobar personalmente contenido, respuestas, explicaciones, derechos y procedencia antes de marcar la casilla de aprobación. El administrador publica solamente una revisión aprobada. Devolver a borrador permite corregir una revisión no aprobada; después de publicar, los cambios exigen **crear una nueva revisión**. Retirar impide su lectura pública y su asignación futura, sin borrar la revisión histórica.

El ejemplo original R3 se muestra como plantilla de **borrador sin revisión humana**; no está precargado ni aprobado ni publicado automáticamente. La lectura `GET /api/editorial/published/:id` solo devuelve material público de revisiones vigentes, nunca claves, explicaciones ni transcripciones. La lectura editorial privada exige sesión verificada y rol editorial. Los metadatos de recursos se registran con clave versionada, hash, duración y derechos; la carga física del audio a almacenamiento externo corresponde al flujo de audio posterior. En la UI se puede previsualizar una URL HTTPS ya alojada.

Las pruebas de publicación usan PostgreSQL desechable de la misma forma que las de cuenta, incluyendo los triggers de inmutabilidad de las migraciones Drizzle. Ninguna prueba implica que el ejemplo haya recibido revisión lingüística real.

## Vencimientos duraderos (ticket 08)

Los intentos R1, R3 y W1 con cuenta regresiva, cada tarea W2 iniciada y cada fase activa de escucha o pregunta L2 crean una fila duradera en `deadline_jobs`. Después del commit, la aplicación programa un run diferido `practice-deadline` para la hora guardada por PostgreSQL. Cada run usa una clave de idempotencia estable y la tarea tiene reintentos; no hay un cron frecuente. Las peticiones y el job toman el mismo bloqueo del intento y vuelven a conciliar la hora de PostgreSQL antes de guardar o cerrar.

Configura `TRIGGER_PROJECT_REF` y `TRIGGER_SECRET_KEY` tanto en la aplicación como en el entorno correspondiente de Trigger.dev. El entorno de la tarea también necesita `DATABASE_URL`. `trigger.config.ts` apunta a `trigger/`; usa `npx trigger.dev@latest dev` para desarrollo y `npx trigger.dev@latest deploy` para desplegar la tarea con el SDK v4. No ejecutes el CLI sin haber seleccionado el proyecto y entorno correctos.

Si la API de Trigger.dev falla, la operación académica ya confirmada no se revierte: `deadline_jobs.status = 'failed'` conserva el error y el número de intentos. Tras corregir credenciales o disponibilidad, ejecuta en un entorno privado `npm run deadlines:recover`. El comando reconstruye filas que falten para plazos activos y reintenta únicamente programaciones pendientes o fallidas con la misma clave idempotente. No se expone una ruta pública de recuperación.

## Práctica R3 (ticket 03)

Tras aplicar las migraciones, un alumno verificado abre `/app/practice` para elegir uno o dos pasajes publicados. El resumen separa materiales distintos e ítems evaluables; si faltan materiales, no se crea el intento. La preparación congela revisiones, ítems, orden y reglas (`R3-1`: 15 minutos por pasaje en cuenta regresiva o tiempo ascendente sin vencimiento). El reloj comienza al pulsar «Iniciar práctica» después de recibir los pasajes. Los intentos abiertos aparecen en el selector para reanudar, y el enlace directo permite recuperar posición, respuestas y reloj.

Los cambios de respuesta se confirman en el servidor con versión; las entregas concurrentes comparten una sola corrección. La revisión muestra claves y explicaciones únicamente después del cierre. Los vencimientos se concilian en cada petición y, sin navegador, mediante el job diferido del ticket 08. La plantilla R3 sigue siendo un borrador: un editor debe enviarla, otra persona aprobarla tras revisión humana y un administrador publicarla antes de que aparezca en práctica.

## Práctica W1 (ticket 05)

Un alumno verificado abre `/app/practice/w1` para elegir 10 o 20 materiales W1 publicados, sin repetir revisiones ni materiales. El resumen muestra escasez y el número real de ítems. Cada fragmento tiene un identificador propio, incluso si su texto se repite. En `/app/practice/w1/:id`, los botones nativos permiten colocar fichas disponibles, mover las colocadas a izquierda o derecha y retirarlas usando Tab y Enter/Espacio o el puntero. Cada operación se guarda de inmediato con versión; el foco pasa a la ficha modificada tras confirmar el guardado. Al recargar se recuperan posición, fichas y reloj. Las oraciones incompletas cuentan como omitidas; las secuencias aprobadas y la explicación editorial se muestran solo después de entregar. Las claves pueden registrar una secuencia de IDs o varias secuencias aprobadas. El contenido W1 debe pasar por el mismo flujo de revisión humana y publicación que R3; no se precarga ninguna publicación.

## Práctica R1 (ticket 04)

En `/app/practice/r1`, el alumno elige uno o dos textos publicados. Cada revisión R1 declara segmentos visibles y huecos enlazados por `gapId`; las soluciones y explicaciones permanecen en claves privadas. Los campos guardan cada cambio en orden con versión de respuesta, admiten navegación por teclado y recuperan texto, posición y reloj tras recargar. La entrega puntúa cada hueco, mantiene las omisiones en el denominador y muestra resultados por material, respuesta, solución contextual y explicación solamente en revisión. El preset propio `R1-1` asigna cinco minutos por texto en cuenta regresiva; la cuenta ascendente no vence.

## Banco beta original (ticket 10)

Con una cuenta editorial verificada y la base migrada, ejecuta en un entorno privado `npm run beta:import -- editor@dominio.com`. El comando importa **solo borradores**, de manera idempotente: 2 textos R1, 2 pasajes R3, 2 guiones de conversación L2, 10 oraciones W1 y 3 consignas W2. Cada uno incluye procedencia, derechos del texto, y las claves y explicaciones necesarias para revisión; W2 no tiene una clave objetiva. Ningún borrador aumenta la disponibilidad del selector.

Un editor debe revisar personalmente factualidad, nivel, naturalidad, ambigüedad, alternativas aceptadas y derechos; una persona distinta del autor aprueba cada revisión y un administrador la publica. Para L2 primero hay que grabar conversaciones originales siguiendo los guiones, verificar licencias y voces, subir el audio por el editor a Vercel Blob con `BLOB_READ_WRITE_TOKEN` y asociar el recurso versionado. El importador no adjunta audio inventado ni aprueba o publica contenidos. Los lotes de 20 W1 y 4 L2 seguirán mostrando escasez mientras no existan suficientes materiales **publicados**; esto es intencional y no se resuelve repitiendo revisiones.

Verificación antes de abrir la beta a alumnos: instala dependencias con `npm ci`, aplica `npm run db:migrate`, ejecuta `npm run typecheck`, `npm run build` y `npm test` en una base desechable exclusiva, después completa y revisa al menos un intento publicado por tipo desde navegador, incluyendo W1 por teclado, autoguardado W2 y reproducción/error de audio L2. Las pruebas automatizadas sustituyen exclusivamente Resend, Blob y Trigger.dev; las credenciales y la revisión humana son necesarias para validar la entrega real de esos servicios.

El workflow `.github/workflows/verify.yml` ejecuta migraciones, typecheck, pruebas y build con PostgreSQL 16 en cada PR. Los tests de importación comprueban que los borradores no sean legibles ni seleccionables por alumnos hasta la publicación.
