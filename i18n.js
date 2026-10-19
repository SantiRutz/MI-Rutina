/**
 * MiRutina Vanilla — i18n.js
 * Soporte de idioma ES/EN: diccionarios, traductor `t`/`plural` con parámetros,
 * formato por locale con `Intl` (fechas, meses, días y números) y aplicación
 * declarativa sobre el DOM estático (data-i18n, data-i18n-aria,
 * data-i18n-title, data-i18n-placeholder). Sin localStorage: la persistencia
 * del idioma vive en storage.js (`mirutina.lang`).
 */
(function () {
  "use strict";

  window.MiRutina = window.MiRutina || {};

  var LOCALES = ["es", "en"];
  var DEFAULT_LOCALE = "es";

  /** Locale completo para `Intl` (formatos de fecha y número). */
  var INTL_LOCALES = { es: "es-ES", en: "en-US" };

  // Idioma activo en memoria; lo fija la app al arrancar y al cambiarlo.
  var locale = DEFAULT_LOCALE;

  // ---- Diccionarios --------------------------------------------------------

  var strings = {
    es: {
      "noscript":
        "MiRutina necesita JavaScript para funcionar. Habilita JavaScript en tu navegador y recarga la página.",
      // Marca, navegación y pie
      "nav.home.aria": "Mi Rutina, ir al inicio",
      "nav.primary": "Navegación principal",
      "nav.home": "Inicio",
      "nav.routines": "Rutinas",
      "nav.log": "Hoy",
      "nav.history": "Historial",
      "nav.stats": "Estadísticas",
      "nav.goals": "Objetivos",
      "nav.settings": "Ajustes",
      "nav.theme.toLight": "Cambiar al tema claro",
      "nav.theme.toDark": "Cambiar al tema oscuro",
      "nav.language.toEn": "Cambiar a inglés",
      "nav.language.toEs": "Cambiar a español",
      "nav.language.changed": "Idioma: español.",
      "nav.language.saveFailed": "No se pudo guardar el idioma: {message}",
      "footer.note": "MiRutina © {year} — Proyecto personal",
      "section.inicio": "Inicio",
      "section.registro": "Registro diario",
      "section.rutinas": "Rutinas",
      "section.historial": "Historial",
      "section.estadisticas": "Estadísticas",
      "section.objetivos": "Objetivos",
      // Títulos de pantalla (document.title)
      "screen.inicio": "Inicio",
      "screen.registro": "Registro",
      "screen.rutinas": "Rutinas",
      "screen.historial": "Historial",
      "screen.estadisticas": "Estadísticas",
      "screen.objetivos": "Objetivos",
      "screen.locked": "Datos incompatibles",
      "app.documentTitle": "{title} — MiRutina",
      // Comunes
      "common.close": "Cerrar",
      "common.cancel": "Cancelar",
      "common.confirm": "Confirmar",
      "common.save": "Guardar",
      "common.delete": "Eliminar",
      "common.edit": "Editar",
      "common.apply": "Aplicar",
      "common.progress": "Progreso",
      "common.filters": "Filtros",
      "common.toast.close": "Cerrar aviso",
      "common.today": "Hoy",
      "common.previous": "Anterior",
      "common.next": "Siguiente",
      "common.current": "Actual",
      "common.proposed": "Propuesto",
      "common.day": "Día",
      "common.hours24": "de 24h",
      "common.free": "{value} libres",
      "common.never": "nunca",
      "common.unknownError": "error desconocido",
      "common.unnamed": "Sin nombre",
      "common.percent": "{value}%",
      "common.dash": "—",
      "dialog.title": "Confirmar",
      // Almacenamiento (mensajes que llegan a la UI)
      "storage.locked":
        "Estos datos fueron creados por una versión más nueva de la app. Exporta el JSON crudo o vacía los datos para continuar.",
      "storage.unavailable":
        "No se pueden guardar datos en este navegador: localStorage no está disponible.",
      "storage.quota":
        "No hay espacio para guardar en este navegador (cuota de almacenamiento excedida).",
      "storage.corruptedJson": "JSON corrupto en la clave; se trata la colección como vacía.",
      "storage.serializeFailed": "No se pudo serializar el dato a JSON.",
      "storage.unknownCollection": "Colección desconocida: {name}",
      "storage.notAList": "La clave no contiene una lista; se trata la colección como vacía.",
      "storage.collectionNotList": 'La colección "{name}" debe ser una lista.',
      "storage.holderRequired":
        "withPersist necesita un holder con la referencia viva { value: lista }.",
      "storage.mutateRequired": "withPersist necesita una función mutate(actual) => nueva.",
      "storage.mutateNotList": "mutate debe devolver la nueva lista.",
      "storage.themeInvalid": 'El tema debe ser "dark" o "light".',
      "storage.langInvalid": 'El idioma debe ser "es" o "en".',
      "storage.focusInvalid": "El modo foco necesita { date, routineIds }.",
      "storage.reminderInvalid": "La frecuencia del recordatorio debe ser {days} días.",
      "storage.lastExportInvalid": "El último export debe ser una fecha ISO válida.",
      "storage.exportLocked": "Con esquema bloqueado usa exportRaw (JSON crudo).",
      "storage.expectedJson": "Se esperaba el contenido JSON del fichero.",
      "storage.notJson": "El fichero no es JSON válido.",
      "storage.notBackup": "El fichero no tiene el formato de un backup de MiRutina.",
      "storage.wrongApp":
        'El fichero no parece un backup de MiRutina (app distinta de "mirutina").',
      "storage.schemaMissing": "El backup no indica una versión de esquema válida.",
      "storage.schemaUnknown": "Versión de esquema no reconocida en el backup: {version}.",
      "storage.collectionMissing": 'El backup no incluye la colección "{name}" como lista.',
      "storage.collectionEntries":
        'La colección "{name}" del backup contiene entradas que no son objetos.',
      "storage.backupThemeInvalid": 'El tema del backup debe ser "dark" o "light".',
      "storage.backupFocusInvalid": "El modo foco del backup debe ser { date, routineIds } o null.",
      // Avisos de arranque
      "error.saveFailed": "No se pudo guardar: {message}",
      "error.corruptedCollection":
        'La colección "{name}" contiene datos dañados (JSON corrupto); se inicia vacía. Las demás colecciones no se tocan.',
      "banner.storage.title": "No se pueden guardar datos en este navegador. ",
      "banner.storage.text":
        "localStorage no está disponible: los cambios se revertirán al instante y la app queda en modo solo lectura.",
      "banner.storage.ok": "Entendido",
      "lock.empty.title": "Datos creados por una versión más nueva de la app",
      "lock.empty.description":
        "Estos datos fueron creados por una versión más nueva de MiRutina y no se leerán ni se modificarán. Puedes exportar el JSON crudo o vaciar los datos desde Ajustes para continuar.",
      // Recordatorio de backup
      "backup.banner.strong.one": "Sin backup desde hace {count} día. ",
      "backup.banner.strong.other": "Sin backup desde hace {count} días. ",
      "backup.banner.text":
        "Tus datos viven solo en este navegador: exporta un JSON para no perderlos.",
      "backup.banner.export": "Exportar ahora",
      "backup.banner.later": "Ahora no",
      "backup.banner.later.aria": "Descartar el recordatorio de backup",
      // Dashboard
      "dash.greeting.morning": "Buenos días",
      "dash.greeting.afternoon": "Buenas tardes",
      "dash.greeting.night": "Buenas noches",
      "dash.streak.aria.one": "Racha general: {count} día",
      "dash.streak.aria.other": "Racha general: {count} días",
      "dash.streak.pill.one": "{count} día de racha",
      "dash.streak.pill.other": "{count} días de racha",
      "dash.shield.title": "Días libres que no rompen la racha",
      "dash.shield.aria": "Escudos disponibles en {year}: {left} de {max}",
      "dash.shield.pill": "Escudos: {left}/{max}",
      "dash.registerToday": "Registrar hoy",
      "dash.cards.aria": "Resumen",
      "dash.card.today": "Hoy",
      "dash.card.week": "Esta semana",
      "dash.card.month": "Este mes",
      "dash.card.minutes": "Minutos hoy",
      "dash.routinesCount.one": "{done}/{total} rutina",
      "dash.routinesCount.other": "{done}/{total} rutinas",
      "dash.minutesHint": "de {minutes} min",
      "dash.today.title": "Rutinas de hoy",
      "dash.today.goLog": "Ir a registrar",
      "dash.today.empty": "No hay rutinas programadas para hoy.",
      "dash.today.emptyAction": "Creá la primera rutina",
      "dash.week.title": "Últimos 7 días",
      "dash.week.legend": "Verde ≥ 70 % · Amarillo 40–69 % · Rojo < 40 %",
      "dash.streaks.title": "Rachas top",
      "dash.streaks.empty": "Aún no hay rutinas con racha que mostrar.",
      "dash.goals.title": "Objetivos activos",
      "dash.goals.empty": "No hay objetivos todavía.",
      "dash.goals.emptyAction": "Creá el primero",
      "dash.goals.progressAria": "Progreso de {title}",
      "dash.goals.numbers": "{progress} / {target} · % real {percent}",
      "dash.quick.aria": "Accesos rápidos",
      // Checklist y marcado
      "check.mark": "Marcar {name}",
      "check.unmark": "Desmarcar {name}",
      "toast.future": "No se pueden registrar fechas futuras.",
      "toast.routineMissing": "La rutina ya no existe.",
      "toast.routineUnmarked": "«{name}» desmarcada.",
      "toast.routineMarked": "«{name}» marcada como cumplida.",
      "toast.setAll.noneToMark": "No queda ninguna rutina pendiente de marcar.",
      "toast.setAll.noneMarked": "No hay rutinas marcadas en este día.",
      "toast.setAll.marked.one": "{count} rutina marcada.",
      "toast.setAll.marked.other": "{count} rutinas marcadas.",
      "toast.setAll.unmarked.one": "{count} rutina desmarcada.",
      "toast.setAll.unmarked.other": "{count} rutinas desmarcadas.",
      // Notas
      "note.label": "Nota",
      "note.placeholder": "Añade una nota…",
      "note.placeholderDisabled": "Marca la rutina para añadir una nota",
      "note.saved": "Nota guardada.",
      "note.savedHint": "Guardada ✓",
      "note.needMark": "Marca la rutina para poder añadirle una nota.",
      "note.limit": "La nota no puede superar los {max} caracteres.",
      "note.overLimit":
        "La nota no puede superar los {max} caracteres; no se guardará hasta que la acortes.",
      "note.saveFailed": "No se pudo guardar la nota: {message}",
      // Calendario retroactivo
      "cal.title": "Registro rápido",
      "cal.section.aria": "Registro rápido del mes",
      "cal.prevMonth": "Mes anterior",
      "cal.nextMonth": "Mes siguiente",
      "cal.grid.aria": "Calendario de {month}",
      "cal.state.future": "día futuro",
      "cal.state.muted": "antes de tus rutinas",
      "cal.state.none": "sin rutinas programadas",
      "cal.state.noneShielded": "sin rutinas programadas, con escudo",
      "cal.state.counts": "{done} de {total} cumplidas",
      "cal.state.full": "día completo, {rest}",
      "cal.state.shielded": ", con escudo",
      "cal.shield.label": "con escudo",
      "cal.legend.full": "Cumplido",
      "cal.legend.partial": "Parcial",
      "cal.legend.empty": "Sin cumplir",
      "cal.legend.none": "Sin programar",
      "cal.panel.fullDay": "Día completo",
      "cal.panel.shieldDay": "Día con escudo",
      "cal.panel.close": "Cerrar el día seleccionado",
      "cal.panel.empty": "Ese día no tenía rutinas programadas.",
      "cal.panel.counts": "Cumplidas: {done}/{total}",
      // Historial
      "hist.title": "Historial",
      "hist.weekNav": "Navegación de semanas",
      "hist.prevWeek": "Semana anterior",
      "hist.nextWeek": "Semana siguiente",
      "hist.futureWeek": "Sin datos todavía (semana futura)",
      "hist.summary.aria": "Resumen de la semana",
      "hist.summary.title": "Semana del {start} al {end}",
      "hist.summary.counts.one": "{done} de {total} rutina cumplida",
      "hist.summary.counts.other": "{done} de {total} rutinas cumplidas",
      "hist.summary.progress": "Cumplimiento de la semana",
      "hist.summary.hint":
        "Los días futuros no puntúan ni penalizan (semana de lunes a domingo).",
      "hist.summary.shields": "Escudos: {left}/{max} · {year}",
      "hist.empty.title": "Aún no hay rutinas",
      "hist.empty.description":
        "Crea rutinas para empezar a registrar su cumplimiento y verlo aquí.",
      "hist.empty.action": "Ir a Rutinas",
      "hist.days.aria": "Días de la semana",
      "hist.day.aria": "{title} {date}",
      "hist.day.ariaToday": "{title} {date} (hoy)",
      "hist.indicator.future": "sin registrar (día futuro)",
      "hist.indicator.done": "cumplida",
      "hist.indicator.missed": "no cumplida",
      "hist.jump.label": "Saltar a la semana de…",
      "hist.jump.submit": "Ir a la semana",
      "hist.jump.error": "Elige una fecha para saltar a su semana.",
      "hist.jump.aria": "Saltar a una semana",
      // Escudos de racha
      "shield.dayPill": "Día con escudo",
      "shield.remove": "Quitar",
      "shield.remove.aria": "Quitar el escudo del {date}",
      "shield.apply": "Aplicar escudo",
      "shield.apply.aria": "Aplicar un escudo al {date}",
      "shield.noneLeft": "Sin escudos disponibles en {year}",
      "shield.noRoom": "No quedan escudos disponibles en {year}.",
      "shield.protects": "Este día no romperá la racha",
      "shield.left": "{left}/{max} disponibles en {year}",
      "shield.exists": "Ese día ya tiene escudo.",
      "shield.missing": "Ese día no tiene escudo.",
      "toast.shield.future": "No se puede aplicar un escudo a un día futuro.",
      "toast.shield.removed": "Escudo retirado del {date}.",
      "toast.shield.applied": "Escudo aplicado al {date}: ese día no rompe la racha.",
      // Estadísticas
      "stats.title": "Estadísticas",
      "stats.filter.aria": "Filtro de periodo",
      "stats.tab.week": "Semana",
      "stats.tab.month": "Mes",
      "stats.tab.year": "Año",
      "stats.tab.custom": "Personalizado",
      "stats.period.week": "Esta semana",
      "stats.period.month": "Este mes",
      "stats.period.year": "Este año",
      "stats.period.custom": "Personalizado",
      "stats.range": "{period}: {start} a {end}",
      "stats.custom.start": "Inicio",
      "stats.custom.end": "Fin",
      "stats.custom.startError": "Selecciona la fecha de inicio.",
      "stats.custom.endError": "Selecciona la fecha de fin.",
      "stats.custom.errorOrder": "La fecha de inicio debe ser anterior o igual a la de fin.",
      "stats.custom.errorFuture": "La fecha de fin no puede ser posterior a hoy.",
      "stats.cards.aria": "Resumen del periodo",
      "stats.card.percent": "Cumplimiento general",
      "stats.card.percentHint": "Sin datos en este periodo",
      "stats.card.completed": "Registros cumplidos",
      "stats.card.completedHint": "Rutinas marcadas en el periodo",
      "stats.card.total": "Registros totales",
      "stats.card.totalHint": "Programados: cumplidos + no cumplidos",
      "stats.card.lifetime": "Tiempo de por vida",
      "stats.card.lifetimeHint": "Total histórico · no depende del filtro",
      "stats.byRoutine": "Cumplimiento por rutina",
      "stats.global": "Global",
      "stats.empty.period.title": "Sin datos en el periodo",
      "stats.empty.period.description":
        "No hay rutinas programadas dentro del rango seleccionado.",
      "stats.empty.donut.title": "Sin registros en el periodo",
      "stats.empty.donut.description":
        "Cuando haya rutinas programadas verás aquí la dona de cumplimiento.",
      "stats.detail": "Detalle por rutina",
      "stats.empty.detail.title": "Sin detalle por rutina",
      "stats.empty.detail.description": "El periodo seleccionado no tiene rutinas programadas.",
      "stats.last7": "Últimos 7 días",
      "stats.empty.line.title": "Sin rutinas para mostrar",
      "stats.empty.line.description":
        "Crea rutinas para ver el cumplimiento diario de la semana.",
      "stats.streaks": "Rachas actuales por rutina",
      "stats.empty.streaks.description": "Crea rutinas para ver aquí su racha actual.",
      "stats.table.routine": "Rutina",
      "stats.table.counts": "Cumplidas / programadas",
      "stats.table.percent": "%",
      "stats.table.lifetime": "Tiempo total",
      "stats.table.progress": "Progreso",
      "stats.table.progressAria": "Cumplimiento de {name} en el periodo",
      "stats.streakDays.one": "🔥 {count} día",
      "stats.streakDays.other": "🔥 {count} días",
      // Comparativas
      "cmp.title": "Comparativas",
      "cmp.week": "Esta semana vs. la anterior",
      "cmp.month": "Este mes vs. el anterior",
      "cmp.hint":
        "La semana y el mes en curso se comparan contra el mismo tramo del periodo anterior (hasta hoy). Esta sección no depende del filtro de periodo.",
      "cmp.noPreviousRange": "sin periodo anterior",
      "cmp.vs": "vs. {range}",
      "cmp.empty": "Sin datos en ninguno de los dos periodos: todavía no hay nada que comparar.",
      "cmp.noPreviousData":
        "Sin datos del periodo anterior: no hay base para calcular los deltas.",
      "cmp.currentEmpty": "El periodo actual no tiene rutinas programadas.",
      "cmp.metric.percent": "Cumplimiento",
      "cmp.metric.completed": "Rutinas cumplidas",
      "cmp.metric.minutes": "Tiempo cumplido",
      "cmp.metric.fullDays": "Días al 100 %",
      "cmp.delta.points": "{value} pts",
      "cmp.delta.flat": "Sin cambios",
      "cmp.previous": "Antes: {value}",
      // Registro diario
      "log.title": "Registro diario",
      "log.date": "Fecha",
      "log.prevDay": "Día anterior",
      "log.nextDay": "Día siguiente",
      "log.futureError": "No puedes registrar una fecha futura; solo hoy y días anteriores.",
      "log.summary.aria": "Resumen del día",
      "log.metric.progress": "Progreso",
      "log.metric.completed": "Cumplidas",
      "log.metric.scheduledTime": "Tiempo destinado",
      "log.metric.completedTime": "Tiempo cumplido",
      "log.progressAria": "Cumplimiento del día",
      "log.occupancy": "Ocupación del día: {value}",
      "log.freeTime": "Tiempo libre: {value}",
      "log.occupancy.aria": "Porcentaje de las 24 horas ocupado por rutinas",
      "log.checklist.title": "Rutinas del día",
      "log.checklist.aria": "Rutinas del día",
      "log.bulk.markAll": "Marcar todas",
      "log.bulk.unmarkAll": "Desmarcar todas",
      "log.empty.title": "No hay rutinas programadas para este día",
      "log.empty.description":
        "Programa rutinas desde la pantalla de Rutinas y vuelve aquí para registrarlas.",
      "log.focusEmpty.title": "Sin prioridades elegidas",
      "log.focusEmpty.description": "Elige hasta {max} rutinas en Modo foco para verlas aquí.",
      "log.notes": "Notas",
      // Modo foco
      "focus.title": "Modo foco",
      "focus.counter": "Prioridades: {count}/{max}",
      "focus.hint":
        "Elige hasta {max} prioridades del día: la lista muestra solo esas rutinas y «Marcar todas» actúa sobre ellas.",
      "focus.chips.aria": "Prioridades del día",
      "focus.add": "Añadir a prioridades: {name}",
      "focus.remove": "Quitar de prioridades: {name}",
      "focus.off": "Modo foco desactivado.",
      "focus.on": "Modo foco activado: elige hasta {max} prioridades.",
      "focus.max": "Máximo {max} prioridades por día.",
      // Objetivos
      "goals.aria.create": "Crear objetivo",
      "goals.aria.edit": "Editar objetivo",
      "goals.title": "Objetivos",
      "goals.new": "Nuevo objetivo",
      "goals.tabs.aria": "Vista de objetivos",
      "goals.tab.list": "Listado",
      "goals.tab.manual": "Ajuste manual",
      "goals.filter.all": "Todos",
      "goals.filter.aria": "Filtro por año",
      "goals.filter.groupAria": "Filtro de objetivos por año",
      "goals.list.aria": "Listado de objetivos",
      "goals.empty.year": "No hay objetivos en {year}.",
      "goals.stat.progress": "Progreso",
      "goals.stat.target": "Meta",
      "goals.stat.percent": "% real",
      "goals.links.none": "Sin rutinas vinculadas",
      "goals.links.some": "Vinculadas: {names}",
      "goals.action.adjust": "Ajustar",
      "goals.manual.aria": "Ajuste manual del progreso",
      "goals.manual.empty.title": "Aún no hay objetivos",
      "goals.manual.empty.description": "Crea un objetivo para poder ajustar su progreso a mano.",
      "goals.manual.create": "Crear objetivo",
      "goals.manual.quickAria": "Ajustes rápidos para {title}",
      "goals.manual.add": "Sumar {value} en {title}",
      "goals.manual.subtract": "Restar {value} en {title}",
      "goals.manual.freeLabel": "Valor libre con signo",
      "goals.manual.freeHint": "Entero con signo, p. ej. −3 o 12 (suelo 0, sin tope).",
      "goals.manual.numbers": "{progress} / {target} · {percent}",
      "goals.manual.floor": "El progreso de «{title}» ya está en 0 (suelo mínimo).",
      "goals.manual.adjusted": "Progreso de «{title}»: {after} ({delta}).",
      "goals.missing": "El objetivo ya no existe.",
      "goals.created": "Objetivo «{title}» creado.",
      "goals.updated": "Objetivo «{title}» actualizado.",
      "goals.deleted": "Objetivo «{title}» eliminado.",
      "goals.form.placeholderTitle": "Ej: Correr 500 km este año",
      "goals.form.placeholderDescription": "Detalles, motivación, etc.",
      "goals.form.ariaYear": "Año",
      "goals.form.ariaTarget": "Meta",
      "goals.form.ariaProgress": "Progreso inicial",
      "goals.form.ariaColor": "Selector de color",
      "goals.form.group.identity": "Identidad",
      "goals.form.group.numbers": "Meta y progreso",
      "goals.form.group.appearance": "Apariencia y vínculos",
      "goals.form.label.title": "Título",
      "goals.form.label.description": "Descripción (opcional)",
      "goals.form.label.year": "Año",
      "goals.form.label.target": "Meta",
      "goals.form.label.progress": "Progreso inicial",
      "goals.form.label.color": "Color",
      "goals.form.hint.year": "Año calendario del objetivo.",
      "goals.form.hint.target": "Valor objetivo (ej: 500 km, 12 libros…)",
      "goals.form.hint.progress": "Entero mayor o igual a 0.",
      "goals.form.links.empty":
        "Aún no hay rutinas; podrás vincularlas más tarde desde la pantalla de rutinas.",
      "goals.form.links.legend": "Rutinas vinculadas",
      "goals.form.links.hint":
        "Elegí qué rutinas aportan a este objetivo. Marcar una rutina vinculada suma +1 y desmarcarla resta −1.",
      "goals.form.error.year": "El año debe ser un número entero.",
      "goals.form.error.color": "Introduce un color en formato #RRGGBB.",
      "goals.form.error.title": "El título es obligatorio.",
      "goals.form.error.colorInvalid": "Color inválido: usa el formato #RRGGBB.",
      "goals.form.error.target": "La meta debe ser un número entero mayor que 0.",
      "goals.form.error.progress": "El progreso inicial debe ser un número entero mayor o igual a 0.",
      "goals.form.error.manualDelta": "Introduce un número entero distinto de cero.",
      "goals.delete.title": "Eliminar objetivo",
      "goals.delete.intro": "Vas a eliminar {name}.",
      "goals.delete.body":
        "Se eliminará el objetivo con su progreso; las rutinas vinculadas no se modifican.",
      // Rutinas
      "rt.aria.create": "Crear rutina",
      "rt.aria.edit": "Editar rutina",
      "rt.title": "Mis Rutinas",
      "rt.new": "Nueva rutina",
      "rt.list.aria": "Lista de rutinas",
      "rt.empty.title": "Aún no hay rutinas",
      "rt.empty.description":
        "Crea tu primera rutina para empezar a registrar cumplimiento y objetivos.",
      "rt.empty.action": "Crear la primera rutina",
      "rt.days.aria": "Días de la semana",
      "rt.day.scheduled": "{day}: programado",
      "rt.day.notScheduled": "{day}: no programado",
      "rt.active.ariaOn": "Desactivar {name}",
      "rt.active.ariaOff": "Activar {name}",
      "rt.inactive": "Inactiva",
      "rt.lifetime.title": "Días cumplidos × duración de la rutina (histórico)",
      "rt.lifetime": "Invertido: {value}",
      "rt.missing": "La rutina ya no existe.",
      "rt.created": "Rutina «{name}» creada.",
      "rt.updated": "Rutina «{name}» actualizada.",
      "rt.alreadyActive": "La rutina ya estaba activa.",
      "rt.alreadyInactive": "La rutina ya estaba desactivada.",
      "rt.activateBlocked": "No se puede activar «{name}»: {days}.",
      "rt.activated": "«{name}» activada.",
      "rt.deactivated": "«{name}» desactivada.",
      "rt.deleted": "Rutina «{name}» eliminada con sus registros.",
      "rt.exceeded": "No se puede guardar: {days}.",
      "rt.exceededDay": "{day} (+{duration})",
      "rt.saveFailed": "No se pudo guardar: {message}",
      "rt.deleteFailed": "No se pudo eliminar: {message}",
      "rt.form.placeholderName": "Ej: Correr, Leer, Meditar…",
      "rt.form.placeholderDescription": "Detalles, motivación, etc.",
      "rt.form.ariaHours": "Horas",
      "rt.form.ariaMinutes": "Minutos",
      "rt.form.ariaColor": "Selector de color",
      "rt.form.group.identity": "Identidad",
      "rt.form.group.schedule": "Horario",
      "rt.form.group.status": "Estado",
      "rt.form.label.name": "Nombre",
      "rt.form.label.description": "Descripción (opcional)",
      "rt.form.label.color": "Color",
      "rt.form.label.duration": "Duración",
      "rt.form.hint.duration": "Entre 1 minuto y 24 h.",
      "rt.form.active": "Rutina activa",
      "rt.form.activeHint":
        "Al guardar, una rutina activa valida el límite de 24 h por día; desactivar siempre está permitido (solo afecta a días futuros).",
      "rt.form.error.weekdays": "Selecciona al menos un día de la semana.",
      "rt.form.error.weekdayInvalid": "Hay un día de la semana no válido.",
      "rt.form.error.durationIntegers":
        "La duración debe expresarse con enteros de horas y minutos.",
      "rt.form.error.durationMinutes": "Los minutos deben estar entre 0 y 59; expresa el resto como horas.",
      "rt.form.error.durationHours": "Las horas deben estar entre 0 y 24.",
      "rt.form.error.durationMax": "La duración máxima es 24h 00m.",
      "rt.form.error.durationZero": "La duración debe ser mayor que 0.",
      "rt.form.error.name": "El nombre es obligatorio.",
      "rt.form.error.color": "Introduce un color en formato #RRGGBB.",
      "rt.form.error.colorInvalid": "Color inválido: usa el formato #RRGGBB.",
      "rt.weekdays.legend": "Días de la semana *",
      "rt.weekdays.markAll": "Marcar todos",
      "rt.weekdays.unmarkAll": "Desmarcar todos",
      "rt.weekdays.free": "{value} libres",
      "rt.free.title": "Tiempo libre por día",
      "rt.free.hint": "Actual → con la propuesta. En rojo, los días que excederían 24 h.",
      "rt.free.exceeds": "excede",
      "rt.free.exceedsTitle": "Excede las 24 h del día",
      "rt.delete.title": "Eliminar rutina",
      "rt.delete.intro": "Vas a eliminar {name}.",
      "rt.delete.body":
        "Se eliminarán también sus registros de cumplimiento y sus vínculos con objetivos; las estadísticas se recalcularán.",
      // Ajustes, backup e importación
      "settings.title": "Ajustes",
      "settings.data.aria": "Datos",
      "settings.theme.current": "Tema actual: {theme}",
      "settings.theme.light": "claro",
      "settings.theme.dark": "oscuro",
      "settings.theme.change": "Cambiar tema",
      "settings.locked.notice":
        "Estos datos fueron creados por una versión más nueva de la app: no se leen ni se escriben. Elige una salida:",
      "settings.exportRaw": "Exportar JSON crudo",
      "settings.clear": "Vaciar todos los datos",
      "settings.hint":
        "Los datos viven en este navegador: copiar la carpeta no los transporta. Exporta un backup para moverlos a otro equipo.",
      "settings.section.backup": "Copia de seguridad",
      "settings.exportBackup": "Exportar backup JSON",
      "settings.section.restore": "Restaurar desde un fichero",
      "settings.section.danger": "Zona de peligro",
      "settings.import.label": "Elegir fichero de backup (.json)",
      "settings.reminder.label": "Recordatorio de backup: {freq} · último backup: {last}",
      "settings.reminder.freq.never": "nunca",
      "settings.reminder.freq.every": "cada {days} días",
      "settings.reminder.tab.7": "7 días",
      "settings.reminder.tab.14": "14 días",
      "settings.reminder.tab.30": "30 días",
      "settings.reminder.tab.never": "Nunca",
      "settings.reminder.aria": "Frecuencia del recordatorio de backup",
      "settings.reminder.saveFailed": "No se pudo guardar el recordatorio: {message}",
      "settings.reminder.changed": "Recordatorio de backup: {freq}.",
      "settings.exportFailed": "No se pudo exportar: {message}",
      "settings.exportRawDone": "JSON crudo exportado: {name}",
      "settings.exportDone": "Backup exportado: {name}",
      "settings.readFailed": "No se pudo leer el fichero seleccionado.",
      "settings.importFailed": "No se importó nada: {message}",
      "import.title": "Importar backup",
      "import.intro": "Vas a importar {file}.",
      "import.body":
        "Se sobrescribirán todos los datos actuales ({current}) por los del fichero ({next}). Esta acción no se puede deshacer.",
      "import.safe": "Cancelar o un fichero inválido no cambian nada.",
      "import.confirm": "Importar y sobrescribir",
      "import.cancelled": "Importación cancelada: no cambió nada.",
      "import.done": "Backup importado ({counts}).",
      "import.failed": "No se pudo importar: {message}",
      "import.count.routines.one": "{count} rutina",
      "import.count.routines.other": "{count} rutinas",
      "import.count.entries.one": "{count} registro",
      "import.count.entries.other": "{count} registros",
      "import.count.goals.one": "{count} objetivo",
      "import.count.goals.other": "{count} objetivos",
      "import.count.all": "{routines}, {entries} y {goals}",
      "clear.title": "Vaciar todos los datos",
      "clear.lead": "Se eliminarán ",
      "clear.all": "todas",
      "clear.tail":
        " las rutinas, registros, objetivos y preferencias guardados en este navegador.",
      "clear.noRemote":
        "No hay copia remota: exporta un backup antes si quieres conservar los datos.",
      "clear.continue": "Continuar",
      "clear.title2": "Última confirmación",
      "clear.undoable":
        "Esta acción no se puede deshacer: se borrarán todas las claves mirutina.* de este navegador.",
      "clear.ask": "¿Vaciar ahora {counts}?",
      "clear.confirm": "Sí, vaciar todo",
      "clear.failed": "No se pudieron vaciar los datos: {message}",
      "clear.done": "Datos vaciados: la app empieza de cero.",
      // Gráficos
      "chart.bars.aria": "Cumplimiento por rutina: {items}",
      "chart.bars.item": "{label} {percent} por ciento",
      "chart.mini.aria": "Cumplimiento de los últimos 7 días",
      "chart.line.aria": "Porcentaje diario de los últimos 7 días",
      "chart.days.empty": "{prefix}: sin datos.",
      "chart.days.none": "sin datos.",
      "chart.days.item": "{date}, {percent} por ciento",
      "chart.donut.aria":
        "Registros cumplidos: {completed} de {total}; no cumplidos: {pending}.",
      "chart.donut.caption": "cumplidos",
      "chart.donut.completed": "Cumplidos",
      "chart.donut.pending": "No cumplidos",
      "chart.line.tooltip": "{day} {date} · {percent} %",
      // Fechas y duraciones (formato por locale)
      "date.calendarDay": "{weekday} {rest}",
      // Iniciales de columna (convención de cada idioma: en español X = miércoles)
      "weekday.initial.1": "L",
      "weekday.initial.2": "M",
      "weekday.initial.3": "X",
      "weekday.initial.4": "J",
      "weekday.initial.5": "V",
      "weekday.initial.6": "S",
      "weekday.initial.7": "D",
      "duration.minutes": "{minutes} min",
      "duration.shortMinutes": "{minutes}m",
      "duration.hoursMinutes": "{hours} h {minutes} min",
      "duration.hours": "{hours} h",
    },
    en: {
      "noscript":
        "MiRutina needs JavaScript to work. Enable JavaScript in your browser and reload the page.",
      "nav.home.aria": "Mi Rutina, go to home",
      "nav.primary": "Main navigation",
      "nav.home": "Home",
      "nav.routines": "Routines",
      "nav.log": "Today",
      "nav.history": "History",
      "nav.stats": "Statistics",
      "nav.goals": "Goals",
      "nav.settings": "Settings",
      "nav.theme.toLight": "Switch to the light theme",
      "nav.theme.toDark": "Switch to the dark theme",
      "nav.language.toEn": "Switch to English",
      "nav.language.toEs": "Switch to Spanish",
      "nav.language.changed": "Language: English.",
      "nav.language.saveFailed": "Couldn't save the language: {message}",
      "footer.note": "MiRutina © {year} — Personal project",
      "section.inicio": "Home",
      "section.registro": "Daily log",
      "section.rutinas": "Routines",
      "section.historial": "History",
      "section.estadisticas": "Statistics",
      "section.objetivos": "Goals",
      "screen.inicio": "Home",
      "screen.registro": "Log",
      "screen.rutinas": "Routines",
      "screen.historial": "History",
      "screen.estadisticas": "Statistics",
      "screen.objetivos": "Goals",
      "screen.locked": "Incompatible data",
      "app.documentTitle": "{title} — MiRutina",
      "common.close": "Close",
      "common.cancel": "Cancel",
      "common.confirm": "Confirm",
      "common.save": "Save",
      "common.delete": "Delete",
      "common.edit": "Edit",
      "common.apply": "Apply",
      "common.progress": "Progress",
      "common.filters": "Filters",
      "common.toast.close": "Close notification",
      "common.today": "Today",
      "common.previous": "Previous",
      "common.next": "Next",
      "common.current": "Current",
      "common.proposed": "Proposed",
      "common.day": "Day",
      "common.hours24": "of 24h",
      "common.free": "{value} free",
      "common.never": "never",
      "common.unknownError": "unknown error",
      "common.unnamed": "Unnamed",
      "common.percent": "{value}%",
      "common.dash": "—",
      "dialog.title": "Confirm",
      "storage.locked":
        "This data was created by a newer version of the app. Export the raw JSON or clear the data to continue.",
      "storage.unavailable":
        "Data can't be saved in this browser: localStorage is not available.",
      "storage.quota": "There is no space left to save in this browser (storage quota exceeded).",
      "storage.corruptedJson": "Corrupted JSON in the key; the collection is treated as empty.",
      "storage.serializeFailed": "The value could not be serialized to JSON.",
      "storage.unknownCollection": "Unknown collection: {name}",
      "storage.notAList": "The key does not contain a list; the collection is treated as empty.",
      "storage.collectionNotList": 'The "{name}" collection must be a list.',
      "storage.holderRequired": "withPersist needs a holder with the live reference { value: list }.",
      "storage.mutateRequired": "withPersist needs a mutate(current) => next function.",
      "storage.mutateNotList": "mutate must return the new list.",
      "storage.themeInvalid": 'The theme must be "dark" or "light".',
      "storage.langInvalid": 'The language must be "es" or "en".',
      "storage.focusInvalid": "Focus mode needs { date, routineIds }.",
      "storage.reminderInvalid": "The reminder frequency must be {days} days.",
      "storage.lastExportInvalid": "The last export must be a valid ISO date.",
      "storage.exportLocked": "With a locked schema use exportRaw (raw JSON).",
      "storage.expectedJson": "Expected the JSON content of the file.",
      "storage.notJson": "The file is not valid JSON.",
      "storage.notBackup": "The file does not have the format of a MiRutina backup.",
      "storage.wrongApp": 'The file does not look like a MiRutina backup (app is not "mirutina").',
      "storage.schemaMissing": "The backup does not state a valid schema version.",
      "storage.schemaUnknown": "Unrecognized schema version in the backup: {version}.",
      "storage.collectionMissing": 'The backup does not include the "{name}" collection as a list.',
      "storage.collectionEntries":
        'The "{name}" collection in the backup contains entries that are not objects.',
      "storage.backupThemeInvalid": 'The backup theme must be "dark" or "light".',
      "storage.backupFocusInvalid": "The backup focus mode must be { date, routineIds } or null.",
      "error.saveFailed": "Couldn't save: {message}",
      "error.corruptedCollection":
        'The "{name}" collection holds damaged data (corrupted JSON); it starts empty. The other collections are untouched.',
      "banner.storage.title": "Data can't be saved in this browser. ",
      "banner.storage.text":
        "localStorage is not available: changes revert instantly and the app stays in read-only mode.",
      "banner.storage.ok": "Got it",
      "lock.empty.title": "Data created by a newer version of the app",
      "lock.empty.description":
        "This data was created by a newer version of MiRutina and will not be read or modified. You can export the raw JSON or clear the data from Settings to continue.",
      "backup.banner.strong.one": "No backup for {count} day. ",
      "backup.banner.strong.other": "No backup for {count} days. ",
      "backup.banner.text":
        "Your data lives only in this browser: export a JSON so you don't lose it.",
      "backup.banner.export": "Export now",
      "backup.banner.later": "Not now",
      "backup.banner.later.aria": "Dismiss the backup reminder",
      "dash.greeting.morning": "Good morning",
      "dash.greeting.afternoon": "Good afternoon",
      "dash.greeting.night": "Good evening",
      "dash.streak.aria.one": "Overall streak: {count} day",
      "dash.streak.aria.other": "Overall streak: {count} days",
      "dash.streak.pill.one": "{count}-day streak",
      "dash.streak.pill.other": "{count}-day streak",
      "dash.shield.title": "Free days that don't break the streak",
      "dash.shield.aria": "Shields available in {year}: {left} of {max}",
      "dash.shield.pill": "Shields: {left}/{max}",
      "dash.registerToday": "Log today",
      "dash.cards.aria": "Summary",
      "dash.card.today": "Today",
      "dash.card.week": "This week",
      "dash.card.month": "This month",
      "dash.card.minutes": "Minutes today",
      "dash.routinesCount.one": "{done}/{total} routine",
      "dash.routinesCount.other": "{done}/{total} routines",
      "dash.minutesHint": "of {minutes} min",
      "dash.today.title": "Today's routines",
      "dash.today.goLog": "Go to log",
      "dash.today.empty": "No routines scheduled for today.",
      "dash.today.emptyAction": "Create the first routine",
      "dash.week.title": "Last 7 days",
      "dash.week.legend": "Green ≥ 70% · Yellow 40–69% · Red < 40%",
      "dash.streaks.title": "Top streaks",
      "dash.streaks.empty": "No routines with a streak to show yet.",
      "dash.goals.title": "Active goals",
      "dash.goals.empty": "No goals yet.",
      "dash.goals.emptyAction": "Create the first one",
      "dash.goals.progressAria": "Progress of {title}",
      "dash.goals.numbers": "{progress} / {target} · real {percent}",
      "dash.quick.aria": "Quick links",
      "check.mark": "Mark {name}",
      "check.unmark": "Unmark {name}",
      "toast.future": "Future dates can't be logged.",
      "toast.routineMissing": "The routine no longer exists.",
      "toast.routineUnmarked": "“{name}” unmarked.",
      "toast.routineMarked": "“{name}” marked as done.",
      "toast.setAll.noneToMark": "No routines left to mark.",
      "toast.setAll.noneMarked": "No routines marked on this day.",
      "toast.setAll.marked.one": "{count} routine marked.",
      "toast.setAll.marked.other": "{count} routines marked.",
      "toast.setAll.unmarked.one": "{count} routine unmarked.",
      "toast.setAll.unmarked.other": "{count} routines unmarked.",
      "note.label": "Note",
      "note.placeholder": "Add a note…",
      "note.placeholderDisabled": "Mark the routine to add a note",
      "note.saved": "Note saved.",
      "note.savedHint": "Saved ✓",
      "note.needMark": "Mark the routine to add a note.",
      "note.limit": "The note can't exceed {max} characters.",
      "note.overLimit":
        "The note can't exceed {max} characters; it won't be saved until you shorten it.",
      "note.saveFailed": "Couldn't save the note: {message}",
      "cal.title": "Quick log",
      "cal.section.aria": "Monthly quick log",
      "cal.prevMonth": "Previous month",
      "cal.nextMonth": "Next month",
      "cal.grid.aria": "Calendar for {month}",
      "cal.state.future": "future day",
      "cal.state.muted": "before your routines",
      "cal.state.none": "no routines scheduled",
      "cal.state.noneShielded": "no routines scheduled, shielded",
      "cal.state.counts": "{done} of {total} completed",
      "cal.state.full": "full day, {rest}",
      "cal.state.shielded": ", shielded",
      "cal.shield.label": "shielded",
      "cal.legend.full": "Completed",
      "cal.legend.partial": "Partial",
      "cal.legend.empty": "Not completed",
      "cal.legend.none": "Not scheduled",
      "cal.panel.fullDay": "Full day",
      "cal.panel.shieldDay": "Shielded day",
      "cal.panel.close": "Close the selected day",
      "cal.panel.empty": "No routines were scheduled that day.",
      "cal.panel.counts": "Completed: {done}/{total}",
      "hist.title": "History",
      "hist.weekNav": "Week navigation",
      "hist.prevWeek": "Previous week",
      "hist.nextWeek": "Next week",
      "hist.futureWeek": "No data yet (future week)",
      "hist.summary.aria": "Week summary",
      "hist.summary.title": "Week from {start} to {end}",
      "hist.summary.counts.one": "{done} of {total} routine completed",
      "hist.summary.counts.other": "{done} of {total} routines completed",
      "hist.summary.progress": "Week completion",
      "hist.summary.hint": "Future days neither score nor penalize (Monday-to-Sunday week).",
      "hist.summary.shields": "Shields: {left}/{max} · {year}",
      "hist.empty.title": "No routines yet",
      "hist.empty.description":
        "Create routines to start logging their completion and see it here.",
      "hist.empty.action": "Go to Routines",
      "hist.days.aria": "Days of the week",
      "hist.day.aria": "{title} {date}",
      "hist.day.ariaToday": "{title} {date} (today)",
      "hist.indicator.future": "not logged (future day)",
      "hist.indicator.done": "completed",
      "hist.indicator.missed": "not completed",
      "hist.jump.label": "Jump to the week of…",
      "hist.jump.submit": "Go to week",
      "hist.jump.error": "Pick a date to jump to its week.",
      "hist.jump.aria": "Jump to a week",
      "shield.dayPill": "Shielded day",
      "shield.remove": "Remove",
      "shield.remove.aria": "Remove the shield from {date}",
      "shield.apply": "Apply shield",
      "shield.apply.aria": "Apply a shield to {date}",
      "shield.noneLeft": "No shields left in {year}",
      "shield.noRoom": "No shields left in {year}.",
      "shield.protects": "This day won't break the streak",
      "shield.left": "{left}/{max} available in {year}",
      "shield.exists": "That day already has a shield.",
      "shield.missing": "That day has no shield.",
      "toast.shield.future": "A shield can't be applied to a future day.",
      "toast.shield.removed": "Shield removed from {date}.",
      "toast.shield.applied": "Shield applied to {date}: that day won't break the streak.",
      "stats.title": "Statistics",
      "stats.filter.aria": "Period filter",
      "stats.tab.week": "Week",
      "stats.tab.month": "Month",
      "stats.tab.year": "Year",
      "stats.tab.custom": "Custom",
      "stats.period.week": "This week",
      "stats.period.month": "This month",
      "stats.period.year": "This year",
      "stats.period.custom": "Custom",
      "stats.range": "{period}: {start} to {end}",
      "stats.custom.start": "Start",
      "stats.custom.end": "End",
      "stats.custom.startError": "Select the start date.",
      "stats.custom.endError": "Select the end date.",
      "stats.custom.errorOrder": "The start date must be earlier than or equal to the end date.",
      "stats.custom.errorFuture": "The end date can't be later than today.",
      "stats.cards.aria": "Period summary",
      "stats.card.percent": "Overall completion",
      "stats.card.percentHint": "No data in this period",
      "stats.card.completed": "Completed entries",
      "stats.card.completedHint": "Routines marked in the period",
      "stats.card.total": "Total entries",
      "stats.card.totalHint": "Scheduled: completed + not completed",
      "stats.card.lifetime": "Lifetime time",
      "stats.card.lifetimeHint": "All-time total · independent of the filter",
      "stats.byRoutine": "Completion by routine",
      "stats.global": "Overall",
      "stats.empty.period.title": "No data in this period",
      "stats.empty.period.description":
        "No routines are scheduled within the selected range.",
      "stats.empty.donut.title": "No entries in this period",
      "stats.empty.donut.description":
        "Once there are scheduled routines you'll see the completion donut here.",
      "stats.detail": "Detail by routine",
      "stats.empty.detail.title": "No detail by routine",
      "stats.empty.detail.description": "The selected period has no scheduled routines.",
      "stats.last7": "Last 7 days",
      "stats.empty.line.title": "No routines to show",
      "stats.empty.line.description": "Create routines to see the daily completion of the week.",
      "stats.streaks": "Current streak by routine",
      "stats.empty.streaks.description": "Create routines to see their current streak here.",
      "stats.table.routine": "Routine",
      "stats.table.counts": "Completed / scheduled",
      "stats.table.percent": "%",
      "stats.table.lifetime": "Total time",
      "stats.table.progress": "Progress",
      "stats.table.progressAria": "Completion of {name} in the period",
      "stats.streakDays.one": "🔥 {count} day",
      "stats.streakDays.other": "🔥 {count} days",
      "cmp.title": "Comparisons",
      "cmp.week": "This week vs. last week",
      "cmp.month": "This month vs. last month",
      "cmp.hint":
        "The current week and month are compared against the same span of the previous period (up to today). This section does not depend on the period filter.",
      "cmp.noPreviousRange": "no previous period",
      "cmp.vs": "vs. {range}",
      "cmp.empty": "No data in either period: there's nothing to compare yet.",
      "cmp.noPreviousData": "No data for the previous period: there's no base to compute deltas.",
      "cmp.currentEmpty": "The current period has no scheduled routines.",
      "cmp.metric.percent": "Completion",
      "cmp.metric.completed": "Routines completed",
      "cmp.metric.minutes": "Time completed",
      "cmp.metric.fullDays": "Days at 100%",
      "cmp.delta.points": "{value} pts",
      "cmp.delta.flat": "No change",
      "cmp.previous": "Before: {value}",
      "log.title": "Daily log",
      "log.date": "Date",
      "log.prevDay": "Previous day",
      "log.nextDay": "Next day",
      "log.futureError": "You can't log a future date; only today and earlier days.",
      "log.summary.aria": "Day summary",
      "log.metric.progress": "Progress",
      "log.metric.completed": "Completed",
      "log.metric.scheduledTime": "Scheduled time",
      "log.metric.completedTime": "Completed time",
      "log.progressAria": "Day completion",
      "log.occupancy": "Day occupancy: {value}",
      "log.freeTime": "Free time: {value}",
      "log.occupancy.aria": "Percentage of the 24 hours occupied by routines",
      "log.checklist.title": "Routines of the day",
      "log.checklist.aria": "Routines of the day",
      "log.bulk.markAll": "Mark all",
      "log.bulk.unmarkAll": "Unmark all",
      "log.empty.title": "No routines scheduled for this day",
      "log.empty.description":
        "Schedule routines from the Routines screen and come back here to log them.",
      "log.focusEmpty.title": "No priorities selected",
      "log.focusEmpty.description": "Pick up to {max} routines in Focus mode to see them here.",
      "log.notes": "Notes",
      "focus.title": "Focus mode",
      "focus.counter": "Priorities: {count}/{max}",
      "focus.hint":
        "Pick up to {max} priorities for the day: the list shows only those routines and “Mark all” acts on them.",
      "focus.chips.aria": "Priorities of the day",
      "focus.add": "Add to priorities: {name}",
      "focus.remove": "Remove from priorities: {name}",
      "focus.off": "Focus mode off.",
      "focus.on": "Focus mode on: pick up to {max} priorities.",
      "focus.max": "Up to {max} priorities per day.",
      "goals.aria.create": "Create goal",
      "goals.aria.edit": "Edit goal",
      "goals.title": "Goals",
      "goals.new": "New goal",
      "goals.tabs.aria": "Goals view",
      "goals.tab.list": "List",
      "goals.tab.manual": "Manual adjust",
      "goals.filter.all": "All",
      "goals.filter.aria": "Filter by year",
      "goals.filter.groupAria": "Goals filter by year",
      "goals.list.aria": "Goals list",
      "goals.empty.year": "No goals in {year}.",
      "goals.stat.progress": "Progress",
      "goals.stat.target": "Target",
      "goals.stat.percent": "% real",
      "goals.links.none": "No linked routines",
      "goals.links.some": "Linked: {names}",
      "goals.action.adjust": "Adjust",
      "goals.manual.aria": "Manual progress adjustment",
      "goals.manual.empty.title": "No goals yet",
      "goals.manual.empty.description": "Create a goal to adjust its progress by hand.",
      "goals.manual.create": "Create goal",
      "goals.manual.quickAria": "Quick adjustments for {title}",
      "goals.manual.add": "Add {value} to {title}",
      "goals.manual.subtract": "Subtract {value} from {title}",
      "goals.manual.freeLabel": "Free value with sign",
      "goals.manual.freeHint": "Signed integer, e.g. −3 or 12 (floor 0, no cap).",
      "goals.manual.numbers": "{progress} / {target} · {percent}",
      "goals.manual.floor": "The progress of “{title}” is already at 0 (minimum floor).",
      "goals.manual.adjusted": "Progress of “{title}”: {after} ({delta}).",
      "goals.missing": "The goal no longer exists.",
      "goals.created": "Goal “{title}” created.",
      "goals.updated": "Goal “{title}” updated.",
      "goals.deleted": "Goal “{title}” deleted.",
      "goals.form.placeholderTitle": "E.g. Run 500 km this year",
      "goals.form.placeholderDescription": "Details, motivation, etc.",
      "goals.form.ariaYear": "Year",
      "goals.form.ariaTarget": "Target",
      "goals.form.ariaProgress": "Initial progress",
      "goals.form.ariaColor": "Color picker",
      "goals.form.group.identity": "Identity",
      "goals.form.group.numbers": "Target and progress",
      "goals.form.group.appearance": "Appearance and links",
      "goals.form.label.title": "Title",
      "goals.form.label.description": "Description (optional)",
      "goals.form.label.year": "Year",
      "goals.form.label.target": "Target",
      "goals.form.label.progress": "Initial progress",
      "goals.form.label.color": "Color",
      "goals.form.hint.year": "Calendar year of the goal.",
      "goals.form.hint.target": "Target value (e.g. 500 km, 12 books…)",
      "goals.form.hint.progress": "Integer greater than or equal to 0.",
      "goals.form.links.empty":
        "No routines yet; you can link them later from the Routines screen.",
      "goals.form.links.legend": "Linked routines",
      "goals.form.links.hint":
        "Choose which routines feed this goal. Marking a linked routine adds +1 and unmarking subtracts −1.",
      "goals.form.error.year": "The year must be an integer.",
      "goals.form.error.color": "Enter a color in #RRGGBB format.",
      "goals.form.error.title": "The title is required.",
      "goals.form.error.colorInvalid": "Invalid color: use the #RRGGBB format.",
      "goals.form.error.target": "The target must be an integer greater than 0.",
      "goals.form.error.progress": "The initial progress must be an integer greater than or equal to 0.",
      "goals.form.error.manualDelta": "Enter an integer other than zero.",
      "goals.delete.title": "Delete goal",
      "goals.delete.intro": "You're about to delete {name}.",
      "goals.delete.body":
        "The goal and its progress will be deleted; linked routines are not modified.",
      "rt.aria.create": "Create routine",
      "rt.aria.edit": "Edit routine",
      "rt.title": "My Routines",
      "rt.new": "New routine",
      "rt.list.aria": "Routines list",
      "rt.empty.title": "No routines yet",
      "rt.empty.description":
        "Create your first routine to start logging completion and goals.",
      "rt.empty.action": "Create the first routine",
      "rt.days.aria": "Days of the week",
      "rt.day.scheduled": "{day}: scheduled",
      "rt.day.notScheduled": "{day}: not scheduled",
      "rt.active.ariaOn": "Deactivate {name}",
      "rt.active.ariaOff": "Activate {name}",
      "rt.inactive": "Inactive",
      "rt.lifetime.title": "Completed days × routine duration (all-time)",
      "rt.lifetime": "Invested: {value}",
      "rt.missing": "The routine no longer exists.",
      "rt.created": "Routine “{name}” created.",
      "rt.updated": "Routine “{name}” updated.",
      "rt.alreadyActive": "The routine was already active.",
      "rt.alreadyInactive": "The routine was already deactivated.",
      "rt.activateBlocked": "“{name}” can't be activated: {days}.",
      "rt.activated": "“{name}” activated.",
      "rt.deactivated": "“{name}” deactivated.",
      "rt.deleted": "Routine “{name}” deleted with its entries.",
      "rt.exceeded": "Can't save: {days}.",
      "rt.exceededDay": "{day} (+{duration})",
      "rt.saveFailed": "Couldn't save: {message}",
      "rt.deleteFailed": "Couldn't delete: {message}",
      "rt.form.placeholderName": "E.g. Run, Read, Meditate…",
      "rt.form.placeholderDescription": "Details, motivation, etc.",
      "rt.form.ariaHours": "Hours",
      "rt.form.ariaMinutes": "Minutes",
      "rt.form.ariaColor": "Color picker",
      "rt.form.group.identity": "Identity",
      "rt.form.group.schedule": "Schedule",
      "rt.form.group.status": "Status",
      "rt.form.label.name": "Name",
      "rt.form.label.description": "Description (optional)",
      "rt.form.label.color": "Color",
      "rt.form.label.duration": "Duration",
      "rt.form.hint.duration": "Between 1 minute and 24 h.",
      "rt.form.active": "Active routine",
      "rt.form.activeHint":
        "On save, an active routine checks the 24 h per day limit; deactivating is always allowed (it only affects future days).",
      "rt.form.error.weekdays": "Select at least one day of the week.",
      "rt.form.error.weekdayInvalid": "There is an invalid day of the week.",
      "rt.form.error.durationIntegers": "The duration must be given as whole hours and minutes.",
      "rt.form.error.durationMinutes": "Minutes must be between 0 and 59; express the rest as hours.",
      "rt.form.error.durationHours": "Hours must be between 0 and 24.",
      "rt.form.error.durationMax": "The maximum duration is 24h 00m.",
      "rt.form.error.durationZero": "The duration must be greater than 0.",
      "rt.form.error.name": "The name is required.",
      "rt.form.error.color": "Enter a color in #RRGGBB format.",
      "rt.form.error.colorInvalid": "Invalid color: use the #RRGGBB format.",
      "rt.weekdays.legend": "Days of the week *",
      "rt.weekdays.markAll": "Mark all",
      "rt.weekdays.unmarkAll": "Unmark all",
      "rt.weekdays.free": "{value} free",
      "rt.free.title": "Free time per day",
      "rt.free.hint": "Current → with the proposal. In red, the days that would exceed 24 h.",
      "rt.free.exceeds": "exceeds",
      "rt.free.exceedsTitle": "Exceeds the 24 h of the day",
      "rt.delete.title": "Delete routine",
      "rt.delete.intro": "You're about to delete {name}.",
      "rt.delete.body":
        "Its completion entries and its links to goals will also be deleted; statistics will be recalculated.",
      "settings.title": "Settings",
      "settings.data.aria": "Data",
      "settings.theme.current": "Current theme: {theme}",
      "settings.theme.light": "light",
      "settings.theme.dark": "dark",
      "settings.theme.change": "Change theme",
      "settings.locked.notice":
        "This data was created by a newer version of the app: it is neither read nor written. Choose an exit:",
      "settings.exportRaw": "Export raw JSON",
      "settings.clear": "Clear all data",
      "settings.hint":
        "Data lives in this browser: copying the folder doesn't carry it. Export a backup to move it to another device.",
      "settings.section.backup": "Backup",
      "settings.exportBackup": "Export backup JSON",
      "settings.section.restore": "Restore from a file",
      "settings.section.danger": "Danger zone",
      "settings.import.label": "Choose backup file (.json)",
      "settings.reminder.label": "Backup reminder: {freq} · last backup: {last}",
      "settings.reminder.freq.never": "never",
      "settings.reminder.freq.every": "every {days} days",
      "settings.reminder.tab.7": "7 days",
      "settings.reminder.tab.14": "14 days",
      "settings.reminder.tab.30": "30 days",
      "settings.reminder.tab.never": "Never",
      "settings.reminder.aria": "Backup reminder frequency",
      "settings.reminder.saveFailed": "Couldn't save the reminder: {message}",
      "settings.reminder.changed": "Backup reminder: {freq}.",
      "settings.exportFailed": "Couldn't export: {message}",
      "settings.exportRawDone": "Raw JSON exported: {name}",
      "settings.exportDone": "Backup exported: {name}",
      "settings.readFailed": "The selected file couldn't be read.",
      "settings.importFailed": "Nothing was imported: {message}",
      "import.title": "Import backup",
      "import.intro": "You're about to import {file}.",
      "import.body":
        "All current data ({current}) will be overwritten with the file's data ({next}). This action can't be undone.",
      "import.safe": "Canceling, or an invalid file, changes nothing.",
      "import.confirm": "Import and overwrite",
      "import.cancelled": "Import canceled: nothing changed.",
      "import.done": "Backup imported ({counts}).",
      "import.failed": "Couldn't import: {message}",
      "import.count.routines.one": "{count} routine",
      "import.count.routines.other": "{count} routines",
      "import.count.entries.one": "{count} entry",
      "import.count.entries.other": "{count} entries",
      "import.count.goals.one": "{count} goal",
      "import.count.goals.other": "{count} goals",
      "import.count.all": "{routines}, {entries} and {goals}",
      "clear.title": "Clear all data",
      "clear.lead": "All ",
      "clear.all": "saved data",
      "clear.tail":
        " (routines, entries, goals and preferences) in this browser will be deleted.",
      "clear.noRemote": "There's no remote copy: export a backup first if you want to keep the data.",
      "clear.continue": "Continue",
      "clear.title2": "Final confirmation",
      "clear.undoable":
        "This action can't be undone: every mirutina.* key will be deleted from this browser.",
      "clear.ask": "Clear {counts} now?",
      "clear.confirm": "Yes, clear everything",
      "clear.failed": "Couldn't clear the data: {message}",
      "clear.done": "Data cleared: the app starts from scratch.",
      "chart.bars.aria": "Completion by routine: {items}",
      "chart.bars.item": "{label} {percent} percent",
      "chart.mini.aria": "Completion of the last 7 days",
      "chart.line.aria": "Daily percentage of the last 7 days",
      "chart.days.empty": "{prefix}: no data.",
      "chart.days.none": "no data.",
      "chart.days.item": "{date}, {percent} percent",
      "chart.donut.aria":
        "Completed entries: {completed} of {total}; not completed: {pending}.",
      "chart.donut.caption": "completed",
      "chart.donut.completed": "Completed",
      "chart.donut.pending": "Not completed",
      "chart.line.tooltip": "{day} {date} · {percent}%",
      "date.calendarDay": "{weekday}, {rest}",
      "weekday.initial.1": "M",
      "weekday.initial.2": "T",
      "weekday.initial.3": "W",
      "weekday.initial.4": "T",
      "weekday.initial.5": "F",
      "weekday.initial.6": "S",
      "weekday.initial.7": "S",
      "duration.minutes": "{minutes} min",
      "duration.shortMinutes": "{minutes}m",
      "duration.hoursMinutes": "{hours}h {minutes}m",
      "duration.hours": "{hours}h",
    },
  };

  // ---- Traductor -----------------------------------------------------------

  /** Plantilla de una clave: idioma activo o español (base) si falta. */
  function template(key) {
    var table = strings[locale];
    if (table && Object.prototype.hasOwnProperty.call(table, key)) {
      return table[key];
    }
    var base = strings[DEFAULT_LOCALE];
    return Object.prototype.hasOwnProperty.call(base, key) ? base[key] : undefined;
  }

  function interpolate(text, params) {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;
    });
  }

  /**
   * Traduce una clave con parámetros `{nombre}`.
   * Clave desconocida → se devuelve la clave (fallo visible, nunca texto a medias).
   * @param {string} key
   * @param {Object} [params]
   * @returns {string}
   */
  function t(key, params) {
    var text = template(key);
    if (text === undefined) return key;
    return interpolate(text, params);
  }

  /**
   * Variante con plural: usa `clave.one` con count 1 y `clave.other` si no
   * (regla de español e inglés).
   * @param {string} key
   * @param {number} count
   * @param {Object} [params] Se añade `count` si no viene.
   * @returns {string}
   */
  function plural(key, count, params) {
    var form = count === 1 ? "one" : "other";
    var merged = Object.assign({ count: count }, params || {});
    return t(key + "." + form, merged);
  }

  function has(key) {
    return template(key) !== undefined;
  }

  /** Diccionario del idioma activo (copia; para verificación manual). */
  function dictionary() {
    return Object.assign({}, strings[locale]);
  }

  /** Compara los diccionarios: claves que faltan o sobran en cada idioma. */
  function auditKeys() {
    var base = Object.keys(strings[DEFAULT_LOCALE]);
    var report = { missingIn: {}, extraIn: {} };
    LOCALES.forEach(function (code) {
      var keys = Object.keys(strings[code]);
      report.missingIn[code] = base.filter(function (key) {
        return keys.indexOf(key) === -1;
      });
      report.extraIn[code] = keys.filter(function (key) {
        return base.indexOf(key) === -1;
      });
    });
    return report;
  }

  // ---- Idioma activo -------------------------------------------------------

  function isLocale(value) {
    return LOCALES.indexOf(value) !== -1;
  }

  function getLocale() {
    return locale;
  }

  /** Locale completo para `Intl` ("es-ES" / "en-US"). */
  function intlLocale() {
    return INTL_LOCALES[locale] || INTL_LOCALES[DEFAULT_LOCALE];
  }

  /**
   * Fija el idioma activo y lo refleja en `<html lang>`; un valor no
   * soportado se ignora (queda el idioma actual).
   * @param {string} next
   * @returns {string} idioma en vigor.
   */
  function setLocale(next) {
    if (!isLocale(next)) return locale;
    locale = next;
    document.documentElement.lang = next;
    return locale;
  }

  // ---- Formato por locale --------------------------------------------------

  var numberFormatters = {};
  var dateFormatters = {};

  function numberFormatter(decimals) {
    var key = locale + "|" + decimals;
    if (!numberFormatters[key]) {
      numberFormatters[key] = new Intl.NumberFormat(intlLocale(), {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
    return numberFormatters[key];
  }

  /** Número con separadores del idioma ("1234" / "1,234"). */
  function number(value, decimals) {
    var digits = decimals == null ? 0 : decimals;
    return numberFormatter(digits).format(Number(value) || 0);
  }

  function dateFormatter(options) {
    var key =
      locale +
      "|" +
      Object.keys(options)
        .map(function (name) {
          return name + ":" + options[name];
        })
        .join(",");
    if (!dateFormatters[key]) {
      dateFormatters[key] = new Intl.DateTimeFormat(intlLocale(), options);
    }
    return dateFormatters[key];
  }

  /** `YYYY-MM-DD` (o `YYYY-MM`) como fecha local, sin desfase de zona. */
  function toLocalDate(dateString) {
    var parts = String(dateString).split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2] || 1);
  }

  /** Fecha formateada en la zona local del dispositivo. */
  function formatDate(dateString, options) {
    return dateFormatter(options).format(toLocalDate(dateString));
  }

  function round(value, decimals) {
    var factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  /** Número con signo explícito: "+12", "−3,5" (es) / "−3.5" (en), "0". */
  function signedNumber(value, decimals) {
    var digits = decimals == null ? 1 : decimals;
    var rounded = round(Number(value) || 0, digits);
    if (rounded === 0) return "0";
    return (rounded > 0 ? "+" : "−") + number(Math.abs(rounded), digits);
  }

  /** Porcentaje entero: "75%". */
  function percent(value) {
    return number(Math.round(Number(value) || 0), 0) + "%";
  }

  /** Inicial en mayúscula (meses y días vienen en minúscula en español). */
  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function weekdayLong(weekday) {
    var date = new Date(2024, 0, 1 + ((weekday - 1 + 7) % 7)); // 2024-01-01 = lunes
    return formatDate(toDateString(date), { weekday: "long" });
  }

  function weekdayShort(weekday) {
    var date = new Date(2024, 0, 1 + ((weekday - 1 + 7) % 7));
    return capitalize(formatDate(toDateString(date), { weekday: "short" }));
  }

  /** Inicial de columna del día (charts y calendario): "L"/"X" (es), "M"/"W" (en). */
  function weekdayInitial(weekday) {
    var index = ((Number(weekday) - 1 + 7) % 7) + 1;
    return t("weekday.initial." + index);
  }

  function toDateString(date) {
    var year = String(date.getFullYear()).padStart(4, "0");
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  // Formatos de fecha con nombre para no repetir opciones por la app.

  /** "domingo, 18 de octubre de 2026" / "Sunday, October 18, 2026". */
  function longDate(dateString) {
    return formatDate(dateString, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  /** "6 oct 2026" / "Oct 6, 2026". */
  function longishDate(dateString) {
    return formatDate(dateString, { day: "numeric", month: "short", year: "numeric" });
  }

  /** "18/10/2026" (es) / "10/18/2026" (en). */
  function numericDate(dateString) {
    return formatDate(dateString, { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  /** "18/10" (es) / "10/18" (en). */
  function dayShort(dateString) {
    return formatDate(dateString, { day: "2-digit", month: "2-digit" });
  }

  /** "Octubre de 2026" / "October 2026". */
  function monthTitle(month) {
    return capitalize(formatDate(month, { month: "long", year: "numeric" }));
  }

  /** "jueves 8 de octubre" / "Thursday, October 8". */
  function calendarDate(dateString) {
    var weekday = weekdayLong(weekdayOf(dateString));
    var rest = formatDate(dateString, { day: "numeric", month: "long" });
    return t("date.calendarDay", { weekday: weekday, rest: rest });
  }

  function weekdayOf(dateString) {
    var date = toLocalDate(dateString);
    var index = (date.getDay() + 6) % 7; // 0 = lunes … 6 = domingo
    return index + 1;
  }

  /** "1h 30m" (compacto, igual en ambos idiomas). */
  function duration(minutes) {
    var total = Number(minutes) || 0;
    return Math.floor(total / 60) + "h " + (total % 60) + "m";
  }

  /** Duración de por vida: "42 h 30 min" (es) / "42h 30m" (en). */
  function lifetimeDuration(minutes) {
    var total = Number(minutes) || 0;
    var hours = Math.floor(total / 60);
    var rest = total % 60;
    if (hours === 0) {
      return t("duration.minutes", { minutes: rest });
    }
    if (rest === 0) {
      return t("duration.hours", { hours: hours });
    }
    return t("duration.hoursMinutes", { hours: hours, minutes: rest });
  }

  /** Delta compacto de duración ("30m", "1h 30m"). */
  function deltaDuration(minutes) {
    var total = Number(minutes) || 0;
    return total < 60
      ? t("duration.shortMinutes", { minutes: total })
      : duration(total);
  }

  // ---- DOM estático: data-i18n* -------------------------------------------

  /**
   * Rellena los nodos marcados con `data-i18n` (texto), `data-i18n-aria`
   * (aria-label), `data-i18n-title` (title) y `data-i18n-placeholder`.
   * @param {ParentNode} [root=document]
   */
  function applyStaticDom(root) {
    var scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll("[data-i18n]"), function (node) {
      node.textContent = t(node.getAttribute("data-i18n"));
    });
    [
      { attr: "data-i18n-aria", target: "aria-label" },
      { attr: "data-i18n-title", target: "title" },
      { attr: "data-i18n-placeholder", target: "placeholder" },
    ].forEach(function (pair) {
      Array.prototype.forEach.call(scope.querySelectorAll("[" + pair.attr + "]"), function (node) {
        node.setAttribute(pair.target, t(node.getAttribute(pair.attr)));
      });
    });
  }

  // ---- API pública ---------------------------------------------------------

  window.MiRutina.i18n = {
    LOCALES: LOCALES,
    DEFAULT_LOCALE: DEFAULT_LOCALE,
    isLocale: isLocale,
    getLocale: getLocale,
    setLocale: setLocale,
    intlLocale: intlLocale,
    t: t,
    plural: plural,
    has: has,
    dictionary: dictionary,
    auditKeys: auditKeys,
    applyStaticDom: applyStaticDom,
    // Formato por locale
    number: number,
    signedNumber: signedNumber,
    percent: percent,
    capitalize: capitalize,
    weekdayLong: weekdayLong,
    weekdayShort: weekdayShort,
    weekdayInitial: weekdayInitial,
    longDate: longDate,
    longishDate: longishDate,
    numericDate: numericDate,
    dayShort: dayShort,
    monthTitle: monthTitle,
    calendarDate: calendarDate,
    duration: duration,
    lifetimeDuration: lifetimeDuration,
    deltaDuration: deltaDuration,
  };
})();
