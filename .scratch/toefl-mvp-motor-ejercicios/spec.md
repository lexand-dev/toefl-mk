# MVP de la plataforma TOEFL: autenticación y motor de ejercicios

Status: ready-for-agent

## Problem Statement

El alumno necesita practicar Reading, Listening y Writing sin perder sus respuestas ni recibir resultados inconsistentes por recargas, fallos de audio, vencimientos o envíos repetidos. Hoy el proyecto cuenta con una especificación funcional, un recorte de MVP y un esquema SQL de referencia, pero no con una aplicación que ejecute el ciclo completo de práctica. El desarrollador necesita una base tipada, versionada y comprobable que permita añadir aprendizaje asistido por IA y simulacros posteriormente sin rehacer los intentos.

## Solution

Entregar una plataforma con acceso por correo y contraseña, selección de lotes, ejecución, autoguardado, reanudación, entrega, revisión, historial y progreso de actividad para cinco tipos: R1 (completar palabras), R3 (lectura académica), L2 (conversación breve), W1 (construir una oración) y W2 (redactar un correo). Un ciclo común gestionará los intentos, mientras cada tipo conservará sus reglas de interacción y corrección. Los resultados objetivos procederán de claves privadas y las omisiones contarán en el denominador; W2 conservará su texto y una autoevaluación, sin calificación automática. El alumno podrá empezar por cualquier práctica sin diagnóstico obligatorio.

## User Stories

