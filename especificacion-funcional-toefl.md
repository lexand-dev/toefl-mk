# Plataforma de práctica TOEFL: análisis y especificación funcional

Fecha: 22 de septiembre de 2026, zona del solicitante. Versión 1.0: revisión pública y autenticada, con propuesta de implementación. Referencia: KMF TOEFL 2026. Algunas fechas de la interfaz corresponden al día siguiente; no se verificó la zona horaria que aplica KMF.

## 1. Alcance y grado de verificación

Objetivo: desarrollar una plataforma con Reading, Listening y Writing y contenido original. Este documento separa el comportamiento observado de las decisiones propuestas para el producto propio.

**Se recorrieron los diez tipos con sesión iniciada**, además del selector público, las pantallas de revisión, los informes accesibles y el historial completo. Se probaron entregas vacías, una respuesta objetiva de prueba, una oración incompleta y un borrador original breve. Se comprobó la recuperación del borrador tras recargar y la reanudación de una conversación desde el historial. Las pruebas crearon intentos completados e incompletos en la cuenta; sus resultados no representan el nivel del alumno. No se descargó el banco ni se reproducen en este documento sus preguntas, soluciones, textos o audios.

La auditoría cubre muestras funcionales, no los 11.719 elementos ni todas las combinaciones de lotes. La corrección detallada por IA no pudo ejecutarse: la cuenta mostraba cero usos disponibles. No se contrató ningún servicio. Las restricciones y aspectos no comprobados se enumeran en la sección 13.

Convenciones:

- **O — Observado:** verificado en la interfaz pública o autenticada durante esta revisión.
- **C — Captura:** visible en la imagen aportada en la conversación de referencia, sin probar la interacción.
- **P — Propuesto:** requisito del producto propio; no describe necesariamente KMF.
- **V — Por verificar:** comportamiento no probado, inaccesible o no generalizable desde la muestra.

La cifra 11.719 se comprobó visualmente también en el catálogo autenticado; es el contador anunciado por el sitio, no un inventario auditado de ejercicios únicos. El catálogo, el historial y los informes están principalmente en chino; los ejercicios presentan consignas y controles en inglés. Las traducciones españolas de categorías son descriptivas.

## 2. Inventario de ejercicios y configuración observada

| ID | Sección | Categoría visible | Equivalente descriptivo | Cantidades seleccionables | Evidencia |
|---|---|---|---|---|---|
| R1 | Reading | 填词题 | Completar palabras | 1 o 2 | O |
| R2 | Reading | 日常生活 | Lectura de la vida cotidiana | 2 o 4 | O |
| R3 | Reading | 学术文章 | Lectura académica | 1 o 2 | O |
| L1 | Listening | 听答题 | Escuchar y elegir respuesta | 8 o 16 | O |
| L2 | Listening | 短对话 | Conversación breve | 2 o 4 | O |
| L3 | Listening | 学术公告 | Anuncio académico | 2 o 4 | O |
| L4 | Listening | 学术讲座 | Charla académica | 1 o 2 | O |
| W1 | Writing | 造句题 | Construir una oración | 10 o 20 | O |
| W2 | Writing | 写邮件 | Redactar un correo | 1, 2 o 3 | O |
| W3 | Writing | 学术讨论 | Participar en una discusión académica | 1, 2 o 3 | O |

**Las cantidades no equivalen siempre a respuestas evaluables.** En las muestras: 1 material R1 contiene 10 huecos evaluables; 2 materiales R2 reúnen 5 preguntas; 1 material R3 contiene 5 preguntas; 8 unidades L1 son 8 preguntas; 2 conversaciones L2 y 2 anuncios L3 contienen 4 preguntas cada lote; 1 charla L4 contiene 4 preguntas; 10 unidades W1 son 10 oraciones; 1 unidad W2/W3 es una entrega de texto. Los tamaños de R2 y R3 no se deben generalizar a todo el banco. El producto propio debe distinguir explícitamente materiales, tareas e ítems evaluables.

