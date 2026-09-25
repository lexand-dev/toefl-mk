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