1. Como alumno, quiero crear una cuenta con correo y contraseña, para conservar mi práctica.
2. Como alumno, quiero verificar mi correo antes de iniciar sesión, para proteger mi cuenta.
3. Como alumno, quiero recuperar mi contraseña mediante un enlace, para recuperar el acceso a mi historial.
4. Como alumno, quiero que las sesiones anteriores se revoquen al restablecer mi contraseña, para mantener la cuenta bajo mi control.
5. Como alumno, quiero usar mi cuenta en varios dispositivos, para poder continuar mis intentos.
6. Como alumno, quiero elegir cualquiera de los cinco tipos disponibles, para practicar una habilidad concreta.
7. Como alumno, quiero elegir una cantidad válida para el tipo seleccionado, para formar un lote compatible con sus reglas.
8. Como alumno, quiero elegir reloj ascendente o cuenta regresiva, para saber qué límite tendrá mi práctica.
9. Como alumno, quiero ver por separado el número de materiales y de ítems evaluables del lote, para comprender el trabajo que recibiré.
10. Como alumno, quiero saber si no hay suficientes materiales publicados, para reducir el lote en vez de recibir materiales duplicados sin aviso.
11. Como alumno, quiero que se conserven la versión del contenido, el orden y las reglas asignadas, para que una edición posterior no cambie mi intento.
12. Como alumno, quiero comprobar el sonido y tener el recurso L2 disponible antes de comenzar, para no perder tiempo por la carga del audio.
13. Como alumno, quiero que el reloj comience solo cuando la actividad sea utilizable, para disponer de todo el tiempo previsto.
14. Como alumno, quiero completar y corregir individualmente los huecos de R1 antes de entregar, para practicar cada palabra.
15. Como alumno, quiero leer el pasaje R3 mientras respondo sus preguntas, para consultar su evidencia.
16. Como alumno, quiero escuchar una conversación L2 antes de responder sus preguntas, para respetar las fases de la práctica.
17. Como alumno, quiero que L2 distinga duración del audio, tiempo de respuesta por pregunta y duración de la sesión, para interpretar correctamente mis resultados.
18. Como alumno, quiero colocar, mover y retirar piezas de W1 mediante teclado, para completar oraciones sin depender del ratón.
19. Como alumno, quiero redactar W2 con contador de palabras y consigna visible, para revisar mi correo antes de entregarlo.
20. Como alumno, quiero navegar hacia delante y atrás en R1, R3 y W1, para revisar respuestas dentro de las reglas del tipo.
21. Como alumno, quiero que L2 aplique su navegación hacia delante y registre omisiones al vencer, para que el ejercicio mantenga reglas coherentes.
22. Como alumno, quiero que las respuestas se guarden automáticamente y ver si están guardadas o pendientes, para conocer el estado de mi trabajo.
23. Como alumno, quiero que un guardado antiguo no sobrescriba una respuesta más reciente, para conservar mi último cambio válido.
24. Como alumno, quiero recuperar respuestas, posición y tiempo válido tras recargar o volver desde el historial, para seguir sin reiniciar.
25. Como alumno, quiero recibir un aviso de cuántas respuestas están vacías antes de entregar manualmente, para decidir si las reviso.
26. Como alumno, quiero que el vencimiento conserve mis respuestas y cierre el intento aunque cierre la pestaña, para no perder la entrega.
27. Como alumno, quiero que dos solicitudes para entregar el mismo intento devuelvan el mismo resultado, para no producir calificaciones duplicadas.
28. Como alumno, quiero que las omisiones permanezcan en el denominador de la precisión objetiva, para interpretar correctamente el porcentaje.
29. Como alumno, quiero revisar aciertos, errores, omisiones y explicaciones después de entregar, para aprender de mis resultados.
30. Como alumno, quiero acceder a la transcripción L2 solo tras entregar, para revisar lo escuchado sin obtener ayuda durante la práctica.
31. Como alumno, quiero ver mi W2 completo como «entregado» con una lista de autoevaluación, para no confundir la entrega con una nota de calidad.
32. Como alumno, quiero continuar un intento abierto y consultar uno terminado desde el historial, para gestionar mi práctica.
33. Como alumno, quiero repetir un lote mediante un intento nuevo, para conservar la comparación con el anterior.
34. Como alumno, quiero ver tiempo de práctica y materiales únicos completados, para seguir mi actividad sin inflarla con repeticiones.
35. Como alumno, quiero que un audio fallido genere una incidencia recuperable, para no recibir un fracaso académico por un problema técnico.
36. Como alumno, quiero que nadie más pueda leer mis respuestas, borradores o resultados, para preservar mi privacidad.
37. Como autor o editor, quiero registrar procedencia, derechos y metadatos del material original, para preparar contenido revisable.
38. Como editor, quiero previsualizar y validar contenido, ítems, claves, explicaciones y recursos, para detectar material incompleto antes de publicar.
39. Como administrador, quiero publicar solo revisiones aprobadas y retirar otras sin cambiar resultados históricos, para proteger la integridad del banco.
40. Como administrador, quiero asignar permisos mediante operaciones confiables, para impedir que un registro público se convierta en editor o administrador.

## Implementation Decisions