Las diez categorías muestran cronómetro ascendente y cuenta regresiva (O). No apareció un campo para personalizar minutos. Los ejercicios arrancan directamente después de GO, sin un segundo botón Comenzar observado. Las duraciones y diferencias de comportamiento comprobadas están en la sección 3.2. Al volver desde informes se observó ocasionalmente discrepancia transitoria entre la selección del formulario y su representación; es necesario confirmar el modo en el reloj real y en el historial.

## 3. Navegación de la referencia

| Superficie | Comportamiento o elementos | Estado |
|---|---|---|
| Cabecera | Inicio, práctica 2026, simulacros 2026, vocabulario, membresía, cursos, profesores, aplicación y Mi TOEFL | O |
| Práctica | Pestañas Reading, Listening, Writing y Speaking; esta última fuera del alcance solicitado | O |
| Introducción | Explicación de la sección y enlace a información sobre tipos | O |
| Ayuda de Reading | Abre otra pestaña con un visor PDF, situado en la página 17 | O; no se auditó el PDF |
| Configuración | Elegir tipo, cantidad y modalidad del reloj, seguido del botón GO | O |
| Cambio de sección | En las transiciones probadas se seleccionó la primera categoría, la menor cantidad y reloj ascendente | O; no prueba persistencia entre visitas |
| Inicio de práctica | Sin sesión, GO exige acceso; con sesión abre directamente la práctica | O |
| Acceso | El formulario visible ofrece teléfono/código y cuenta/contraseña | O; no se envió información |
| Panel personal | Cuenta atrás hasta el examen, control de fecha y listado de actividad; no se cambió la fecha del usuario | O |
| Actividad | Pestaña Todo y filtros por sección; tarjetas con tipo y fecha | O |
| Sesión sin terminar | Acciones continuar y reiniciar; reanudación probada en una conversación de auditoría | O |
| Sesión terminada | Precisión en tareas objetivas, reiniciar y ver resultados; correo/discusión no muestran el mismo porcentaje en la tarjeta | O |
| Historial completo | Acceso a registros anteriores, filtros por origen y sección, cantidad, reloj, fecha, precisión y tiempo | O |
| Área personal | Enlaces a registros de corrección, simulacros, favoritos, notas, vocabulario consultado y exámenes | O: existencia de enlaces, no auditoría integral de esos módulos |
| Utilidades | Enlaces de soporte, comentarios y descarga de aplicación | O |

El sitio recomienda Chrome y advierte sobre cambiar de ventana durante la práctica (O). En las pruebas, cambiar entre pestañas no invalidó los intentos y el reloj siguió funcionando. No se encontraron botones de pausa en las pantallas de ejercicio examinadas. Esto no determina el comportamiento de todos los navegadores o de los simulacros.

### 3.1. Estructura e interacción observadas por tipo

| Tipo | Estructura de la muestra | Navegación y respuesta observadas |
|---|---|---|
| R1 | Párrafo con prefijos visibles y casillas individuales para las letras restantes de diez palabras; indicador agrupado 1–10 | Review agrupa el material en una fila. Next permitió entregar sin completar los huecos. |
| R2 | Material cotidiano presentado como imagen con acción de ampliación, consigna y cuatro opciones de selección única | Next, Back desde la segunda pregunta y Review. Se permitió avanzar sin responder. |
| R3 | Título, pasaje a la izquierda con desplazamiento y pregunta con cuatro opciones a la derecha | Next, Back y Review. Una opción seleccionada se mantuvo tras avanzar y retroceder. |
| L1 | Imagen del hablante y cuatro opciones; estímulo oral previo al periodo de respuesta | Volume, Help y Next; sin Back ni Review visibles. Vencimiento por pregunta con avance automático. |
| L2 | Fase inicial de audio con imagen de interlocutores; después pregunta y cuatro opciones | Durante audio, solo Volume y Help. Al contestar aparece Next. En ascendente, Next sin respuesta abre aviso que obliga a contestar. |
| L3 | Fase de anuncio con imagen de hablante; después pregunta y cuatro opciones | Misma separación visual audio/preguntas; sin Back ni Review en la muestra. |
| L4 | Fase de charla académica con imagen y después cuatro preguntas, cada una con cuatro opciones | El reloj de respuesta aparece después del audio y avanza automáticamente cuando vence cada pregunta. |
| W1 | Contexto de diálogo, espacios de respuesta, posibles fragmentos fijos y banco de palabras o frases | Se selecciona una pieza y después un espacio. La primera pieza colocada se capitalizó. Next admite incompletas; Back y Review disponibles. |
| W2 | Escenario y requisitos comunicativos, destinatario y asunto ya fijados, editor de respuesta | Cut, Paste, Undo, Redo, contador ocultable y reloj ocultable. No hay Review visible. Se entregó un borrador original breve. |
| W3 | Consigna y pregunta del docente, dos intervenciones de ejemplo con identificación visual, editor | Mismos controles de edición que W2; la consigna recomienda al menos 100 palabras. Se permitió entregar vacío. |

