/**
 * MiRutina Vanilla — domain.js
 * Cálculos puros: fechas, duraciones, programación con límite de 24 h,
 * tiempos libres, cumplimiento, periodos, rachas, objetivos, estadísticas
 * y validaciones. Todas las reglas de negocio viven aquí, con "hoy"
 * siempre como parámetro. Sin DOM ni localStorage.
 */
(function () {
  "use strict";

  window.MiRutina = window.MiRutina || {};

  // ---- Fechas como cadenas `YYYY-MM-DD`; los cálculos usan UTC para
  // no verse afectados por husos horarios ni por el cambio de hora.
  // "Hoy" siempre llega como parámetro: aquí no se lee el reloj del sistema.

  const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

  const WEEKDAY_LABELS = {
    1: "lunes",
    2: "martes",
    3: "miércoles",
    4: "jueves",
    5: "viernes",
    6: "sábado",
    7: "domingo",
  };

  // getUTCDay: 0 = domingo … 6 = sábado → 1 = lunes … 7 = domingo.
  const WEEKDAY_BY_JS_DAY = [7, 1, 2, 3, 4, 5, 6];

  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  /** Convierte una `Date` (zona local) a `YYYY-MM-DD`; uso: obtener "hoy" fuera del dominio. */
  function toDateString(date) {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /** Interpreta `YYYY-MM-DD` como medianoche UTC; lanza `Error` si el formato o el día no existen. */
  function parseDate(date) {
    if (!DATE_PATTERN.test(date)) {
      throw new Error(`Invalid date string: ${date}`);
    }
    const [year, month, day] = date.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    const isRealDay =
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day;
    if (!isRealDay) {
      throw new Error(`Invalid date string: ${date}`);
    }
    return parsed;
  }

  /** Formatea los componentes UTC de una `Date` como `YYYY-MM-DD`. */
  function formatDateString(date) {
    const year = String(date.getUTCFullYear()).padStart(4, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /** Suma días naturales a una fecha (admite negativos). */
  function addDays(date, days) {
    const parsed = parseDate(date);
    parsed.setUTCDate(parsed.getUTCDate() + days);
    return formatDateString(parsed);
  }

  /** Día de la semana de una fecha: 1 = lunes … 7 = domingo. */
  function weekdayOf(date) {
    return WEEKDAY_BY_JS_DAY[parseDate(date).getUTCDay()];
  }

  /** Orden cronológico: −1 si `a` es anterior, 0 si igual, 1 si posterior. */
  function compareDates(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  /** Una fecha es futura respecto de "hoy". */
  function isFuture(date, hoy) {
    return compareDates(date, hoy) > 0;
  }

  // ---- Duraciones en minutos enteros internamente; la UI muestra `Xh Ym`.

  const MINUTES_PER_DAY = 24 * 60;

  /** Convierte horas y minutos a minutos totales (conversión pura; la validación es `validateDuration`). */
  function toMinutes(hours, minutes) {
    return hours * 60 + minutes;
  }

  /** Formatea minutos como `Xh Ym` (p. ej. `21h 30m`). */
  function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours}h ${rest}m`;
  }

  /** Duración > 0 y ≤ 24 h; horas 0–24 y minutos 0–59 (24 h solo con 00 m). */
  function validateDuration(hours, minutes) {
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
      return { ok: false, message: "La duración debe expresarse con enteros de horas y minutos." };
    }
    if (minutes < 0 || minutes > 59) {
      return { ok: false, message: "Los minutos deben estar entre 0 y 59; expresa el resto como horas." };
    }
    if (hours < 0 || hours > 24) {
      return { ok: false, message: "Las horas deben estar entre 0 y 24." };
    }
    if (hours === 24 && minutes > 0) {
      return { ok: false, message: "La duración máxima es 24h 00m." };
    }
    const total = toMinutes(hours, minutes);
    if (total <= 0) {
      return { ok: false, message: "La duración debe ser mayor que 0." };
    }
    return { ok: true, value: total };
  }

  // ---- Programación de un día, límite de 24 h y tiempos libres.

  /**
   * Programación de una fecha: rutinas cuyos días la incluyen.
   * Las rutinas inactivas solo quedan fuera de los días futuros (`date >= hoy`);
   * en fechas pasadas siguen contando con sus `weekdays` actuales.
   */
  function scheduleForDate(routines, date, hoy) {
    const weekday = weekdayOf(date);
    const includeInactive = compareDates(date, hoy) < 0;
    return routines.filter(
      (routine) =>
        routine.weekdays.includes(weekday) && (includeInactive || routine.active)
    );
  }

  /**
   * días que quedarían por encima de 24 h al aplicar `candidate`
   * (crear, editar o activar). La versión anterior de la misma rutina (mismo id)
   * se sustituye, de modo que al editar se descuenta su duración anterior.
   * No depende de `hoy`: se evalúa sobre rutinas **activas** por día de la
   * semana (repetición semanal futura — excluye inactivas de lo futuro).
   * Lista vacía = operación permitida (24 h exactas inclusive).
   */
  function checkDailyLimit(routines, candidate) {
    const next = applyCandidate(routines, candidate);
    const exceeded = [];
    for (const weekday of WEEKDAYS) {
      const occupied = occupiedByWeekday(next, weekday);
      if (occupied > MINUTES_PER_DAY) {
        exceeded.push({ weekday, excessMinutes: occupied - MINUTES_PER_DAY });
      }
    }
    return exceeded;
  }

  /**
   * tiempo libre actual y propuesto de los 7 días para el formulario.
   * `routines` es el estado guardado (incluye la versión anterior de `candidate`
   * si existe) y `currentMinutes` es la duración anterior de esa rutina (0 al
   * crear); en edición, el propuesto descuenta primero esa duración anterior.
   * No depende de `hoy`: cuenta solo rutinas **activas** (capacidad
   * semanal recurrente, orientada a días futuros).
   */
  function freeTimeByWeekday(routines, candidate, currentMinutes) {
    const previous = routines.find((routine) => routine.id === candidate.id);
    return WEEKDAYS.map((weekday) => {
      const occupied = occupiedByWeekday(routines, weekday);
      const previousOccupied =
        previous && previous.active && previous.weekdays.includes(weekday)
          ? currentMinutes
          : 0;
      const candidateOccupied =
        candidate.active && candidate.weekdays.includes(weekday)
          ? candidate.durationMinutes
          : 0;
      const proposedOccupied = occupied - previousOccupied + candidateOccupied;
      return {
        weekday,
        actualFreeMinutes: MINUTES_PER_DAY - occupied,
        proposedFreeMinutes: MINUTES_PER_DAY - proposedOccupied,
      };
    });
  }

  /**
   * Minutos ocupados de una fecha por su programación (base de).
   * en fechas pasadas (`date < hoy`) también cuentan las rutinas inactivas.
   */
  function occupiedMinutesForDate(routines, date, hoy) {
    return scheduleForDate(routines, date, hoy).reduce(
      (total, routine) => total + routine.durationMinutes,
      0
    );
  }

  /** Tiempo libre de una fecha en minutos: 24 h − ocupación (0 en día vacío). */
  function freeMinutesForDate(routines, date, hoy) {
    return MINUTES_PER_DAY - occupiedMinutesForDate(routines, date, hoy);
  }

  /** Porcentaje de las 24 h ocupado por la programación de la fecha (puede superar 100 si los datos lo violan). */
  function occupancyPercent(routines, date, hoy) {
    return (occupiedMinutesForDate(routines, date, hoy) / MINUTES_PER_DAY) * 100;
  }

  /** Al menos un día de la semana seleccionado, y todos los días válidos (1–7). */
  function validateWeekdays(weekdays) {
    if (!Array.isArray(weekdays) || weekdays.length === 0) {
      return { ok: false, message: "Selecciona al menos un día de la semana." };
    }
    const allValid = weekdays.every(
      (day) => Number.isInteger(day) && day >= 1 && day <= 7
    );
    if (!allValid) {
      return { ok: false, message: "Hay un día de la semana no válido." };
    }
    return { ok: true, value: weekdays };
  }

  /** Devuelve `routines` con la versión anterior de `candidate` sustituida (o añadida si es nueva). */
  function applyCandidate(routines, candidate) {
    const index = routines.findIndex((routine) => routine.id === candidate.id);
    if (index === -1) {
      return [...routines, candidate];
    }
    const next = [...routines];
    next[index] = candidate;
    return next;
  }

  /** Minutos ocupados en un día de la semana por las rutinas activas. */
  function occupiedByWeekday(routines, weekday) {
    return routines
      .filter((routine) => routine.active && routine.weekdays.includes(weekday))
      .reduce((total, routine) => total + routine.durationMinutes, 0);
  }

  // ---- Cumplimiento de un día y semáforo.
  // Regla central: no cumplida = programada sin marca (solo existe la marca positiva).

  /** Entradas de una fecha concreta (base de `dayCompletion` y de los agregados por periodo). */
  function entriesForDate(entries, date) {
    return entries.filter((entry) => entry.date === date);
  }

  /** ¿Hay marca positiva de `routineId` en estas entradas? Desmarcar borra la entrada. */
  function isMarked(entries, routineId) {
    return entries.some((entry) => entry.routineId === routineId && entry.completed);
  }

  /**
   * Cumplimiento de un día: cumplidas / programadas × 100; 0 sin
   * programadas. `entries` son las entradas de ese día; una rutina
   * programada sin marca cuenta como no cumplida.
   */
  function dayCompletion(entries, schedule) {
    const marked = schedule.filter((routine) => isMarked(entries, routine.id));
    const scheduledMinutes = schedule.reduce(
      (total, routine) => total + routine.durationMinutes,
      0
    );
    const completedMinutes = marked.reduce(
      (total, routine) => total + routine.durationMinutes,
      0
    );
    return {
      percent: schedule.length === 0 ? 0 : (marked.length / schedule.length) * 100,
      scheduledCount: schedule.length,
      completedCount: marked.length,
      scheduledMinutes,
      completedMinutes,
    };
  }

  /** Verde ≥ 70 %, amarillo 40–69 %, rojo < 40 %. */
  function semaforoColor(percent) {
    if (percent >= 70) return "green";
    if (percent >= 40) return "yellow";
    return "red";
  }

  /**
   * Porcentaje diario de los últimos 7 días (de hoy hacia atrás, en
   * orden cronológico). Solo días ≤ hoy: los futuros no puntúan ni penalizan.
   */
  function last7DaysPercents(entries, routines, hoy) {
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = addDays(hoy, -offset);
      const schedule = scheduleForDate(routines, date, hoy);
      const completion = dayCompletion(entriesForDate(entries, date), schedule);
      days.push({ date, percent: completion.percent });
    }
    return days;
  }

  // ---- Periodos de calendario: semana de lunes a
  // domingo y rangos "hasta hoy".: los días futuros no puntúan ni
  // penalizan: quedan fuera del cálculo.

  /** Semana de `hoy`: de lunes a domingo (usa la fecha real). */
  function weekRange(hoy) {
    const start = addDays(hoy, -(weekdayOf(hoy) - 1));
    return { start, end: addDays(start, 6) };
  }

  /** Mes de `hoy`: del día 1 al último día del mes, con la fecha real (años bisiestos). */
  function monthRange(hoy) {
    const parsed = parseDate(hoy); // valida "hoy"
    const year = parsed.getUTCFullYear();
    const month = parsed.getUTCMonth();
    const start = formatDateString(new Date(Date.UTC(year, month, 1)));
    // Día 0 del mes siguiente = último día del mes actual.
    const end = formatDateString(new Date(Date.UTC(year, month + 1, 0)));
    return { start, end };
  }

  /**
   * Porcentaje de cumplimiento de un periodo hasta hoy: acumulado
   * cumplidas / programadas × 100 solo sobre los días transcurridos (incluido
   * hoy). Un `range.end > hoy` se recorta a hoy; un periodo enteramente futuro
   * devuelve 0. Días sin programación no pesan; 0 si no hay nada programado.
   */
  function partialPeriodPercent(entries, routines, range, hoy) {
    const end = compareDates(range.end, hoy) > 0 ? hoy : range.end;
    if (compareDates(range.start, end) > 0) {
      return 0;
    }
    let completed = 0;
    let scheduled = 0;
    for (let date = range.start; compareDates(date, end) <= 0; date = addDays(date, 1)) {
      const schedule = scheduleForDate(routines, date, hoy);
      const dayEntries = entriesForDate(entries, date);
      scheduled += schedule.length;
      completed += schedule.filter((routine) => isMarked(dayEntries, routine.id)).length;
    }
    return scheduled === 0 ? 0 : (completed / scheduled) * 100;
  }

  // ---- Rachas: general 🔥 y por rutina. "Hoy" es
  // mutable: suma si está al 100 % en el momento de calcular; si no, la racha
  // queda en ese momento en 0.

  /** Número de rachas del listado superior del dashboard. */
  const TOP_STREAKS = 4;

  /**
   * Racha general: días consecutivos con el día al 100 %.
   * - Un día sin rutinas programadas cuenta como cumplido.
   * - Hoy incompleto deja la racha en 0 (crece o rompe durante el día).
   * - Sin rutinas creadas → 0.
   * - No se mira antes de la creación de la primera rutina: entonces la racha
   * era 0 (no existía ninguna rutina creada).
   */
  function generalStreak(entries, routines, hoy) {
    if (routines.length === 0) {
      return 0;
    }
    const oldestCreation = earliestCreationDate(routines) ?? hoy;
    let streak = 0;
    let date = hoy;
    while (compareDates(date, oldestCreation) >= 0) {
      const schedule = scheduleForDate(routines, date, hoy);
      const dayEntries = entriesForDate(entries, date);
      // `every` sobre programación vacía = día cumplido.
      const fulfilled = schedule.every((routine) => isMarked(dayEntries, routine.id));
      if (!fulfilled) {
        break;
      }
      streak += 1;
      date = addDays(date, -1);
    }
    return streak;
  }

  /**
   * Racha de una rutina: días consecutivos en los que tocaba
   * y fue cumplida. Los días en los que no toca se saltan sin romper; hoy sin
   * marcar (habiendo tocado) deja la racha en 0. Siendo inactiva, solo
   * cuenta en fechas pasadas y en hoy no.
   */
  function routineStreak(entries, routine, hoy) {
    const oldestCreation = creationDate(routine) ?? hoy;
    let streak = 0;
    let date = hoy;
    while (compareDates(date, oldestCreation) >= 0) {
      if (isDue(routine, date, hoy)) {
        if (!isMarked(entriesForDate(entries, date), routine.id)) {
          break;
        }
        streak += 1;
      }
      date = addDays(date, -1);
    }
    return streak;
  }

  /**
   * rachas por rutina más largas (hasta 4), de mayor a menor; los
   * empates se resuelven por nombre alfabético.
   */
  function topStreaks(entries, routines, hoy) {
    return routines
      .map((routine) => ({ routine, streak: routineStreak(entries, routine, hoy) }))
      .sort(
        (a, b) =>
          b.streak - a.streak || a.routine.name.localeCompare(b.routine.name, "es")
      )
      .slice(0, TOP_STREAKS);
  }

  /** ¿Toca la rutina ese día?: desde hoy en adelante solo cuentan las activas. */
  function isDue(routine, date, hoy) {
    return scheduleForDate([routine], date, hoy).length > 0;
  }

  /** Fecha (local) de creación más antigua entre las rutinas; `null` si ninguna es legible. */
  function earliestCreationDate(routines) {
    let earliest = null;
    for (const routine of routines) {
      const date = creationDate(routine);
      if (date !== null && (earliest === null || date < earliest)) {
        earliest = date;
      }
    }
    return earliest;
  }

  /** Fecha (local) de creación de la rutina; `null` si `createdAt` no es un instante válido. */
  function creationDate(routine) {
    const parsed = new Date(routine.createdAt);
    return Number.isNaN(parsed.getTime()) ? null : toDateString(parsed);
  }

  // ---- Progreso de objetivos
  // +1/−1 simétrico por marca de rutina vinculada, ajustes manuales, suelo 0 y
  // sin tope superior (puede superar la meta y se muestra el valor real).

  /** Cuántos objetivos activos muestra el dashboard. */
  const MAX_ACTIVE_GOALS = 3;

  /**
   * Marcar (+1) o desmarcar (−1) una rutina vinculada.
   * Siempre simétrico sin importar la meta ni el valor actual, con
   * suelo 0 y sin tope superior.
   */
  function applyRoutineToggle(goal, marked) {
    return applyManualAdjust(goal, marked ? 1 : -1);
  }

  /**
   * Ajuste manual del progreso: `delta` con signo (botones
   * ±1/±5/±10/±25/±50 o valor libre validado). Suelo 0, sin tope.
   */
  function applyManualAdjust(goal, delta) {
    return { ...goal, progress: Math.max(0, goal.progress + delta) };
  }

  /**
   * Porcentaje real del objetivo: puede superar 100 % cuando el
   * progreso supera la meta; la barra visual se satura por separado.
   */
  function goalPercent(goal) {
    return (goal.progress / goal.target) * 100;
  }

  /** Saturación de la barra visual en 100 % (el número mostrado usa `goalPercent`). */
  function saturatedBarPercent(goal) {
    return Math.min(goalPercent(goal), 100);
  }

  /**
   * Objetivos activos = del año de `hoy` con progreso < meta;
   * los 3 primeros por fecha de creación (menos de 3 si no hay más).
   */
  function activeGoals(goals, hoy) {
    const year = parseDate(hoy).getUTCFullYear();
    return goalsForYear(goals, year)
      .filter((goal) => goal.progress < goal.target)
      .slice(0, MAX_ACTIVE_GOALS);
  }

  /** Objetivos de un año, ordenados por fecha de creación. */
  function goalsForYear(goals, year) {
    return goals
      .filter((goal) => goal.year === year)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // ---- Agregados de Estadísticas.
  // Definición común: no cumplida = programada sin marca; el periodo se
  // recorta a hoy y los días futuros no puntúan.

  /** Las 3 tarjetas del periodo. */
  function statsSummary(entries, routines, range, hoy) {
    const counts = periodCounts(entries, routines, range, hoy);
    return {
      percent: counts.scheduled === 0 ? 0 : (counts.completed / counts.scheduled) * 100,
      completedCount: counts.completed,
      scheduledCount: counts.scheduled,
    };
  }

  /** Veces cumplida y programada por rutina, solo las programadas en el periodo. */
  function perRoutineStats(entries, routines, range, hoy) {
    const stats = [];
    for (const routine of routines) {
      let completed = 0;
      let scheduled = 0;
      forEachPeriodDay(range, hoy, (date) => {
        if (!scheduleForDate(routines, date, hoy).some((r) => r.id === routine.id)) {
          return;
        }
        scheduled += 1;
        if (isMarked(entriesForDate(entries, date), routine.id)) {
          completed += 1;
        }
      });
      if (scheduled > 0) {
        stats.push({
          routine,
          completedCount: completed,
          scheduledCount: scheduled,
          percent: (completed / scheduled) * 100,
        });
      }
    }
    return stats;
  }

  /** Porciones de la dona cumplidos vs. no cumplidos (misma definición que las tarjetas). */
  function donutData(entries, routines, range, hoy) {
    const counts = periodCounts(entries, routines, range, hoy);
    return { completed: counts.completed, pending: counts.scheduled - counts.completed };
  }

  /**
   * Línea de los últimos 7 días, fija e independiente del filtro
   * de periodo (se recalcula solo con "hoy").
   */
  function last7DaysLine(entries, routines, hoy) {
    return last7DaysPercents(entries, routines, hoy);
  }

  /** Acumula cumplidas y programadas del periodo recortado a hoy. */
  function periodCounts(entries, routines, range, hoy) {
    let completed = 0;
    let scheduled = 0;
    forEachPeriodDay(range, hoy, (date) => {
      const schedule = scheduleForDate(routines, date, hoy);
      const dayEntries = entriesForDate(entries, date);
      scheduled += schedule.length;
      completed += schedule.filter((routine) => isMarked(dayEntries, routine.id)).length;
    });
    return { completed, scheduled };
  }

  /** Itera los días del periodo recortado a hoy; un rango enteramente futuro no itera. */
  function forEachPeriodDay(range, hoy, fn) {
    const end = compareDates(range.end, hoy) > 0 ? hoy : range.end;
    for (let date = range.start; compareDates(date, end) <= 0; date = addDays(date, 1)) {
      fn(date);
    }
  }

  // ---- Validadores de dominio para formularios
  // todo dato que entra por formulario pasa por aquí antes de persistirse.

  /** Meta entera > 0 y progreso inicial entero ≥ 0 (se permite meta < progreso). */
  function validateGoal(input) {
    if (!Number.isInteger(input.target) || input.target <= 0) {
      return { ok: false, message: "La meta debe ser un número entero mayor que 0." };
    }
    if (!Number.isInteger(input.progress) || input.progress < 0) {
      return { ok: false, message: "El progreso inicial debe ser un número entero mayor o igual a 0." };
    }
    return { ok: true, value: input };
  }

  /** Campo de valor libre con signo del ajuste manual (entero distinto de 0). */
  function validateManualDelta(delta) {
    if (!Number.isInteger(delta) || delta === 0) {
      return { ok: false, message: "Introduce un número entero distinto de cero." };
    }
    return { ok: true, value: delta };
  }

  /**
   * Rango personalizado de estadísticas: inicio ≤ fin y fin ≤
   * "hoy"; el error se muestra junto al campo.
   */
  function validateCustomRange(inicio, fin, hoy) {
    if (compareDates(inicio, fin) > 0) {
      return { ok: false, message: "La fecha de inicio debe ser anterior o igual a la de fin." };
    }
    if (compareDates(fin, hoy) > 0) {
      return { ok: false, message: "La fecha de fin no puede ser posterior a hoy." };
    }
    return { ok: true, value: { start: inicio, end: fin } };
  }

  /** Nombre de rutina obligatorio. */
  function validateRoutineName(name) {
    if (typeof name !== "string" || name.trim() === "") {
      return { ok: false, message: "El nombre es obligatorio." };
    }
    return { ok: true, value: name };
  }

  /** Título de objetivo obligatorio. */
  function validateGoalTitle(title) {
    if (typeof title !== "string" || title.trim() === "") {
      return { ok: false, message: "El título es obligatorio." };
    }
    return { ok: true, value: title };
  }

  /** Color en formato `#RRGGBB` (selector + entrada manual). */
  function validateHexColor(color) {
    if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return { ok: false, message: "Color inválido: usa el formato #RRGGBB." };
    }
    return { ok: true, value: color };
  }

  window.MiRutina.domain = {
    // date
    WEEKDAYS,
    WEEKDAY_LABELS,
    toDateString,
    parseDate,
    formatDateString,
    addDays,
    weekdayOf,
    compareDates,
    isFuture,
    // duration
    MINUTES_PER_DAY,
    toMinutes,
    formatDuration,
    validateDuration,
    // schedule
    scheduleForDate,
    checkDailyLimit,
    freeTimeByWeekday,
    occupiedMinutesForDate,
    freeMinutesForDate,
    occupancyPercent,
    validateWeekdays,
    // completion
    entriesForDate,
    isMarked,
    dayCompletion,
    semaforoColor,
    last7DaysPercents,
    // periods
    weekRange,
    monthRange,
    partialPeriodPercent,
    // streaks
    TOP_STREAKS,
    generalStreak,
    routineStreak,
    topStreaks,
    // goals
    MAX_ACTIVE_GOALS,
    applyRoutineToggle,
    applyManualAdjust,
    goalPercent,
    saturatedBarPercent,
    activeGoals,
    goalsForYear,
    // stats
    statsSummary,
    perRoutineStats,
    donutData,
    last7DaysLine,
    // validation
    validateGoal,
    validateManualDelta,
    validateCustomRange,
    validateRoutineName,
    validateGoalTitle,
    validateHexColor,
  };
})();