- La primera entrega implementa exactamente R1, R3, L2, W1 y W2. Las cantidades ofrecidas son las documentadas para esos tipos: R1 1 o 2 materiales; R3 1 o 2; L2 2 o 4; W1 10 o 20; W2 1, 2 o 3. Se muestra el número real de ítems evaluables y nunca se repite silenciosamente un material para completar el lote.
- La aplicación usa Next.js 16 con Hono RPC, Zod y React Query para la práctica. Better Auth mantiene sus endpoints separados. El backend de Hono usa runtime Node y un driver PostgreSQL transaccional compatible con Neon; no se incorpora tRPC en paralelo. Los tipos inferidos no sustituyen la autorización, la validación en ejecución ni las restricciones de la base de datos.
- Better Auth y el dominio comparten una sola tabla física de usuarios con identificador UUID. El esquema ejecutable agrega los campos de Better Auth y conserva rol y zona horaria; `name` es el único nombre mostrado. No existe otra tabla de perfiles ni un identificador externo redundante. Las referencias existentes a usuarios conservan UUID.
- El registro es abierto con correo y contraseña, exige verificación del correo y permite recuperación mediante Resend desde Vercel. Restablecer contraseña revoca las sesiones anteriores. Se permiten sesiones simultáneas, renovables por actividad, con caducidad de siete días y sin caché de cookie. El rate limiting de Better Auth se persiste en Neon.
- Los únicos roles del MVP son `learner`, `editor` y `admin`. Todo registro público recibe `learner`; únicamente operaciones de confianza pueden promover usuarios. Las rutas editoriales se autorizan en el servidor y las lecturas y escrituras de intentos comprueban también su propietario. El primer administrador se promueve mediante un comando privado.
- Drizzle Kit es la fuente de migraciones ejecutables. El esquema SQL existente sirve de referencia para las relaciones, claves externas compuestas, índices, restricciones y triggers editoriales, pero no se ejecuta literalmente: su definición de usuarios se adapta a Better Auth. Las funciones y triggers que requieran SQL explícito se versionan dentro de ese mismo flujo de migraciones.
- `exercises` representa el material lógico; `exercise_revisions`, una versión editorial inmutable tras publicar. `exercise_items` representa las respuestas evaluables y `answer_keys` sus soluciones privadas. Los intentos congelan revisiones, ítems, orden y reglas; retirar una revisión impide asignarla a intentos nuevos sin modificar los antiguos.
- Los cuerpos variables de material, consigna y respuesta permanecen en JSONB, validados por esquemas Zod específicos de tipo al publicar y al guardar. Ninguna respuesta de la API de práctica incluye claves, explicaciones privadas o transcripciones de revisión antes de la entrega.
- Un servicio común gestiona selección, preparación, inicio, estado, posición, guardado, vencimiento, entrega e historial. Los módulos por tipo implementan sus interacciones, validación y corrección sin generalizar reglas incompatibles entre huecos, elección, ordenación, audio y texto libre.
- Crear un intento y sus materiales e ítems asociados es una operación transaccional. Guardar comprueba sesión, propietario, estado, versión de respuesta y hora del servidor. Las selecciones y colocaciones se guardan inmediatamente; W2 usa un breve debounce con confirmación de guardado antes de navegar o entregar.
- R1, R3 y W1 usan un reloj global y admiten la navegación y revisión previstas. W2 usa un reloj por tarea. L2 separa reproducción de audio y tiempo por pregunta; la fase de respuesta, sus vencimientos y omisiones se registran en el servidor. Las duraciones se definen mediante reglas o presets versionados, sin extrapolar tiempos de muestras del competidor.
- La hora de PostgreSQL decide los vencimientos; la UI representa el tiempo, pero no lo determina. Un job diferido de Trigger.dev atiende cada vencimiento activo que deba cerrarse sin navegador; no se depende de un cron frecuente. Cada operación entrante vuelve a comprobar y conciliar el estado. La activación y programación de los plazos debe tener una ruta de recuperación ante errores de programación externa.
- El envío manual, el vencimiento y el reintento del job usan una única operación de cierre. Bloquear la fila del intento permite serializar guardados y entregas concurrentes, calcular resultados y pasar a `submitted` una sola vez. Una entrega repetida devuelve el resultado existente. Reiniciar crea un intento distinto.
- Los resultados objetivos se calculan con claves privadas. Los omitidos cuentan en el total evaluable. W2 conserva el texto con resultado no calificado, sin puntos objetivos ni puntuación TOEFL; la autoevaluación se guarda aparte. Una entrega vacía no obtiene una calificación lingüística.
- Los audios L2 originales y revisados se alojan inicialmente en Vercel Blob público con nombres versionados y no sobrescritos; PostgreSQL conserva clave de almacenamiento, hash, duración y derechos. Un límite de almacenamiento abstrae Blob para una migración posterior a R2. Las URLs públicas pueden reutilizarse fuera de la UI y no constituyen una barrera contra repeticiones; claves y transcripciones se protegen separadamente.
- El progreso distingue el reloj del intento del tiempo de práctica agregado mediante intervalos acotados de actividad. La cobertura mide materiales únicos completados, no número de repeticiones. El tiempo acumulado no se interpreta como porcentaje de dominio.