Review, comprobado en R1 y W1, presenta número y estado: contestada, no contestada o no visitada. Incluye Return y Go To Question. Se probó el salto a la última oración. Las instrucciones de la tabla indican ordenación por número o estado; no se comprobó cada ordenación. Una oración parcialmente completada figuró como no contestada.

Help abrió un formulario de comentarios al sitio, no una explicación didáctica. Se cerró sin enviar. Volume abrió un regulador con valor 100. Hide Time pasó a Show Time; ocultar el reloj no lo detuvo.

### 3.2. Relojes de la referencia

Los valores iniciales aproximados se infieren de la primera lectura visible, tomada segundos después de abrir. No son tiempos oficiales de ETS ni una garantía para todos los materiales.

| Tipo y lote probado | Evidencia de tiempo | Regla comprobada |
|---|---|---|
| R1, 1 material | Primer valor 01:58; informe tras vencimiento: 2 min | Reloj de 2 min para la muestra; diez huecos en una pantalla y entrega automática al vencer. |
| R2, 2 materiales | Primer valor 03:18; presupuesto inicial aproximado 3 min 20 s | Reloj del lote; venció y abrió resultados con las cinco preguntas omitidas. |
| R3, 1 material | Primer valor 06:55; presupuesto inicial aproximado 7 min | Reloj compartido al avanzar y volver. |
| L1, 8 preguntas | Se observó la cuenta por pregunta y avance automático; resultado final 2 min 40 s | Compatible con 20 s por pregunta; el audio no se incluye en ese total. |
| L2, 2 conversaciones | Ascendente probado y una segunda sesión en cuenta regresiva terminó automáticamente: 0/4 y 1 min 20 s | Total compatible con 20 s por pregunta. No hay reloj visible durante la fase inicial de audio; su duración no se incluye en ese total. |
| L3, 2 anuncios | Ascendente probado y una segunda sesión en cuenta regresiva terminó automáticamente: 0/4 y 1 min 20 s | Total compatible con 20 s por pregunta. No hay reloj visible durante la fase inicial de audio; su duración no se incluye en ese total. |
| L4, 1 charla / 4 preguntas | Se observó 00:26 en una pregunta; total final por vencimiento 2 min | Compatible con 30 s por pregunta. El audio de la muestra dura 2:04 y no forma parte de los 2 min del informe. |
| W1, 10 oraciones | Primer valor 06:50; presupuesto inicial aproximado 7 min | Un reloj para el lote, incluso dentro de Review. |
| W2, 1 correo | Primer valor 06:59; presupuesto inicial aproximado 7 min | Recargar recuperó el borrador y el tiempo restante, sin volver a siete minutos. |
| W3, 1 discusión | Primer valor 09:56 con la cuenta regresiva confirmada | Presupuesto inicial aproximado 10 min. También se revisó el ascendente. |

