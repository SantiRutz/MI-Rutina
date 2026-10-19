/**
 * MiRutina Vanilla — domain.js
 * Cálculos puros: fechas, duraciones, programación con límite de 24 h,
 * tiempos libres, cumplimiento, periodos, rachas (con escudos), objetivos,
 * tiempo invertido de por vida, modo foco, estadísticas y validaciones.
 * Todas las reglas de negocio viven aquí, con "hoy" siempre como parámetro.
 * Sin DOM ni localStorage. Los textos visibles se traducen con MiRutina.i18n.
 */
(function () {
  "use strict";

  window.MiRutina = window.MiRutina || {};

  const i18n = window.MiRutina.i18n;

  function t(key, params) {
    return i18n.t(key, params);
  }

  // ---- Fechas como cadenas `YYYY-MM-DD`; los cálculos usan UTC para
  // no verse afectados por husos horarios ni por el cambio de hora.
  // "Hoy" siempre llega como parámetro: aquí no se lee el reloj del sistema.

  const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

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

  /** Formatea minutos como `Xh Ym` (p. ej. `21h 30m`); igual en ambos idiomas. */
  function formatDuration(minutes) {
    return i18n.duration(minutes);
  }

  /** Duración > 0 y ≤ 24 h; horas 0–24 y minutos 0–59 (24 h solo con 00 m). */
  function validateDuration(hours, minutes) {
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
      return { ok: false, message: t("rt.form.error.durationIntegers") };
    }
    if (minutes < 0 || minutes > 59) {
      return { ok: false, message: t("rt.form.error.durationMinutes") };
    }
    if (hours < 0 || hours > 24) {
      return { ok: false, message: t("rt.form.error.durationHours") };
    }
    if (hours === 24 && minutes > 0) {
      return { ok: false, message: t("rt.form.error.durationMax") };
    }
    const total = toMinutes(hours, minutes);
    if (total <= 0) {
      return { ok: false, message: t("rt.form.error.durationZero") };
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
      return { ok: false, message: t("rt.form.error.weekdays") };
    }
    const allValid = weekdays.every(
      (day) => Number.isInteger(day) && day >= 1 && day <= 7
    );
    if (!allValid) {
      return { ok: false, message: t("rt.form.error.weekdayInvalid") };
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

  // ---- Comparativas periodo vs. periodo.
  // Se comparan periodos naturales equivalentes (semana con semana, mes con
  // mes) recortados al mismo avance: un mes en curso se mide contra el mismo
  // tramo del mes anterior ("día 18 con día 18"), no contra el mes entero.

  /** Días naturales entre dos fechas (b − a). */
  function daysBetween(a, b) {
    return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
  }

  /** Semana natural anterior a la de `hoy` (lunes a domingo). */
  function previousWeekRange(hoy) {
    const current = weekRange(hoy);
    return { start: addDays(current.start, -7), end: addDays(current.end, -7) };
  }

  /** Mes natural anterior al de `hoy` (años bisiestos incluidos). */
  function previousMonthRange(hoy) {
    const parsed = parseDate(hoy);
    const year = parsed.getUTCFullYear();
    const month = parsed.getUTCMonth();
    const start = formatDateString(new Date(Date.UTC(year, month - 1, 1)));
    const end = formatDateString(new Date(Date.UTC(year, month, 0)));
    return { start, end };
  }

  /** Días transcurridos de un periodo hasta hoy, contando hoy (0 si no ha empezado). */
  function elapsedDays(range, hoy) {
    const end = compareDates(range.end, hoy) > 0 ? hoy : range.end;
    if (compareDates(range.start, end) > 0) {
      return 0;
    }
    return daysBetween(range.start, end) + 1;
  }

  /**
   * Periodo anterior comparable: mismo avance que el actual sobre su periodo
   * natural ("el día 18 del mes anterior"). `null` si el actual no ha empezado.
   */
  function comparableRange(current, previous, hoy) {
    const elapsed = elapsedDays(current, hoy);
    if (elapsed === 0) {
      return null;
    }
    const end = addDays(previous.start, elapsed - 1);
    return {
      start: previous.start,
      end: compareDates(end, previous.end) > 0 ? previous.end : end,
    };
  }

  /**
   * Métricas clave de un periodo: cumplimiento %, rutinas cumplidas,
   * programadas, minutos cumplidos (día cumplido × duración) y días al
   * 100 %. `hasData` distingue "sin programación" de "0 cumplidas".
   */
  function periodMetrics(entries, routines, range, hoy) {
    const counts = periodCounts(entries, routines, range, hoy);
    let minutes = 0;
    let fullDays = 0;
    forEachPeriodDay(range, hoy, (date) => {
      const schedule = scheduleForDate(routines, date, hoy);
      if (schedule.length === 0) {
        return;
      }
      const dayEntries = entriesForDate(entries, date);
      const marked = schedule.filter((routine) => isMarked(dayEntries, routine.id));
      minutes += marked.reduce((total, routine) => total + routine.durationMinutes, 0);
      if (marked.length === schedule.length) {
        fullDays += 1;
      }
    });
    return {
      percent: counts.scheduled === 0 ? 0 : (counts.completed / counts.scheduled) * 100,
      completedCount: counts.completed,
      scheduledCount: counts.scheduled,
      minutes,
      fullDays,
      hasData: counts.scheduled > 0,
    };
  }

  /**
   * Delta entre dos valores: absoluto siempre y relativo solo con base > 0
   * (`null` evita ∞ cuando el periodo anterior no tiene nada con qué comparar).
   */
  function deltaOf(previousValue, currentValue) {
    const absolute = currentValue - previousValue;
    return {
      absolute,
      relative: previousValue > 0 ? (absolute / previousValue) * 100 : null,
    };
  }

  /** Comparativa completa de dos periodos equivalentes (actual y anterior). */
  function comparePeriods(entries, routines, currentRange, previousRange, hoy) {
    const current = periodMetrics(entries, routines, currentRange, hoy);
    const previous = periodMetrics(entries, routines, previousRange, hoy);
    return {
      current,
      previous,
      hasAnyData: current.hasData || previous.hasData,
      hasPreviousData: previous.hasData,
      deltas: {
        percent: deltaOf(previous.percent, current.percent),
        completedCount: deltaOf(previous.completedCount, current.completedCount),
        minutes: deltaOf(previous.minutes, current.minutes),
        fullDays: deltaOf(previous.fullDays, current.fullDays),
      },
    };
  }

  // ---- Rejilla de mes para el calendario retroactivo.

  /** Mes desplazado ±n desde `anchor`, siempre con el día 1 (evita meses cortos). */
  function addMonths(anchor, months) {
    const parsed = parseDate(anchor);
    return formatDateString(
      new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + months, 1))
    );
  }

  /**
   * Mes que contiene `anchor` como semanas de lunes a domingo; las celdas de
   * relleno de fuera del mes van como `null`.
   */
  function monthGrid(anchor) {
    const parsed = parseDate(anchor);
    const year = parsed.getUTCFullYear();
    const month = parsed.getUTCMonth();
    const first = formatDateString(new Date(Date.UTC(year, month, 1)));
    const last = formatDateString(new Date(Date.UTC(year, month + 1, 0)));
    const totalDays = Number(last.slice(8, 10));
    const cells = [];
    for (let pad = 0; pad < weekdayOf(first) - 1; pad += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= totalDays; day += 1) {
      cells.push(formatDateString(new Date(Date.UTC(year, month, day))));
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    const weeks = [];
    for (let index = 0; index < cells.length; index += 7) {
      weeks.push(cells.slice(index, index + 7));
    }
    return weeks;
  }

  // ---- Escudo de racha: hasta 2 "días libres" por año natural.
  // Un día con escudo sin cumplir es neutro: no suma ni rompe la racha.
  // Un día cumplido suma siempre, lleve escudo o no: aplicar un escudo a un
  // día ya cumplido nunca resta racha.

  const MAX_SHIELDS_PER_YEAR = 2;

  /** Año natural de una fecha `YYYY-MM-DD`. */
  function yearOf(date) {
    return Number(date.slice(0, 4));
  }

  /** ¿El día lleva escudo? */
  function hasShield(shields, date) {
    return shields.some((shield) => shield.date === date);
  }

  /** Escudos aplicados en un año natural. */
  function shieldsForYear(shields, year) {
    return shields.filter((shield) => yearOf(shield.date) === year);
  }

  /** Escudos que quedan por usar en un año natural. */
  function shieldsRemaining(shields, year) {
    return Math.max(0, MAX_SHIELDS_PER_YEAR - shieldsForYear(shields, year).length);
  }

  /** Aplicar escudo: solo al presente o pasado, sin duplicados y con cupo del año. */
  function canAddShield(shields, date, hoy) {
    if (isFuture(date, hoy)) {
      return { ok: false, message: t("toast.shield.future") };
    }
    if (hasShield(shields, date)) {
      return { ok: false, message: t("shield.exists") };
    }
    const year = yearOf(date);
    if (shieldsRemaining(shields, year) === 0) {
      return { ok: false, message: t("shield.noRoom", { year: year }) };
    }
    return { ok: true, value: date };
  }

  /** Nueva colección de escudos con el día añadido. */
  function addShield(shields, date, hoy) {
    const check = canAddShield(shields, date, hoy);
    if (!check.ok) {
      return check;
    }
    return { ok: true, value: shields.concat([{ date }]) };
  }

  /** Nueva colección de escudos sin el día indicado. */
  function removeShield(shields, date) {
    if (!hasShield(shields, date)) {
      return { ok: false, message: t("shield.missing") };
    }
    return {
      ok: true,
      value: shields.filter((shield) => shield.date !== date),
    };
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
   *   era 0 (no existía ninguna rutina creada).
   * - Un día incompleto con escudo es neutro: ni suma ni rompe.
   */
  function generalStreak(entries, routines, hoy, shields) {
    if (routines.length === 0) {
      return 0;
    }
    const shieldList = shields || [];
    const oldestCreation = earliestCreationDate(routines) ?? hoy;
    let streak = 0;
    let date = hoy;
    while (compareDates(date, oldestCreation) >= 0) {
      const schedule = scheduleForDate(routines, date, hoy);
      const dayEntries = entriesForDate(entries, date);
      // `every` sobre programación vacía = día cumplido.
      const fulfilled = schedule.every((routine) => isMarked(dayEntries, routine.id));
      if (!fulfilled && !hasShield(shieldList, date)) {
        break;
      }
      if (fulfilled) {
        streak += 1;
      }
      date = addDays(date, -1);
    }
    return streak;
  }

  /**
   * Racha de una rutina: días consecutivos en los que tocaba
   * y fue cumplida. Los días en los que no toca se saltan sin romper; hoy sin
   * marcar (habiendo tocado) deja la racha en 0. Siendo inactiva, solo
   * cuenta en fechas pasadas y en hoy no. Un día con escudo sin marcar es
   * neutro: ni suma ni rompe.
   */
  function routineStreak(entries, routine, hoy, shields) {
    const shieldList = shields || [];
    const oldestCreation = creationDate(routine) ?? hoy;
    let streak = 0;
    let date = hoy;
    while (compareDates(date, oldestCreation) >= 0) {
      if (isDue(routine, date, hoy)) {
        if (isMarked(entriesForDate(entries, date), routine.id)) {
          streak += 1;
        } else if (!hasShield(shieldList, date)) {
          break;
        }
      }
      date = addDays(date, -1);
    }
    return streak;
  }

  /**
   * rachas por rutina más largas (hasta 4), de mayor a menor; los
   * empates se resuelven por nombre alfabético.
   */
  function topStreaks(entries, routines, hoy, shields) {
    return routines
      .map((routine) => ({ routine, streak: routineStreak(entries, routine, hoy, shields) }))
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

  // ---- Tiempo invertido de por vida: días cumplidos × duración de la rutina.
  // No hay tracking real: los minutos salen del historial de marcas.

  /** Minutos acumulados de una rutina a lo largo de todo el historial. */
  function routineLifetimeMinutes(entries, routine) {
    const completedDays = entries.filter(
      (entry) => entry.routineId === routine.id && entry.completed
    ).length;
    return completedDays * routine.durationMinutes;
  }

  /** Minutos acumulados de todas las rutinas juntas (total histórico). */
  function totalLifetimeMinutes(entries, routines) {
    return routines.reduce(
      (total, routine) => total + routineLifetimeMinutes(entries, routine),
      0
    );
  }

  /** Duración legible larga por idioma: "42 h 30 min" (es) / "42h 30m" (en). */
  function formatLifetimeDuration(minutes) {
    return i18n.lifetimeDuration(minutes);
  }

  // ---- Modo foco: hasta 3 prioridades por día, guardadas por fecha.
  // El foco vive fuera del historial: cambiar de día lo devuelve al estado normal.

  const MAX_FOCUS_PRIORITIES = 3;

  /** ¿El modo foco está activo para esa fecha? */
  function focusOn(focus, date) {
    return !!focus && focus.date === date;
  }

  /** Ids priorizados de esa fecha (vacío si el foco es de otro día o no existe). */
  function focusIds(focus, date) {
    return focusOn(focus, date) ? focus.routineIds : [];
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
      return { ok: false, message: t("goals.form.error.target") };
    }
    if (!Number.isInteger(input.progress) || input.progress < 0) {
      return { ok: false, message: t("goals.form.error.progress") };
    }
    return { ok: true, value: input };
  }

  /** Campo de valor libre con signo del ajuste manual (entero distinto de 0). */
  function validateManualDelta(delta) {
    if (!Number.isInteger(delta) || delta === 0) {
      return { ok: false, message: t("goals.form.error.manualDelta") };
    }
    return { ok: true, value: delta };
  }

  /**
   * Rango personalizado de estadísticas: inicio ≤ fin y fin ≤
   * "hoy"; el error se muestra junto al campo.
   */
  function validateCustomRange(inicio, fin, hoy) {
    if (compareDates(inicio, fin) > 0) {
      return { ok: false, message: t("stats.custom.errorOrder") };
    }
    if (compareDates(fin, hoy) > 0) {
      return { ok: false, message: t("stats.custom.errorFuture") };
    }
    return { ok: true, value: { start: inicio, end: fin } };
  }

  /** Nombre de rutina obligatorio. */
  function validateRoutineName(name) {
    if (typeof name !== "string" || name.trim() === "") {
      return { ok: false, message: t("rt.form.error.name") };
    }
    return { ok: true, value: name };
  }

  /** Título de objetivo obligatorio. */
  function validateGoalTitle(title) {
    if (typeof title !== "string" || title.trim() === "") {
      return { ok: false, message: t("goals.form.error.title") };
    }
    return { ok: true, value: title };
  }

  /** Color en formato `#RRGGBB` (selector + entrada manual). */
  function validateHexColor(color) {
    if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return { ok: false, message: t("goals.form.error.colorInvalid") };
    }
    return { ok: true, value: color };
  }

  window.MiRutina.domain = {
    // date
    WEEKDAYS,
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
    daysBetween,
    previousWeekRange,
    previousMonthRange,
    elapsedDays,
    comparableRange,
    // comparativas
    periodMetrics,
    deltaOf,
    comparePeriods,
    // calendario
    addMonths,
    monthGrid,
    // shields
    MAX_SHIELDS_PER_YEAR,
    yearOf,
    hasShield,
    shieldsForYear,
    shieldsRemaining,
    canAddShield,
    addShield,
    removeShield,
    // lifetime
    routineLifetimeMinutes,
    totalLifetimeMinutes,
    formatLifetimeDuration,
    // focus
    MAX_FOCUS_PRIORITIES,
    focusOn,
    focusIds,
    // streaks
    TOP_STREAKS,
    generalStreak,
    routineStreak,
    topStreaks,
    earliestCreationDate,
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