## Testing Decisions

- La costura principal es el comportamiento observable de la aplicación y de su API Hono contra un PostgreSQL de prueba. Correo, Blob y Trigger.dev se sustituyen en pruebas por dobles de sus fronteras externas; las pruebas verifican resultados y estados persistidos, no funciones privadas, estructura interna de componentes ni detalles de implementación. Las carreras se provocan mediante solicitudes concurrentes a la misma API.
- Se prueba un ciclo completo de cada tipo: selección, inicio, respuesta, guardado, reanudación, entrega y revisión. Las pruebas de navegador cubren las interacciones que la API sola no demuestra, especialmente W1 con teclado, editor W2 y reproducción o fallo de audio L2.
- Se comprueba la ausencia de soluciones y transcripciones en las respuestas anteriores al envío, junto con el acceso posterior autorizado.
- Se prueban recargas, versiones de respuesta en conflicto, doble clic y dos solicitudes de entrega concurrentes, así como vencimiento con y sin navegador, guardado tardío e idempotencia del job diferido.
- Se prueban los denominadores con omisiones, los totales objetivos y la presentación no calificada de W2.
- Se comprueban el aislamiento de intentos entre alumnos, la asignación segura de roles, la verificación de correo, la recuperación que revoca sesiones y el limitador persistente.
- Se prueban rechazo de publicaciones incompletas, inmutabilidad de revisiones publicadas y consulta de resultados históricos después de publicar otra revisión.
- Se comprueba que un fallo de audio conserve el intento y permita una recuperación sin convertir el incidente en errores académicos.
- No hay suite ni costuras de prueba previas en el repositorio: los documentos y el esquema SQL son el punto de partida. Se crea una sola costura principal de aplicación/API, complementada por interacciones de navegador cuando el comportamiento depende de ellas.

## Out of Scope

- Las pantallas y el contenido de R2, L1, L3, L4 y W3 en esta primera entrega.
- Speaking, simulacro global, diagnóstico inicial obligatorio, estimación CEFR y puntuación oficial o aproximada TOEFL 2026.
- Learning engine, recomendaciones personalizadas, evaluación W2 con Jev y subrayado con un corrector gramatical externo en la primera entrega funcional del motor.
- Pausa, ayudas ampliadas y repetición libre de audio propias de una modalidad de estudio separada.
- Pagos, membresías, cursos, favoritos, notas y recorridos adaptativos.
- Migración efectiva a R2; únicamente se establece una frontera de almacenamiento que la facilite.

## Further Notes

- Esta especificación sintetiza los requisitos del MVP de cinco tipos y las decisiones de arquitectura acordadas en la conversación. Donde el análisis funcional propone una primera versión de diez tipos o rúbricas automáticas, prevalece el recorte explícito de esta entrega.
- La siguiente entrega podrá agregar etiquetas editoriales versionadas de habilidades, resultados de aprendizaje y recomendaciones deterministas. Jev, a través de AI SDK y AI Gateway desde Trigger.dev, encaja para clasificar dimensiones independientes de W2 y señales lingüísticas; no debe sustituir la corrección objetiva ni generar por sí mismo posiciones exactas de errores. Los resultados se guardarán con versión de rúbrica y modelo.
- El alumno podrá escoger un simulacro cuando exista una especificación separada con Speaking y cobertura suficiente de las cuatro secciones. La práctica inicial no exige evaluación diagnóstica.
- Las metas editoriales de la beta son diez materiales R1, diez R3, diez conversaciones L2, veinte oraciones W1 y diez consignas W2; una beta técnica puede comenzar con menos materiales originales revisados si se comunica con claridad la disponibilidad real.