Los tiempos por pregunta de los informes no siempre coinciden con el tiempo total: se observaron 0 segundos en preguntas omitidas aunque el reloj había transcurrido. No se conoce la fórmula interna exacta para visitas, revisión o recargas. La especificación propia debe definir estos conceptos y no intentar reproducir una fórmula inferida.

## 4. Filtros: observado y propuesto

**Observado:** sección, tipo de ejercicio, cantidad y modalidad del reloj. El panel de actividad filtra por sección. El historial completo filtra por sección y origen: todo, práctica pública, curso grupal, clase individual y actividad. Las tarjetas muestran estado implícito a través de las acciones disponibles; no se vio un filtro explícito por estado. No se encontraron filtros de dificultad, tema, contestados/no contestados, favoritos o errores en el selector de práctica 2026 examinado. Sí existe un enlace separado de registros de favoritos en el área personal.

**Propuesto para el producto propio:** añadir dificultad editorial, tema, no intentados, completados, errores y favoritos. Combinar filtros con AND; mostrar conteo disponible antes de iniciar. Si no hay suficientes materiales, ofrecer reducir cantidad o ampliar filtros. Nunca duplicar ítems silenciosamente para completar un lote. Separar los filtros de selección de contenido de los filtros del historial.

## 5. Estructura funcional propuesta por ejercicio

Las siguientes estructuras son requisitos P para crear materiales originales. Las familias coinciden con las descripciones públicas de ETS. La sección 3.1 documenta el comportamiento real de KMF; cualquier ampliación de controles aquí descrita es una decisión del producto propio.

### R1. Completar palabras

- Material: texto original con palabras parcialmente incompletas; cada hueco tiene identificador, segmento fijo y respuesta válida.
- Interacción: campos integrados en el texto; avance mediante teclado; indicador de huecos contestados; posibilidad de corregir antes del envío.
- Corrección: comparar con variantes aprobadas editorialmente. Aplicar solo normalizaciones expresamente configuradas; no convertir automáticamente una palabra distinta en correcta.
- Resultado: precisión por hueco y por material, respuesta introducida, solución y explicación contextual originales.
- Datos específicos: texto segmentado, posiciones, respuestas aceptadas y justificación de cada hueco.

### R2. Lectura cotidiana

- Material: aviso, mensaje, correo o texto informativo original, con presentación propia acorde con el género.
- Interacción: texto y pregunta simultáneos; opciones seleccionables; avanzar, retroceder y marcar para revisar en modo práctica.
- Corrección: clave de respuesta y explicación vinculada a información del material.
- Resultado: detalle por ítem y habilidad editorial, por ejemplo identificación de información o inferencia.
- Datos específicos: género, material, preguntas, opciones, clave y referencias internas a la evidencia.

### R3. Lectura académica

- Material: pasaje original, título y párrafos identificados.
- Interacción: panel de lectura y panel de preguntas; conservar desplazamiento al cambiar de pregunta.
- Corrección: respuestas objetivas con explicación propia; no presuponer un número fijo de preguntas por pasaje.
- Resultado: desglose por ítem y habilidades, con referencias al párrafo pertinente.
- Datos específicos: pasaje, párrafos, ítems y etiquetas de habilidades.

### L1. Escuchar y elegir respuesta

- Material: estímulo oral original y opciones de respuesta.
- Interacción: prueba de sonido antes de iniciar; cargar audio y después permitir reproducción. Política de repetición configurable según modo.
- Corrección: selección objetiva; registrar omisión cuando no exista respuesta al enviar.
- Resultado: audio, transcripción original y explicación disponibles en revisión.
- Datos específicos: recurso de audio, duración, transcripción, opciones y clave.

### L2. Conversación breve

- Material: diálogo original entre interlocutores y conjunto de ítems asociados.
- Interacción: escuchar y responder; conservar la asociación entre audio y preguntas durante toda la sesión.
- Corrección y resultado: evaluación por pregunta; revisión con transcripción y explicación.
- Datos específicos: audio, interlocutores, transcripción y preguntas. La cantidad de ítems por diálogo se define editorialmente.

### L3. Anuncio académico

- Material: anuncio original de contexto académico o del campus.
- Interacción: reproducción y preguntas sobre el mensaje; misma accesibilidad y recuperación de fallos que L2.
- Corrección y resultado: evaluación por ítem, con evidencia temporal opcional en la revisión.
- Datos específicos: audio, transcripción, contexto y preguntas asociadas.

### L4. Charla académica

- Material: exposición oral original y preguntas asociadas; sin exigir conocimientos externos para responder.
- Interacción: reproductor, área opcional de notas y navegación por preguntas en práctica.
- Resultado: desglose por habilidades y segmentos de audio relevantes cuando estén anotados editorialmente.
- Datos específicos: audio, transcripción, segmentos, notas del usuario e ítems asociados.

### W1. Construir una oración

- Material: palabras o fragmentos originales que deben organizarse, con contexto opcional y posiciones fijas cuando proceda.
- Interacción: seleccionar y colocar fragmentos; mover, retirar y reiniciar. Debe ser operable por teclado además de arrastrar.
- Corrección: secuencias válidas definidas por revisión editorial; cada fragmento mantiene un identificador incluso cuando hay palabras repetidas.
- Resultado: oración construida, secuencia válida y explicación gramatical original.
- Datos específicos: piezas, posiciones, restricciones y secuencias aceptadas.

### W2. Redactar un correo

- Material: situación original, destinatario ficticio, finalidad y requisitos comunicativos.
- Interacción: consigna visible y editor de texto, contador de palabras, reloj y estado de guardado.
- Evaluación: rúbrica propia por cumplimiento de la tarea, organización, registro y uso de lengua.
- Resultado: respuesta íntegra del alumno, comentarios vinculados a fragmentos y sugerencias. La valoración automática se identifica como orientativa.
- Datos específicos: consigna, requisitos, rúbrica versionada, borrador, entrega y evaluación.

### W3. Discusión académica

- Material: pregunta original y, cuando se diseñe así, intervenciones ficticias redactadas para la actividad.
- Interacción: panel de contexto y editor con contador, reloj y guardado automático.
- Evaluación: rúbrica propia de pertinencia, desarrollo, conexión con el contexto y claridad lingüística.
- Resultado: comentarios específicos, próximos pasos de práctica y estado de evaluación.
- Datos específicos: contexto, intervenciones, respuesta y rúbrica. No publicar respuestas del alumno en una comunidad por defecto.

## 6. Flujo del producto propio

1. Seleccionar sección, tipo, cantidad y reloj.
2. Mostrar resumen del lote: materiales, ítems, tiempo y reglas de audio/navegación.
3. Crear intento con una versión inmutable del contenido y de las reglas.
4. Precargar recursos; en Listening realizar comprobación de sonido.
5. Iniciar el reloj al pulsar Comenzar, después de cargar los recursos mínimos.
6. Guardar respuestas y posición automáticamente; mostrar guardando, guardado o pendiente de sincronizar.
7. Permitir revisar las respuestas dentro de las reglas del modo.
8. Antes del envío manual mostrar cuántas respuestas quedan vacías.
9. Finalizar una sola vez, corregir y abrir resultados.
10. Desde resultados ofrecer revisar errores, repetir el mismo lote o crear otro.

Estados P: configurado → preparado → en curso → enviado → evaluando → completado. «Pausado» solo existe donde la política lo permita. Una evaluación fallida conserva la entrega y admite reintento. Un reinicio crea otro intento relacionado y conserva el anterior.

## 7. Temporizadores y recuperación del producto propio

Implementar dos modos explícitos. **Simulación de la práctica observada:** R1–R3 y W1 permiten revisión; Listening avanza solo hacia adelante, separa audio y tiempo de respuesta, exige respuesta al avanzar manualmente y permite omisión por vencimiento; W2/W3 tienen reloj por tarea. **Estudio:** permite ayudas adicionales, pausa y repetición de audio. Las reglas ampliadas de la tabla siguiente pertenecen a Estudio y no deben presentarse como comportamiento de KMF.

| Regla P | Práctica ascendente | Práctica con cuenta regresiva |
|---|---|---|
| Inicio | Cero al comenzar | Duración configurada para el lote |
| Fin automático | No | Al vencer, conservar respuestas y enviar una vez |
| Pausa | Permitida; oculta material durante la pausa | Permitida únicamente si el preset lo declara |
| Audio | Incluir su reproducción en el tiempo activo | La misma regla, salvo preset explícito diferente |
| Pérdida de foco | No invalida; estado preservado | El reloj sigue, salvo pausa explícita permitida |
| Recarga | Restaurar tiempo activo y posición | Restaurar vencimiento, sin conceder minutos adicionales |

Las duraciones concretas quedan en presets versionados por tipo y cantidad. La sección 3.2 aporta las muestras observadas; no extrapolar por multiplicación a lotes no probados. La hora de servidor determina el vencimiento; la animación local solo representa ese estado. En Simulación, Listening necesita un reloj por pregunta, además de la fase de reproducción, y no una única cuenta global. Si el audio falla, conservar respuestas y ofrecer reanudar tras recuperación o finalizar como incidencia técnica; no registrar ese caso como fracaso académico.

## 8. Resultados y progreso

**Resultados observados de KMF:** cabecera con aciertos/total y tiempo total; navegación lateral por ítems o grupo de huecos; tiempo por ítem, respuesta del alumno, solución y explicación editorial. En R1 hay un interruptor para insertar soluciones en el párrafo. En Listening aparecen reproductor, posición/duración y control para desplegar o plegar la transcripción. En W1 se muestran piezas contestadas, huecos omitidos y oración solución. Se abrió y canceló un editor de notas con controles de formato, Guardar y Cancelar. El menú Continuar ofrece tamaños de lote; Salir vuelve al catálogo.

Las omisiones permanecen en el denominador de las muestras: R1 vacío dio 0/10, R2 vacío 0/5, L1 por vencimiento 0/8 y W1 incompleto 0/10. Esto no prueba reglas de crédito parcial para todos los tipos.

**Escritura libre:** el correo de prueba de 14 palabras produjo 1/1 en una cabecera etiquetada como aciertos, sin una corrección de calidad visible. Una discusión vacía dio 0/1. Por tanto, ese cociente no puede usarse como nota lingüística. Si-Rater figura como servicio separado con un contador de usos y una acción para obtenerlos; había 0 disponibles. No se verificaron su rúbrica, escala, latencia o comentarios detallados.

**Persistencia observada:** un borrador original de correo y su contador de 14 palabras sobrevivieron a una recarga. La conversación reanudada conservó una opción contestada y el tiempo acumulado, pero repitió la fase de audio y abrió la primera pregunta del bloque, aunque antes se había avanzado a la segunda. No generalizar este comportamiento a todos los tipos.

**Resultados P para ítems objetivos:** correctos, incorrectos, omitidos, total evaluable, tiempo activo y tiempo total. Precisión = correctos / total evaluable × 100; las omisiones cuentan en el denominador. Si el total es cero, mostrar «sin datos». Si se introduce puntuación parcial, mostrar puntos obtenidos/máximos por separado de precisión.

**Resultados P de escritura:** evaluación pendiente, completada o fallida; rúbrica y versión, valoración por dimensión, comentarios y recomendaciones. Una entrega vacía no se envía a evaluación automática y se informa como omitida. No convertir automáticamente estos resultados en puntuaciones oficiales TOEFL.

**Progreso P:** historial con sección, tipo, fecha, estado, tiempo y resultado; filtros por periodo y sección; continuar, revisar y repetir. Medir por separado intentos y materiales únicos completados para que repetir no infle la cobertura. Tendencias basadas en métricas comparables; no mezclar porcentajes objetivos con rúbricas de escritura en una media sin definición.

**Objetivo de examen P:** fecha elegida por el alumno, cuenta de días según su zona horaria y posibilidad de editar. No tomar la fecha de otro usuario visible en una captura.

## 9. Contenido original y administración

Cada material debe registrar autoría, procedencia, permisos de recursos, versión, dificultad editorial, etiquetas, estado de revisión y responsable. Flujo: borrador → revisión lingüística y pedagógica → revisión de audio si corresponde → aprobado → publicado → retirado.

Generar textos, consignas, distractores, explicaciones, imágenes y guiones propios. Si se usa generación automática, exigir revisión humana de respuesta correcta, ambigüedad, adecuación lingüística y correspondencia audio/transcripción. No usar el banco de KMF como base de importación ni reproducir sus composiciones visuales o marca.

El editor debe previsualizar los diez tipos, validar claves y recursos, impedir publicar material incompleto y retirar versiones sin alterar resultados históricos. Los roles mínimos son alumno, autor, revisor y administrador; solo personal autorizado publica.

## 10. Modelo funcional de datos

| Entidad P | Datos y relaciones esenciales |
|---|---|
| Usuario | Identidad, idioma de interfaz, zona horaria, fecha objetivo |
| Material | Sección, tipo, versión, texto o contexto, metadatos editoriales |
| Recurso | Audio/imagen propios, duración, transcripción, procedencia y versión |
| Ítem | Material padre, interacción, opciones o huecos, clave privada y explicación |
| Preset | Tipos permitidos, cantidad, duración, reglas de navegación, pausa y audio |
| Intento | Usuario, preset, contenido congelado, estado, inicio, vencimiento y tiempos |
| Respuesta | Intento, ítem, valor estructurado o texto, revisión y fecha de guardado |
| Evaluación | Entrega, rúbrica, versión del evaluador, resultados, comentarios y estado |
| Favorito | Usuario y material |
| Incidencia | Intento, clase de error, recuperación y efecto sobre la medición |

No enviar claves ni explicaciones al navegador durante el intento. El servidor valida acceso y estado al guardar y finalizar. Finalizar dos veces debe devolver el mismo resultado, sin crear entregas duplicadas. Conservar versiones evita que una edición posterior cambie la calificación histórica.

## 11. Requisitos de calidad y criterios de aceptación

| ID | Criterio verificable P |
|---|---|
| AC01 | Las diez categorías ofrecen las cantidades documentadas; el resumen diferencia materiales e ítems. |
| AC02 | Cambiar de categoría elimina una cantidad incompatible y selecciona un valor permitido. |
| AC03 | No comienza el reloj antes de que el alumno pueda ver o escuchar la actividad. |
| AC04 | Recargar recupera la última respuesta confirmada y el tiempo correcto. |
| AC05 | Al vencer el reloj se genera una sola entrega con las respuestas preservadas. |
| AC06 | Una entrega con omisiones presenta un desglose que coincide con su denominador. |
| AC07 | Repetir crea un intento nuevo; el historial anterior permanece disponible. |
| AC08 | El audio fallido produce una incidencia recuperable, sin marcar automáticamente los ítems como errores. |
| AC09 | Writing conserva borradores y entrega aunque falle el servicio de evaluación. |
| AC10 | Se puede completar W1 y navegar formularios con teclado; el estado no depende solo del color. |
| AC11 | Los resultados muestran contenido y rúbrica de la versión usada en el intento. |
| AC12 | El alumno solo accede a sus respuestas e historial. |
| AC13 | No se publica material sin revisión y procedencia registradas. |
| AC14 | La revisión revela soluciones solo después de finalizar, según las reglas del modo. |
| AC15 | La cobertura de materiales únicos no aumenta por repetir el mismo material. |
| AC16 | En Simulación, una pregunta de Listening sin contestar bloquea Next; al vencer su tiempo registra omisión y avanza. |
| AC17 | En Listening se separan duración del audio, tiempo de respuesta y duración total de la sesión, con etiquetas inequívocas. |
| AC18 | Un texto de Writing entregado no obtiene una etiqueta de «correcto» antes de ser evaluado; entrega y calidad se muestran por separado. |
| AC19 | En Simulación no aparecen pausa, repetición de audio o navegación hacia atrás donde el preset las prohíbe. |

Diseño responsive con lectura y escritura cómodas, contraste suficiente, etiquetas accesibles, foco visible y controles de audio identificables. En revisión, ofrecer transcripciones; durante una práctica evaluada, cualquier ayuda que cambie la dificultad debe quedar señalada.

## 12. Entrega por fases

**Primera versión:** diez tipos, contenido original revisado de muestra, configuración, ejecución, guardado, temporizadores, resultados objetivos, escritura con rúbrica y estado de evaluación, historial y administración mínima. El volumen inicial lo determina la capacidad de revisión editorial, no la cifra del competidor.

**Segunda fase:** filtros avanzados, favoritos, práctica de errores, tendencias, más contenido y mayor detalle de comentarios de escritura.

**Fase posterior:** simulacros con especificación separada y reglas verificadas, calibración de dificultad y posibles recorridos adaptativos. La existencia de un enlace «simulacros» en KMF no demuestra por sí sola cómo aplica adaptación o puntuación.

## 13. Límites y verificaciones adicionales

La cobertura incluye los diez tipos, sus configuraciones, ejecución de muestras, informes accesibles, revisión, historial y una prueba de reanudación. Persisten límites concretos:

1. **Corrección IA:** cero usos disponibles. No se afirma equivalencia de rúbrica, precisión o escala con Si-Rater.
2. **Variantes del banco:** no se revisaron todos los géneros cotidianos, estructuras académicas, números de ítems ni lotes máximos. El contenido debe modelarse con cardinalidades variables.
3. **Reinicio:** se verificó la acción disponible, pero no se reinició un intento histórico del usuario para determinar si KMF sobrescribe datos. El producto propio conservará los intentos.
4. **Persistencia:** se comprobó recarga de correo y reanudación de conversación. Desconexión, cierre del navegador, caducidad de sesión y conflictos entre dispositivos requieren pruebas independientes.
5. **Relojes y calificación:** no se conoce la fórmula interna exacta de tiempos por ítem, crédito parcial, normalización de huecos ni alternativas aceptadas en oraciones.
6. **Audio y accesibilidad:** no se vieron controles para repetir o buscar durante el audio evaluado; sí reproductor en resultados. No se certificó compatibilidad con lectores de pantalla ni teclado de toda la plataforma.
7. **Módulos relacionados:** se identificaron enlaces a favoritos, notas, vocabulario, correcciones y simulacros. No se auditó integralmente esos productos, ni Speaking, membresías o cursos.

Los resultados de auditoría tienen respuestas vacías o sintéticas; no deben interpretarse como rendimiento académico. No se modificaron ni reiniciaron intentos anteriores a esta auditoría y no se guardaron notas ni comentarios dirigidos a terceros.

## 14. Fuentes

- [KMF TOEFL 2026, práctica](https://toefl.kmf.com/n/toefl2026?subject=27): navegación pública y autenticada de los diez tipos. Los informes privados se describen sin publicar los identificadores de los intentos.
- [KMF: historial de práctica](https://toefl.kmf.com/record/reformrecord): navegación autenticada, filtros por sección/origen y reanudación de una conversación creada en esta auditoría.
- Captura adjunta a la conversación «Explicación de modelos GPT»: evidencia visual de contador, historial, fecha objetivo y acciones de progreso. No se reproduce la captura para evitar incluir datos del perfil.
- [ETS: Reading](https://www.ets.org/toefl/test-takers/ibt/about/content/reading.html): contraste de las tres familias de lectura.
- [ETS: Listening](https://www.ets.org/toefl/test-takers/ibt/about/content/listening.html): contraste de las cuatro familias de escucha enumeradas en la página.
- [ETS: Writing](https://www.ets.org/toefl/test-takers/ibt/about/content/writing.html): contraste de las tres familias de escritura.

Las fuentes de ETS se usan para identificar familias y propósitos generales, no como evidencia de controles internos de KMF ni como banco de contenido.
