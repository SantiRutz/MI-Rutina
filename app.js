window.MiRutina = window.MiRutina || {};

(function (MiRutina) {
  "use strict";

  var domain = MiRutina.domain;
  var storage = MiRutina.storage;
  var ui = MiRutina.ui;
  var charts = MiRutina.charts;

  //Estado en memoria único
  function emptyState() {
    return {
      status: "ok",
      schemaVersion: storage.SCHEMA_VERSION,
      routines: [],
      entries: [],
      goals: [],
      theme: "dark",
      corrupted: [],
    };
  }

  var state = emptyState();

  //Fecha local del último render; base del chequeo de medianoche.
  var renderedOn = null;

  //Registro de pantallas

  var DEFAULT_ROUTE = "#/";

  var SCREENS = {
    "#/": {
      sectionId: "screen-inicio",
      title: "Inicio",
      render: renderDashboard,
    },
    "#/registro": {
      sectionId: "screen-registro",
      title: "Registro",
      render: renderRegistro,
    },
    "#/rutinas": {
      sectionId: "screen-rutinas",
      title: "Rutinas",
      render: renderRutinas,
    },
    "#/historial": {
      sectionId: "screen-historial",
      title: "Historial",
      render: renderHistorial,
    },
    "#/estadisticas": {
      sectionId: "screen-estadisticas",
      title: "Estadísticas",
      render: renderEstadisticas,
    },
    "#/objetivos": {
      sectionId: "screen-objetivos",
      title: "Objetivos",
      render: renderObjetivos,
    },
  };

  var ALL_ROUTES = Object.keys(SCREENS);

  //Utilidades de fecha 

  //"Hoy" con la zona local del dispositivo.
  function today() {
    return domain.toDateString(new Date());
  }

  function greeting() {
    var hour = new Date().getHours();
    if (hour < 6) return "Buenas noches";
    if (hour < 12) return "Buenos días";
    if (hour < 20) return "Buenas tardes";
    return "Buenas noches";
  }

  function formatLongDate(dateString) {
    var parts = dateString.split("-").map(Number);
    var parsed = new Date(parts[0], parts[1] - 1, parts[2]);
    return parsed.toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  var idSeq = 0;

  /**
   * Id único: crypto.randomUUID con fallback propio sin uplicados dentro de la sesión.
   * @returns {string}
   */
  function newId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    idSeq += 1;
    return (
      "id-" +
      Date.now().toString(36) +
      "-" +
      idSeq.toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  //Estado y persistencia

  //Recarga el estado completo desde storage (arranque y refresco de cortesía).
  function reloadState() {
    var loaded = storage.loadState();
    state = {
      status: loaded.status,
      schemaVersion: loaded.schemaVersion,
      routines: loaded.routines,
      // La capa de storage llama "completions" a la colección; el dominio
      // la nombra "entries".
      entries: loaded.completions,
      goals: loaded.goals,
      theme: loaded.theme,
      corrupted: loaded.corrupted || [],
    };
    return state;
  }

  //Aviso de una escritura fallida.
  function notifyWriteError(result) {
    ui.toast({
      message: "No se pudo guardar: " + (result.error ? result.error.message : "error desconocido"),
      variant: "error",
    });
  }

  //Avisos del arranque: localStorage no disponible y colecciones dañadas.
  function notifyStartupIssues() {
    if (state.status === "unavailable") {
      //aviso persistente (banner, no un toast auto-retirable) mientras dure el problema; la app queda en modo solo lectura.
      renderStorageBanner();
    }
    state.corrupted.forEach(function (name) {
      ui.toast({
        message:
          'La colección "' +
          name +
          '" contiene datos dañados (JSON corrupto); se inicia vacía. Las demás colecciones no se tocan.',
        variant: "error",
      });
    });
  }

  /**
   * banner persistente bajo la navbar mientras `localStorage` esté bloqueado al arrancar; solo se retira manualmente.
   */
  function renderStorageBanner() {
    var slot = document.getElementById("storage-banner-slot");
    if (!slot || document.getElementById("storage-banner")) return;
    var banner = ui.el(
      "div",
      { id: "storage-banner", class: "storage-banner", role: "alert" },
      [
        ui.icon("alert", { size: 20 }),
        ui.el("p", { class: "storage-banner-text" }, [
          ui.el("strong", { text: "No se pueden guardar datos en este navegador. " }),
          "localStorage no está disponible: los cambios se revertirán al instante y la app queda en modo solo lectura.",
        ]),
        ui.el("button", {
          type: "button",
          class: "btn btn-secondary btn-sm storage-banner-close",
          text: "Entendido",
          onclick: function () {
            banner.remove();
          },
        }),
      ]
    );
    slot.appendChild(banner);
  }

  //Tema 
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
  }

  /**
   * Alterna claro/oscuro: aplica al instante, persiste en 'mirutina.theme' y revierte con aviso si la escritura falla.
   * @returns {boolean} true si el cambio quedó persistido.
   */
  function toggleTheme() {
    var previous = state.theme;
    var next = previous === "dark" ? "light" : "dark";
    applyTheme(next);
    var saved = storage.saveTheme(next);
    if (!saved.ok) {
      applyTheme(previous);
      notifyWriteError(saved);
      return false;
    }
    state.theme = next;
    updateThemeButton();
    return true;
  }

  var themeButton = null;

  function updateThemeButton() {
    if (!themeButton) return;
    var isLight = state.theme === "light";
    ui.clear(themeButton);
    themeButton.appendChild(ui.icon(isLight ? "sun" : "moon", { size: 18 }));
    themeButton.setAttribute(
      "aria-label",
      isLight ? "Cambiar al tema oscuro" : "Cambiar al tema claro"
    );
    themeButton.title = isLight ? "Cambiar al tema oscuro" : "Cambiar al tema claro";
  }

  //Router por hash 

  //Ruta actual; vacío o desconocido → dashboard.
  function resolveRoute(hash) {
    return Object.prototype.hasOwnProperty.call(SCREENS, hash) ? hash : DEFAULT_ROUTE;
  }

  function currentRoute() {
    return resolveRoute(window.location.hash);
  }

  //Oculta todas las secciones de pantalla.
  function hideAllScreens() {
    ALL_ROUTES.forEach(function (route) {
      var section = document.getElementById(SCREENS[route].sectionId);
      if (section) section.hidden = true;
    });
  }

  /**
   * Renderiza la pantalla de la ruta actual en su `section.screen`:
   * normaliza el hash (sin añadir entrada al historial), marca la ruta
   * activa en la navbar, actualiza `document.title` y repinta solo el contenedor de la pantalla.
   */
  function render() {
    if (state.status === "locked") {
      renderLocked();
      return;
    }
    removeLockScreen();

    var route = currentRoute();
    if (window.location.hash !== route) {
      //Normaliza la ruta a "#/" sin crear un historial nuevo.
      window.history.replaceState(null, "", route);
    }
    var screen = SCREENS[route];

    hideAllScreens();
    var container = document.getElementById(screen.sectionId);
    container.hidden = false;
    ui.clear(container);

    ui.setActiveRoute(route);
    document.title = screen.title + " — MiRutina";
    renderedOn = today();

    screen.render(container);
    ui.reveal(container);
  }

  /**
   * Re-render de la misma pantalla conservando contexto: scroll,
   * foco y borradores capturados con `ui.captureContext` se restauran
   * tras repintar y, en el caso de las notas, se resincronizan con lo guardado (ver `resyncNoteEditors`).
   */
  function rerender() {
    var context = ui.captureContext();
    render();
    ui.restoreContext(context);
    resyncNoteEditors();
  }

  /**
   * Detección oportunista de medianoche. Compara la fecha actual
   * con la del último render; si cambió, re-renderiza con el día nuevo.
   * Sin temporizador: se llama en cada evento que llega a la app.
   * @returns {boolean} true si había cruzado medianoche.
   */
  function checkMidnight() {
    if (renderedOn !== null && renderedOn !== today()) {
      rerender();
      return true;
    }
    return false;
  }

  function onHashChange() {
    //El estado efímero de cada pantalla no sobrevive a navegar: al volver, Registro empieza en hoy y
    //el formulario de Rutinas queda cerrado.
    resetScreenState();
    render();
    //Navegación entre pantallas: arriba (los re-render de datos no llegan aquí).
    window.scrollTo(0, 0);
  }

  //Limpia el estado efímero de las pantallas al cambiar de ruta.
  function resetScreenState() {
    logDate = null;
    logDateError = null;
    openNotes = {};
    editing = null;
    formState = null;
    formRefs = null;
    removingId = null;
    historyAnchor = null;
    statsPeriod = "week";
    statsCustomRange = null;
    statsCustomDraft = null;
    goalsView = "list";
    goalEditing = null;
    goalFormState = null;
    goalFormRefs = null;
    goalRemovingId = null;
    goalsYear = null;
    manualValues = {};
    manualErrors = {};
  }

  function onVisibleOrFocus() {
    checkMidnight();
  }

  //Refresco de cortesía entre pestañas: solo claves `mirutina.
  function onStorageChange() {
    reloadState();
    applyTheme(state.theme);
    updateThemeButton();
    rerender();
  }

  //Modo bloqueo

  function removeLockScreen() {
    var lock = document.getElementById("screen-lock");
    if (lock) lock.remove();
  }

  /**
   * Pantalla única de aviso cuando `mirutina.schemaVersion` es futura o
   * desconocida: ni lectura interpretada ni escritura; los datos quedan
   * intactos. Las dos salidas (exportar JSON crudo / vaciar) viven en el panel Ajustes.
   */
  function renderLocked() {
    hideAllScreens();
    removeLockScreen();

    var main = document.getElementById("app");
    var lock = ui.el("section", {
      id: "screen-lock",
      class: "screen",
      "aria-label": "Datos incompatibles",
    });
    lock.appendChild(
      ui.emptyState({
        icon: "🔒",
        title: "Datos creados por una versión más nueva de la app",
        description:
          "Estos datos fueron creados por una versión más nueva de MiRutina y no se leerán ni se modificarán. " +
          "Puedes exportar el JSON crudo o vaciar los datos desde Ajustes para continuar.",
      })
    );
    main.appendChild(lock);

    document.title = "Datos incompatibles — MiRutina";
    renderedOn = today();
  }

  //Acciones reactivas

  /**
   * Marca/desmarca una rutina en una fecha (checklist del dashboard):
   * validar → mutar → persistir al instante → re-render; si la escritura
   * falla, revierte el estado en memoria (nunca queda aplicado sin persistir) y muestra el aviso.
   * @param {string} routineId
   * @param {string} [date] "Hoy" por defecto.
   * @returns {{ok:boolean, error?:Error}} resultado para la UI.
   */
  function toggleRoutine(routineId, date) {
    checkMidnight();
    date = date || today();

    var routine = state.routines.find(function (item) {
      return item.id === routineId;
    });
    if (!routine) {
      ui.toast({ message: "La rutina ya no existe.", variant: "error" });
      return { ok: false };
    }
    if (domain.isFuture(date, today())) {
      ui.toast({ message: "No se pueden registrar fechas futuras.", variant: "error" });
      return { ok: false };
    }

    var sameEntry = function (item) {
      return !(item.routineId === routineId && item.date === date);
    };
    var marked = domain.isMarked(domain.entriesForDate(state.entries, date), routineId);
    var nextEntries = state.entries.filter(sameEntry);
    if (!marked) {
      nextEntries = nextEntries.concat([
        {
          routineId: routineId,
          date: date,
          completed: true,
          updatedAt: new Date().toISOString(),
        },
      ]);
    }
    //Las objetivos vinculados a la rutina siguen el ±1 simétrico.
    var nextGoals = state.goals.map(function (goal) {
      return goal.linkedRoutineIds.indexOf(routineId) !== -1
        ? domain.applyRoutineToggle(goal, !marked)
        : goal;
    });

    var committed = commitEntriesAndGoals(nextEntries, nextGoals);
    if (!committed.ok) {
      //El checkbox ya se volteó en el DOM al pulsarlo; tras el revert hay que re-pintar para que la vista vuelva al estado real.
      rerender();
      return committed;
    }
    rerender();
    ui.toast({
      message: marked
        ? "«" + routine.name + "» desmarcada."
        : "«" + routine.name + "» marcada como cumplida.",
      variant: "success",
    });
    return { ok: true };
  }

  /**
   * Persiste juntas entradas y objetivos con el patrón: si la segunda
   * escritura falla, se revierte best-effort la primera para no dejar un
   * cambio a mitad persistido; el estado en memoria solo cambia con las dos
   * escrituras completas (nunca queda aplicado sin persistir).
   * @param {Array} nextEntries Nueva colección de entradas.
   * @param {Array} nextGoals Nueva colección de objetivos.
   * @returns {{ok:boolean, error?:Error}} resultado para la UI.
   */
  function commitEntriesAndGoals(nextEntries, nextGoals) {
    var savedEntries = storage.saveCollection("completions", nextEntries);
    if (!savedEntries.ok) {
      notifyWriteError(savedEntries);
      return { ok: false, error: savedEntries.error };
    }
    var savedGoals = storage.saveCollection("goals", nextGoals);
    if (!savedGoals.ok) {
      storage.saveCollection("completions", state.entries);
      notifyWriteError(savedGoals);
      return { ok: false, error: savedGoals.error };
    }
    state.entries = nextEntries;
    state.goals = nextGoals;
    return { ok: true };
  }

  /**
   * Marca/desmarca todas las rutinas programadas de una fecha:
   * objetivos ±1 una sola vez por objetivo
   * vinculado (mismo criterio) y persistencia con el mismo patrón `toggleRoutine`.
   * @param {string} date Fecha `YYYY-MM-DD` (≤ hoy).
   * @param {boolean} marked true para marcar, false para desmarcar.
   * @returns {{ok:boolean, error?:Error}} resultado para la UI.
   */
  function setAll(date, marked) {
    checkMidnight();
    if (domain.isFuture(date, today())) {
      ui.toast({ message: "No se pueden registrar fechas futuras.", variant: "error" });
      return { ok: false };
    }
    var dayEntries = domain.entriesForDate(state.entries, date);
    var targets = domain
      .scheduleForDate(state.routines, date, today())
      .filter(function (routine) {
        return domain.isMarked(dayEntries, routine.id) !== marked;
      });
    if (targets.length === 0) {
      ui.toast({
        message: marked
          ? "No queda ninguna rutina pendiente de marcar."
          : "No hay rutinas marcadas en este día.",
        variant: "info",
      });
      return { ok: true };
    }
    var targetIds = targets.map(function (routine) {
      return routine.id;
    });
    var isTarget = function (item) {
      return item.date === date && targetIds.indexOf(item.routineId) !== -1;
    };
    var now = new Date().toISOString();
    var nextEntries = marked
      ? state.entries
          .filter(function (item) {
            return !isTarget(item);
          })
          .concat(
            targets.map(function (routine) {
              return { routineId: routine.id, date: date, completed: true, updatedAt: now };
            })
          )
      : state.entries.filter(function (item) {
          return !isTarget(item);
        });
    var nextGoals = state.goals.map(function (goal) {
      var linked = goal.linkedRoutineIds.some(function (id) {
        return targetIds.indexOf(id) !== -1;
      });
      return linked ? domain.applyRoutineToggle(goal, marked) : goal;
    });

    var committed = commitEntriesAndGoals(nextEntries, nextGoals);
    if (!committed.ok) {
      //La vista afectada se re-pinta para reflejar el revert al instante.
      rerender();
      return committed;
    }
    rerender();
    //Concordancia de número: "1 rutina marcada." / "2 rutinas marcadas.".
    var suffix = targets.length === 1 ? "" : "s";
    ui.toast({
      message: targets.length + " rutina" + suffix + " " + (marked ? "marcada" : "desmarcada") + suffix + ".",
      variant: "success",
    });
    return { ok: true };
  }

  //Límite máximo de caracteres por nota.
  var NOTE_MAX_LENGTH = 500;

  /**
   * Guarda la nota de un registro del día: la nota vive en la
   * entrada, por lo que solo existe para rutinas marcadas. Se escribe al
   * instante; si la escritura falla, la entrada conserva su nota anterior.
   * @param {string} routineId
   * @param {string} date Fecha `YYYY-MM-DD`.
   * @param {string} note Texto de la nota.
   * @returns {{ok:boolean, message:string, error?:Error}} resultado para la UI.
   */
  function saveNote(routineId, date, note) {
    if (domain.isFuture(date, today())) {
      return { ok: false, message: "No se pueden registrar fechas futuras." };
    }
    if (note.length > NOTE_MAX_LENGTH) {
      return {
        ok: false,
        message: "La nota no puede superar los " + NOTE_MAX_LENGTH + " caracteres.",
      };
    }
    var entry = state.entries.find(function (item) {
      return item.routineId === routineId && item.date === date;
    });
    if (!entry) {
      return { ok: false, message: "Marca la rutina para poder añadirle una nota." };
    }
    var nextEntry = {
      routineId: entry.routineId,
      date: entry.date,
      completed: entry.completed,
      note: note,
      updatedAt: new Date().toISOString(),
    };
    var nextEntries = state.entries.map(function (item) {
      return item.routineId === routineId && item.date === date ? nextEntry : item;
    });
    var saved = storage.saveCollection("completions", nextEntries);
    if (!saved.ok) {
      notifyWriteError(saved);
      return {
        ok: false,
        message: "No se pudo guardar la nota: " + saved.error.message,
        error: saved.error,
      };
    }
    state.entries = nextEntries;
    return { ok: true, message: "Nota guardada." };
  }

  //Navbar: tema y Ajustes

  function bindNavbar() {
    themeButton = document.getElementById("nav-theme");
    if (themeButton) {
      themeButton.addEventListener("click", function () {
        toggleTheme();
      });
      updateThemeButton();
    }

    // Ajustes: panel sin ruta propia, no altera el hash.
    var settingsLink = document.getElementById("nav-settings");
    if (settingsLink) {
      settingsLink.addEventListener("click", function (event) {
        event.preventDefault();
        openSettings();
      });
    }
  }

  //Dashboard

  function revealWrap(node, delayMs) {
    var wrap = ui.el("div", { class: "reveal" }, [node]);
    ui.reveal(wrap, delayMs);
    return wrap;
  }

  /**
   * Tarjeta de métrica con subtítulo. `tone` colorea el número según
   * su semántica: "danger" | "accent" | "success" | blanco.
   */
  function summaryCard(label, value, hint, tone) {
    return ui.el("div", { class: "card summary-card" }, [
      ui.el("p", { class: "summary-label", text: label }),
      ui.el("p", {
        class: "summary-value" + (tone ? " summary-value-" + tone : ""),
        text: value,
      }),
      hint ? ui.el("p", { class: "summary-hint", text: hint }) : null,
    ]);
  }

  /**
   * Panel de aviso con enlace de acción: "No hay objetivos todavía. Creá el primero."
   * @param {string} text Frase del aviso.
   * @param {string} actionText Texto del enlace de acción.
   * @param {function:void} onAction
   */
  function emptyAlert(text, actionText, onAction) {
    return ui.el("div", { class: "empty-alert" }, [
      ui.icon("alert", { size: 18 }),
      ui.el("span", { text: text + " " }),
      ui.el("button", {
        type: "button",
        class: "btn btn-secondary btn-sm",
        text: actionText,
        onclick: onAction,
      }),
    ]);
  }

  //Cabecera de bloque con icono.
  function renderDashboard(container) {
    var page = ui.el("div", { class: "dash-page" });
    page.appendChild(renderDashHeader());
    page.appendChild(renderDashCards());
    // Columna principal (checklist) + columna lateral (gráfica y rachas).
    var main = ui.el("div", { class: "dash-column" }, [
      renderTodaySection(),
      renderGoalsSection(),
    ]);
    var side = ui.el("div", { class: "dash-column" }, [
      renderWeekSection(),
      renderStreaksSection(),
    ]);
    page.appendChild(ui.el("div", { class: "dash-columns" }, [main, side]));
    page.appendChild(renderQuickAccess());
    container.appendChild(page);
  }

  function renderDashHeader() {
    var streak = domain.generalStreak(state.entries, state.routines, today());
    return revealWrap(
      ui.el("header", { class: "dash-header" }, [
        ui.el("div", {}, [
          ui.el("h1", { class: "dash-greeting", text: greeting() + " 👋" }),
          ui.el("div", { class: "page-sub-row" }, [
            ui.el("p", { class: "dash-date", text: formatLongDate(today()) }),
            // pill de racha junto a la fecha.
            ui.el(
              "span",
              {
                class: "pill pill-streak",
                "aria-label": "Racha general: " + streak + " días",
              },
              [ui.icon("flame", { size: 13 }), streak + " " + (streak === 1 ? "día" : "días") + " de racha"]
            ),
          ]),
        ]),
        //Botón primario "Registrar hoy" → #/registro.
        ui.el(
          "button",
          {
            type: "button",
            class: "btn btn-primary",
            onclick: function () {
              window.location.hash = "#/registro";
            },
          },
          [ui.icon("check-circle", { size: 18 }), "Registrar hoy"]
        ),
      ]),
      0
    );
  }

  function renderDashCards() {
    var hoy = today();
    var todayCompletion = domain.dayCompletion(
      domain.entriesForDate(state.entries, hoy),
      domain.scheduleForDate(state.routines, hoy, hoy)
    );
    var weekRange = domain.weekRange(hoy);
    var monthRange = domain.monthRange(hoy);
    var weekPercent = domain.partialPeriodPercent(
      state.entries,
      state.routines,
      weekRange,
      hoy
    );
    var monthPercent = domain.partialPeriodPercent(
      state.entries,
      state.routines,
      monthRange,
      hoy
    );
    var weekCounts = periodCountsForRange(weekRange, hoy);
    var monthCounts = periodCountsForRange(monthRange, hoy);
    var todayPercent = todayCompletion.percent;
    //"Hoy" en rojo cuando va mal, verde al ir bien, blanco en medio.
    var todayTone =
      todayPercent < 40 ? "danger" : todayPercent >= 70 ? "success" : null;

    return revealWrap(
      ui.el("section", { class: "dash-cards", "aria-label": "Resumen" }, [
        summaryCard(
          "Hoy",
          Math.round(todayPercent) + "%",
          todayCompletion.completedCount + "/" + todayCompletion.scheduledCount + " rutinas",
          todayTone
        ),
        summaryCard(
          "Esta semana",
          Math.round(weekPercent) + "%",
          weekCounts.completed + "/" + weekCounts.scheduled,
          "accent"
        ),
        summaryCard(
          "Este mes",
          Math.round(monthPercent) + "%",
          monthCounts.completed + "/" + monthCounts.scheduled,
          "success"
        ),
        summaryCard(
          "Minutos hoy",
          String(todayCompletion.completedMinutes),
          "de " + todayCompletion.scheduledMinutes + " min"
        ),
      ]),
      60
    );
  }

  function renderTodaySection() {
    var hoy = today();
    var schedule = domain.scheduleForDate(state.routines, hoy, hoy);
    var body;

    if (schedule.length === 0) {
      body = emptyAlert(
        "No hay rutinas programadas para hoy.",
        "Creá la primera rutina",
        function () {
          window.location.hash = "#/rutinas";
        }
      );
    } else {
      var dayEntries = domain.entriesForDate(state.entries, hoy);
      var list = ui.el("ul", { class: "check-list" });
      schedule.forEach(function (routine) {
        list.appendChild(checklistItem(routine, dayEntries));
      });
      body = list;
    }

    //Cabecera con icono + "Ir a registrar".
    var card = ui.el("div", { class: "card" }, [
      ui.el("div", { class: "card-head" }, [
        ui.icon("check-circle", { size: 20, className: "card-icon" }),
        ui.el("h2", { id: "today-title", class: "card-title", text: "Rutinas de hoy" }),
        ui.el("a", {
          class: "btn btn-secondary btn-sm card-action",
          href: "#/registro",
          text: "Ir a registrar",
        }),
      ]),
      body,
    ]);

    return revealWrap(
      ui.el("section", { class: "dash-section", "aria-labelledby": "today-title" }, [card]),
      120
    );
  }

  /**
   * Fila del checklist del dashboard: checkbox con tachado + ✓ + punto de
   * color, nombre en negrita (con emoji), descripción y duración.
   * La variante del Registro vive en `logRoutineCard`.
   * @param {Object} routine Rutina programada.
   * @param {Array} dayEntries Entradas del día.
   * @returns {HTMLElement} `li` de la lista.
   */
  function checklistItem(routine, dayEntries) {
    var marked = domain.isMarked(dayEntries, routine.id);
    var row = ui.el("div", { class: "check-row" }, [
      ui.checkbox({
        id: "check-" + routine.id,
        checked: marked,
        checkedColor: "var(--color-success)",
        ariaLabel: (marked ? "Desmarcar " : "Marcar ") + routine.name,
        onChange: function () {
          toggleRoutine(routine.id);
        },
      }),
      ui.el("span", {
        class: "check-dot",
        style: { background: routine.color },
        "aria-hidden": "true",
      }),
      ui.el("div", { class: "check-row-main" }, [
        ui.el("span", {
          class: marked ? "check-name check-name-done" : "check-name",
          text: routine.name,
        }),
        routine.description
          ? ui.el("span", { class: "check-description", text: routine.description })
          : null,
      ]),
      marked
        ? ui.el("span", { class: "check-mark", "aria-hidden": "true", text: "✓" })
        : null,
      ui.el("span", {
        class: "check-duration",
        text: domain.formatDuration(routine.durationMinutes),
      }),
    ]);
    return ui.el("li", {
      class: marked ? "check-item check-item-marked" : "check-item",
    }, [row]);
  }

  function renderWeekSection() {
    var card = ui.el("div", { class: "card" }, [
      ui.el("div", { class: "card-head" }, [
        ui.icon("chart", { size: 20, className: "card-icon" }),
        ui.el("h2", { id: "week-title", class: "card-title", text: "Últimos 7 días" }),
      ]),
      ui.el("div", { class: "card-body" }, [
        charts.miniBarChart(domain.last7DaysPercents(state.entries, state.routines, today())),
        ui.el("p", {
          class: "dash-legend",
          text: "Verde ≥ 70 % · Amarillo 40–69 % · Rojo < 40 %",
        }),
      ]),
    ]);
    return revealWrap(
      ui.el("section", { class: "dash-section", "aria-labelledby": "week-title" }, [card]),
      180
    );
  }

  function renderStreaksSection() {
    var body;
    if (state.routines.length === 0) {
      body = ui.el("p", {
        class: "dash-muted",
        text: "Aún no hay rutinas con racha que mostrar.",
      });
    } else {
      var list = ui.el("ul", { class: "streak-list" });
      var top = domain.topStreaks(state.entries, state.routines, today());
      top.forEach(function (item) {
        list.appendChild(
          ui.el("li", { class: "streak-item" }, [
            ui.el("span", {
              class: "streak-dot",
              style: { background: item.routine.color },
              "aria-hidden": "true",
            }),
            ui.el("span", { class: "streak-name", text: item.routine.name }),
            ui.el("span", {
              class: "streak-count",
              text: item.streak + " 🔥",
            }),
          ])
        );
      });
      body =
        top.length > 0
          ? list
          : ui.el("p", {
              class: "dash-muted",
              text: "Aún no hay rutinas con racha que mostrar.",
            });
    }
    var card = ui.el("div", { class: "card" }, [
      ui.el("div", { class: "card-head" }, [
        ui.icon("flame", { size: 20, className: "card-icon" }),
        ui.el("h2", { id: "streaks-title", class: "card-title", text: "Rachas top" }),
      ]),
      body,
    ]);
    return revealWrap(
      ui.el("section", { class: "dash-section", "aria-labelledby": "streaks-title" }, [card]),
      240
    );
  }

  function renderGoalsSection() {
    var active = domain.activeGoals(state.goals, today());
    var body;
    if (active.length === 0) {
      // estado vacío con enlace de acción "Creá el primero".
      body = emptyAlert("No hay objetivos todavía.", "Creá el primero", function () {
        if (currentRoute() === "#/objetivos") {
          openCreateGoalForm();
        } else {
          pendingGoalCreate = true;
          window.location.hash = "#/objetivos";
        }
      });
    } else {
      var list = ui.el("ul", { class: "goal-list" });
      active.forEach(function (goal) {
        var percent = Math.round(domain.goalPercent(goal));
        list.appendChild(
          ui.el("li", { class: "goal-item" }, [
            ui.el("div", { class: "goal-head" }, [
              ui.el("span", {
                class: "goal-dot",
                style: { background: goal.color },
                "aria-hidden": "true",
              }),
              ui.el("span", { class: "goal-title", text: goal.title }),
              ui.el("span", { class: "goal-year", text: String(goal.year) }),
              ui.el("span", {
                class: "goal-percent",
                text: percent + "%",
              }),
            ]),
            ui.progressBar({
              value: domain.saturatedBarPercent(goal),
              label: "Progreso de " + goal.title,
              color: goal.color,
            }),
            ui.el("p", {
              class: "goal-numbers",
              text: goal.progress + " / " + goal.target + " · % real " + percent + "%",
            }),
          ])
        );
      });
      body = list;
    }
    var card = ui.el("div", { class: "card" }, [
      ui.el("div", { class: "card-head" }, [
        ui.icon("target", { size: 20, className: "card-icon" }),
        ui.el("h2", { id: "goals-title", class: "card-title", text: "Objetivos activos" }),
      ]),
      body,
    ]);
    return revealWrap(
      ui.el("section", { class: "dash-section", "aria-labelledby": "goals-title" }, [card]),
      300
    );
  }

  function renderQuickAccess() {
    var links = [
      { href: "#/rutinas", label: "Rutinas", icon: "list" },
      { href: "#/historial", label: "Historial", icon: "calendar" },
      { href: "#/estadisticas", label: "Estadísticas", icon: "chart" },
      { href: "#/objetivos", label: "Objetivos", icon: "trophy" },
    ];
    var nav = ui.el("nav", { class: "quick-grid", "aria-label": "Accesos rápidos" });
    links.forEach(function (link) {
      nav.appendChild(
        ui.el("a", { class: "quick-link", href: link.href }, [
          ui.el("span", { class: "quick-icon" }, [ui.icon(link.icon, { size: 20 })]),
          ui.el("span", { class: "quick-label", text: link.label }),
        ])
      );
    });
    return revealWrap(nav, 360);
  }

  //Objetivos
  //Listado con filtro por año, crear/editar con validación junto al
  //campo, eliminar con diálogo propio + desvanecimiento,
  //pestaña de ajuste manual con ±1/±5/±10/±25/±50, negativos y valor libre
  //(Suelo 0 y sin tope) y % real > 100 % con barra saturada
  //El ±1/−1 automático por marca vive en `toggleRoutine` y
  //`setAll` y se refleja aquí en cada re-render.

  var GOAL_VIEW_TABS = [
    { id: "list", label: "Listado" },
    { id: "manual", label: "Ajuste manual" },
  ];
  /** Botones rápidos: positivos y sus equivalentes negativos. */
  var GOAL_QUICK_DELTAS = [1, 5, 10, 25, 50, -1, -5, -10, -25, -50];
  var DEFAULT_GOAL_COLOR = "#6366f1";

  /** Pestaña activa de Objetivos; se limpia al cambiar de ruta. */
  var goalsView = "list";
  /** Formulario de objetivo: null | {mode:"create"} | {mode:"edit", goalId}. */
  var goalEditing = null;
  /** Datos vivos del formulario (sobreviven a re-renderes externos). */
  var goalFormState = null;
  /** Nodos del formulario para pintar/limpiar errores en vivo. */
  var goalFormRefs = null;
  /** Objetivo en desvanecimiento tras confirmar su borrado. */
  var goalRemovingId = null;
  /** Filtro de año: null = "Todos"; número = año seleccionado. */
  var goalsYear = null;
  /** Abrir el formulario al aterrizar en Objetivos desde el dashboard. */
  var pendingGoalCreate = false;
  /** Borrador y error del valor libre del ajuste manual, por objetivo. */
  var manualValues = {};
  var manualErrors = {};

  function goalById(id) {
    return state.goals.find(function (goal) {
      return goal.id === id;
    });
  }

  /** Años del filtro: los de los objetivos + el actual, sin duplicar. */
  function goalYears() {
    var current = Number(today().slice(0, 4));
    var years = [];
    state.goals.forEach(function (goal) {
      if (years.indexOf(goal.year) === -1) years.push(goal.year);
    });
    if (years.indexOf(current) === -1) {
      years.push(current);
    }
    return years.sort(function (a, b) {
      return b - a;
    });
  }

  /** Año preferido: el actual si tiene objetivos; si no, el más reciente. */
  function preferredGoalYear() {
    var current = Number(today().slice(0, 4));
    if (state.goals.length > 0 && domain.goalsForYear(state.goals, current).length === 0) {
      return Math.max.apply(
        null,
        state.goals.map(function (goal) {
          return goal.year;
        })
      );
    }
    return current;
  }

  function selectedGoalYear() {
    return goalsYear;
  }

  function renderObjetivos(container) {
    // llega la petición de crear desde el dashboard.
    if (pendingGoalCreate) {
      pendingGoalCreate = false;
      openCreateGoalForm();
      return;
    }
    var page = ui.el("div", { class: "goals-page" });
    page.appendChild(renderGoalsHeader());
    page.appendChild(
      goalsView === "list" ? renderGoalsListPanel() : renderGoalsManualPanel()
    );
    container.appendChild(page);
  }

  function renderGoalsHeader() {
    return revealWrap(
      ui.el("header", { class: "goals-head" }, [
        ui.el("div", { class: "goals-head-row" }, [
          ui.el("h1", { class: "goals-title" }, [
            ui.icon("trophy", { size: 28 }),
            "Objetivos",
          ]),
          goalsView === "list" && goalEditing === null
            ? ui.el(
                "button",
                {
                  type: "button",
                  class: "btn btn-primary",
                  onclick: openCreateGoalForm,
                },
                [ui.icon("plus", { size: 18 }), "Nuevo objetivo"]
              )
            : null,
        ]),
        ui.tabs({
          items: GOAL_VIEW_TABS,
          value: goalsView,
          ariaLabel: "Vista de objetivos",
          onChange: function (id) {
            checkMidnight();
            goalsView = id;
            rerender();
          },
        }),
      ]),
      0
    );
  }

  /** Panel de listado con formulario opcional, filtro y lista. */
  function renderGoalsListPanel() {
    var panel = ui.el("div", {
      class: "goals-panel",
      role: "tabpanel",
      id: "tabpanel-list",
      "aria-labelledby": "tab-list",
    });
    if (goalEditing !== null) {
      panel.appendChild(
        revealWrap(
          ui.el("section", {
            "aria-label": goalEditing.mode === "create" ? "Crear objetivo" : "Editar objetivo",
          }, [ui.el("div", { class: "card card-body" }, [buildGoalForm()])]),
          0
        )
      );
    }
    panel.appendChild(renderGoalsFilter());
    panel.appendChild(renderGoalsList());
    return panel;
  }

  /** Filtro como pills segmentadas ("Todos" + cada año). */
  function renderGoalsFilter() {
    var year = selectedGoalYear();
    var items = [{ id: "all", label: "Todos" }].concat(
      goalYears().map(function (optionYear) {
        return { id: String(optionYear), label: String(optionYear) };
      })
    );
    return revealWrap(
      ui.el("section", { class: "goals-section", "aria-label": "Filtro por año" }, [
        ui.tabs({
          items: items,
          value: year === null ? "all" : String(year),
          ariaLabel: "Filtro de objetivos por año",
          onChange: function (id) {
            checkMidnight();
            goalsYear = id === "all" ? null : Number(id);
            rerender();
          },
        }),
      ]),
      60
    );
  }

  function renderGoalsList() {
    var year = selectedGoalYear();
    var visible = year === null ? state.goals : domain.goalsForYear(state.goals, year);
    var body;
    if (state.goals.length === 0) {
      // aviso con enlace de acción "Creá el primero".
      body = emptyAlert("No hay objetivos todavía.", "Creá el primero", openCreateGoalForm);
    } else if (visible.length === 0) {
      body = emptyAlert(
        "No hay objetivos en " + year + ".",
        "Creá el primero",
        openCreateGoalForm
      );
    } else {
      var list = ui.el("ul", { class: "goals-list" });
      visible.forEach(function (goal) {
        list.appendChild(goalItem(goal));
      });
      body = list;
    }
    return revealWrap(
      ui.el("section", { class: "goals-section", "aria-label": "Listado de objetivos" }, [body]),
      120
    );
  }

  /** % real (puede superar 100) y barra saturada en el color del objetivo. */
  function goalItem(goal) {
    var linkedNames = linkedRoutineNames(goal);
    var percent = Math.round(domain.goalPercent(goal));
    var card = ui.el(
      "div",
      { class: "card goals-card", style: { "border-left-color": goal.color } },
      [
        ui.el("div", { class: "goals-card-head" }, [
          ui.el("span", {
            class: "goals-dot",
            style: { background: goal.color },
            "aria-hidden": "true",
          }),
          ui.el("h2", { class: "goals-card-title", text: goal.title }),
          ui.el("span", { class: "goals-card-year", text: String(goal.year) }),
          ui.el("span", {
            class: "goals-card-percent",
            text: percent + "%",
          }),
        ]),
        goal.description
          ? ui.el("p", { class: "goals-card-description", text: goal.description })
          : null,
        ui.progressBar({
          value: domain.saturatedBarPercent(goal),
          label: "Progreso de " + goal.title,
          color: goal.color,
        }),
        ui.el("div", { class: "goal-stats" }, [
          goalStat("Progreso", String(goal.progress)),
          goalStat("Meta", String(goal.target)),
          goalStat("% real", percent + "%"),
        ]),
        ui.el("p", {
          class: "goals-card-links",
          text: linkedNames === "" ? "Sin rutinas vinculadas" : "Vinculadas: " + linkedNames,
        }),
        ui.el("div", { class: "goals-card-actions" }, [
          ui.el(
            "button",
            {
              type: "button",
              class: "btn btn-secondary btn-sm",
              onclick: function () {
                openEditGoalForm(goal);
              },
            },
            [ui.icon("edit", { size: 15 }), "Editar"]
          ),
          ui.el(
            "button",
            {
              type: "button",
              class: "btn btn-ghost btn-sm",
              onclick: function () {
                focusGoalAdjust(goal.id);
              },
            },
            [ui.icon("target", { size: 15 }), "Ajustar"]
          ),
          ui.el(
            "button",
            {
              type: "button",
              class: "btn btn-danger btn-sm",
              onclick: function () {
                askDeleteGoal(goal);
              },
            },
            [ui.icon("trash", { size: 15 }), "Eliminar"]
          ),
        ]),
      ]
    );
    return ui.el(
      "li",
      {
        class: goalRemovingId === goal.id ? "goals-item goals-item-removing" : "goals-item",
        "data-goal-id": goal.id,
      },
      [card]
    );
  }

  /** Métrica pequeña de la tira de stats de un objetivo. */
  function goalStat(label, value) {
    return ui.el("div", { class: "goal-stat" }, [
      ui.el("span", { class: "goal-stat-label", text: label }),
      ui.el("span", { class: "goal-stat-value", text: value }),
    ]);
  }

  /** Lleva a la pestaña de ajuste manual y resalta el objetivo pedido. */
  function focusGoalAdjust(goalId) {
    checkMidnight();
    goalsView = "manual";
    rerender();
    window.requestAnimationFrame(function () {
      var node = document.querySelector(
        '.goals-manual-item[data-goal-id="' + goalId + '"]'
      );
      if (!node) return;
      node.scrollIntoView({ block: "center", behavior: "smooth" });
      node.classList.add("goal-focus-flash");
    });
  }

  /** Nombres de las rutinas vinculadas que siguen existiendo (vínculos rotos, ignorados). */
  function linkedRoutineNames(goal) {
    return goal.linkedRoutineIds
      .map(function (id) {
        var routine = state.routines.find(function (item) {
          return item.id === id;
        });
        return routine ? routine.name : null;
      })
      .filter(function (name) {
        return name !== null;
      })
      .join(", ");
  }

  /** Lista de ajuste manual con botones rápidos y valor libre por objetivo. */
  function renderGoalsManualPanel() {
    var panel = ui.el("div", {
      class: "goals-panel",
      role: "tabpanel",
      id: "tabpanel-manual",
      "aria-labelledby": "tab-manual",
    });
    var body;
    if (state.goals.length === 0) {
      body = ui.emptyState({
        icon: "🎯",
        title: "Aún no hay objetivos",
        description: "Crea un objetivo para poder ajustar su progreso a mano.",
        actions: ui.el("button", {
          type: "button",
          class: "btn btn-primary",
          text: "Crear objetivo",
          onclick: function () {
            goalsView = "list";
            openCreateGoalForm();
          },
        }),
      });
    } else {
      var list = ui.el("ul", { class: "goals-manual-list" });
      state.goals
        .slice()
        .sort(function (a, b) {
          return b.createdAt.localeCompare(a.createdAt);
        })
        .forEach(function (goal) {
          list.appendChild(manualGoalItem(goal));
        });
      body = list;
    }
    panel.appendChild(
      revealWrap(
        ui.el("section", { "aria-label": "Ajuste manual del progreso" }, [body]),
        0
      )
    );
    return panel;
  }

  function manualGoalItem(goal) {
    var buttons = ui.el("div", {
      class: "goals-manual-buttons",
      role: "group",
      "aria-label": "Ajustes rápidos para " + goal.title,
    });
    GOAL_QUICK_DELTAS.forEach(function (delta) {
      buttons.appendChild(
        ui.el("button", {
          type: "button",
          class: "btn btn-secondary btn-sm",
          "data-goal-id": goal.id,
          "data-adjust": String(delta),
          "aria-label": (delta > 0 ? "Sumar " : "Restar ") + Math.abs(delta) + " en " + goal.title,
          text: delta > 0 ? "+" + delta : "−" + Math.abs(delta),
          onclick: function () {
            applyGoalAdjust(goal.id, delta);
          },
        })
      );
    });

    var value = manualValues[goal.id] || "";
    var freeInput = ui.el("input", {
      id: "manual-" + goal.id,
      name: "manual-" + goal.id,
      type: "number",
      step: 1,
      inputmode: "numeric",
      class: "goals-free-input",
      value: value,
      "data-draft": "manual-" + goal.id,
    });
    freeInput.addEventListener("input", function () {
      manualValues[goal.id] = freeInput.value;
    });
    var freeForm = ui.el(
      "form",
      {
        class: "goals-free-form",
        novalidate: "true",
        onsubmit: function (event) {
          event.preventDefault();
          submitManualFree(goal.id);
        },
      },
      [
        ui.el("div", { class: "goals-free-row" }, [
          ui.field({
            label: "Valor libre con signo",
            control: freeInput,
            error: manualErrors[goal.id] || null,
            hint: "Entero con signo, p. ej. −3 o 12 (suelo 0, sin tope).",
          }),
          ui.el("button", { type: "submit", class: "btn btn-primary", text: "Aplicar" }),
        ]),
      ]
    );

    return ui.el("li", { class: "goals-manual-item", "data-goal-id": goal.id }, [
      ui.el("div", { class: "goals-manual-head" }, [
        ui.el("span", {
          class: "goals-dot",
          style: { background: goal.color },
          "aria-hidden": "true",
        }),
        ui.el("span", { class: "goals-manual-title", text: goal.title }),
        ui.el("span", {
          class: "goals-manual-numbers",
          text:
            goal.progress +
            " / " +
            goal.target +
            " · " +
            Math.round(domain.goalPercent(goal)) +
            "%",
        }),
      ]),
      buttons,
      freeForm,
    ]);
  }

  /** Aplica un ajuste rápido; el resultado (suelo 0 incluido) se muestra en el toast. */
  function applyGoalAdjust(goalId, delta) {
    checkMidnight();
    var result = adjustGoal(goalId, delta);
    ui.toast({ message: result.message, variant: result.ok ? "success" : "error" });
    if (result.ok) {
      rerender();
    }
  }

  /** Valor libre con signo validado junto al campo (entero ≠ 0). */
  function submitManualFree(goalId) {
    var text = manualValues[goalId] || "";
    var delta = text.trim() === "" ? NaN : Number(text);
    var check = domain.validateManualDelta(delta);
    if (!check.ok) {
      manualErrors[goalId] = check.message;
      rerender();
      return;
    }
    delete manualErrors[goalId];
    manualValues[goalId] = "";
    applyGoalAdjust(goalId, check.value);
  }

  // ---- Formulario de objetivo ------------------------

  function openCreateGoalForm() {
    checkMidnight();
    goalEditing = { mode: "create" };
    goalFormState = {
      candidateId: newId(),
      title: "",
      description: "",
      year: String(preferredGoalYear()),
      target: "",
      progress: "0",
      color: DEFAULT_GOAL_COLOR,
      links: [],
      errors: {},
      showErrors: false,
      formError: null,
    };
    goalsView = "list";
    rerender();
  }

  function openEditGoalForm(goal) {
    checkMidnight();
    goalEditing = { mode: "edit", goalId: goal.id };
    goalFormState = {
      candidateId: goal.id,
      title: goal.title,
      description: goal.description,
      year: String(goal.year),
      target: String(goal.target),
      progress: String(goal.progress),
      color: goal.color,
      links: goal.linkedRoutineIds.slice(),
      errors: {},
      showErrors: false,
      formError: null,
    };
    goalsView = "list";
    rerender();
  }

  function closeGoalForm() {
    goalEditing = null;
    goalFormState = null;
    goalFormRefs = null;
  }

  /** Vacío → NaN para que el validador de dominio emita su mensaje. */
  function parseGoalInteger(text) {
    return String(text).trim() === "" ? NaN : Number(text);
  }

  function buildGoalForm() {
    var s = goalFormState;
    goalFormRefs = {};

    var titleInput = ui.el("input", {
      id: "goal-title",
      name: "goal-title",
      type: "text",
      class: "rf-input",
      value: s.title,
      placeholder: "Ej: Correr 500 km este año",
    });
    var descriptionInput = ui.el("input", {
      id: "goal-description",
      name: "goal-description",
      type: "text",
      class: "rf-input",
      value: s.description,
      placeholder: "Detalles, motivación, etc.",
    });
    var yearInput = ui.el("input", {
      id: "goal-year",
      name: "goal-year",
      type: "number",
      step: 1,
      inputmode: "numeric",
      class: "rf-input",
      value: s.year,
      "aria-label": "Año",
    });
    var targetInput = ui.el("input", {
      id: "goal-target",
      name: "goal-target",
      type: "number",
      min: 1,
      step: 1,
      inputmode: "numeric",
      class: "rf-input",
      value: s.target,
      "aria-label": "Meta",
    });
    var progressInput = ui.el("input", {
      id: "goal-progress",
      name: "goal-progress",
      type: "number",
      min: 0,
      step: 1,
      inputmode: "numeric",
      class: "rf-input",
      value: s.progress,
      "aria-label": "Progreso inicial",
    });
    var colorSwatch = ui.el("input", {
      type: "color",
      class: "color-swatch",
      value: HEX_COLOR_PATTERN.test(s.color) ? s.color.toLowerCase() : DEFAULT_GOAL_COLOR,
      "aria-label": "Selector de color",
      title: "Selector de color",
    });
    var colorText = ui.el("input", {
      id: "goal-color",
      name: "goal-color",
      type: "text",
      class: "color-text",
      value: s.color,
      spellcheck: false,
      placeholder: "#RRGGBB",
    });
    var colorRow = ui.el("div", { class: "color-row" }, [colorSwatch, colorText]);
    var formErrorNode = ui.el("p", {
      class: "rf-form-error",
      role: "alert",
      text: s.formError || "",
      hidden: s.formError ? false : true,
    });

    goalFormRefs.title = titleInput;
    goalFormRefs.description = descriptionInput;
    goalFormRefs.year = yearInput;
    goalFormRefs.target = targetInput;
    goalFormRefs.progress = progressInput;
    goalFormRefs.color = colorText;
    goalFormRefs.colorRow = colorRow;
    goalFormRefs.colorSwatch = colorSwatch;
    goalFormRefs.formError = formErrorNode;

    bindGoalFormInput(titleInput, "title");
    bindGoalFormInput(descriptionInput, "description");
    bindGoalFormInput(yearInput, "year");
    bindGoalFormInput(targetInput, "target");
    bindGoalFormInput(progressInput, "progress");
    bindGoalFormInput(colorText, "color");
    colorSwatch.addEventListener("change", function () {
      // El picker siempre emite un hex válido; se refleja en la entrada manual.
      goalFormState.color = colorSwatch.value.toUpperCase();
      colorText.value = goalFormState.color;
      refreshGoalFormErrors();
    });

    return ui.el(
      "form",
      {
        class: "rf-form",
        novalidate: "true",
        onsubmit: function (event) {
          event.preventDefault();
          submitGoalForm();
        },
      },
      [
        ui.el("div", { class: "rf-group" }, [
          ui.el("p", { class: "rf-group-title", text: "Identidad" }),
          ui.field({ label: "Título", control: titleInput, error: s.errors.title, required: true }),
          ui.field({ label: "Descripción (opcional)", control: descriptionInput }),
        ]),
        ui.el("div", { class: "rf-group" }, [
          ui.el("p", { class: "rf-group-title", text: "Meta y progreso" }),
          ui.el("div", { class: "goals-numbers" }, [
            ui.field({
              label: "Año",
              control: yearInput,
              error: s.errors.year,
              hint: "Año calendario del objetivo.",
              required: true,
            }),
            ui.field({
              label: "Meta",
              control: targetInput,
              error: s.errors.target,
              hint: "Valor objetivo (ej: 500 km, 12 libros…)",
              required: true,
            }),
            ui.field({
              label: "Progreso inicial",
              control: progressInput,
              error: s.errors.progress,
              hint: "Entero mayor o igual a 0.",
              required: true,
            }),
          ]),
        ]),
        ui.el("div", { class: "rf-group" }, [
          ui.el("p", { class: "rf-group-title", text: "Apariencia y vínculos" }),
          ui.field({ label: "Color", control: colorRow, error: s.errors.color, required: true }),
          buildGoalLinksPicker(),
        ]),
        formErrorNode,
        ui.el("div", { class: "rf-actions" }, [
          ui.el("button", { type: "submit", class: "btn btn-primary" }, [
            ui.icon("save", { size: 17 }),
            "Guardar",
          ]),
          ui.el("button", {
            type: "button",
            class: "btn btn-ghost",
            text: "Cancelar",
            onclick: function () {
              closeGoalForm();
              rerender();
            },
          }),
        ]),
      ]
    );
  }

  function bindGoalFormInput(control, key) {
    control.addEventListener("input", function () {
      goalFormState[key] = control.value;
      if (key === "color" && HEX_COLOR_PATTERN.test(control.value)) {
        // El texto válido se refleja en el selector (el picker ya es siempre válido).
        goalFormRefs.colorSwatch.value = control.value.toLowerCase();
      }
      refreshGoalFormErrors();
    });
  }

  /** Multiselección de rutinas vinculadas. */
  function buildGoalLinksPicker() {
    var grid = ui.el("div", { class: "goal-links-grid", role: "group", "aria-labelledby": "goal-links-legend" });
    if (state.routines.length === 0) {
      grid.appendChild(
        ui.el("p", {
          class: "goal-links-hint",
          text: "Aún no hay rutinas; podrás vincularlas más tarde desde la pantalla de rutinas.",
        })
      );
    } else {
      state.routines.forEach(function (routine) {
        var selected = goalFormState.links.indexOf(routine.id) !== -1;
        var chip = ui.el("span", {
          class: selected ? "goal-link goal-link-selected" : "goal-link",
        });
        chip.appendChild(
          ui.checkbox({
            id: "goal-link-" + routine.id,
            name: "goal-link-" + routine.id,
            label: routine.name,
            checked: selected,
            onChange: function (checked) {
              if (checked) {
                goalFormState.links = goalFormState.links.concat([routine.id]);
              } else {
                goalFormState.links = goalFormState.links.filter(function (id) {
                  return id !== routine.id;
                });
              }
              chip.classList.toggle("goal-link-selected", checked);
            },
          })
        );
        grid.appendChild(chip);
      });
    }
    return ui.el("fieldset", { class: "goal-links" }, [
      ui.el("legend", { class: "goal-links-legend", id: "goal-links-legend", text: "Rutinas vinculadas" }),
      grid,
      ui.el("p", {
        class: "goal-links-hint",
        text: "Elegí qué rutinas aportan a este objetivo. Marcar una rutina vinculada suma +1 y desmarcarla resta −1.",
      }),
    ]);
  }

  /** Revalida y repinta los campos tras el primer intento fallido (errores en vivo). */
  function refreshGoalFormErrors() {
    if (goalFormState === null || !goalFormState.showErrors) return;
    var errors = validateGoalForm();
    goalFormState.errors = errors;
    ui.setFieldError(goalFormRefs.title, errors.title || null);
    ui.setFieldError(goalFormRefs.year, errors.year || null);
    ui.setFieldError(goalFormRefs.target, errors.target || null);
    ui.setFieldError(goalFormRefs.progress, errors.progress || null);
    ui.setFieldError(goalFormRefs.colorRow, errors.color || null);
  }

  /** Validaciones por campo; cada fallo se muestra junto a su campo. */
  function validateGoalForm() {
    var s = goalFormState;
    var errors = {};
    var titleResult = domain.validateGoalTitle(s.title);
    if (!titleResult.ok) {
      errors.title = titleResult.message;
    }
    if (!Number.isInteger(parseGoalInteger(s.year))) {
      errors.year = "El año debe ser un número entero.";
    }
    if (!HEX_COLOR_PATTERN.test(s.color)) {
      errors.color = "Introduce un color en formato #RRGGBB.";
    }
    // Aísla cada campo: meta fija válida para probar solo el progreso y
    // progreso 0 (siempre válido) para probar solo la meta.
    var targetResult = domain.validateGoal({ target: parseGoalInteger(s.target), progress: 0 });
    if (!targetResult.ok) {
      errors.target = targetResult.message;
    } else {
      var progressResult = domain.validateGoal({ target: 1, progress: parseGoalInteger(s.progress) });
      if (!progressResult.ok) {
        errors.progress = progressResult.message;
      }
    }
    return errors;
  }

  /** Envía el formulario: valida junto al campo y persiste al instante. */
  function submitGoalForm() {
    var errors = validateGoalForm();
    goalFormState.errors = errors;
    goalFormState.showErrors = true;
    if (Object.keys(errors).length > 0) {
      refreshGoalFormErrors();
      return;
    }
    var s = goalFormState;
    var input = {
      title: s.title.trim(),
      description: s.description.trim(),
      year: parseGoalInteger(s.year),
      target: parseGoalInteger(s.target),
      progress: parseGoalInteger(s.progress),
      color: s.color.toUpperCase(),
      linkedRoutineIds: s.links.slice(),
    };
    var isEdit = goalEditing.mode === "edit";
    var result = isEdit ? updateGoal(goalEditing.goalId, input) : createGoal(input);
    if (result.ok) {
      ui.toast({ message: result.message, variant: "success" });
      // Al crear, muestra el año del objetivo recién creado en el filtro.
      if (!isEdit) {
        goalsYear = input.year;
      }
      closeGoalForm();
      rerender();
      return;
    }
    goalFormState.formError = result.message;
    goalFormRefs.formError.textContent = result.message;
    goalFormRefs.formError.hidden = false;
  }

  // ---- Casos de uso de objetivos -----------

  /** Validación en runtime antes de persistir. */
  function validateGoalAgainst(goal) {
    if (goal.title.trim() === "") {
      return { ok: false, message: "El título es obligatorio." };
    }
    if (!Number.isInteger(goal.year)) {
      return { ok: false, message: "El año debe ser un número entero." };
    }
    if (!HEX_COLOR_PATTERN.test(goal.color)) {
      return { ok: false, message: "Color inválido: usa el formato #RRGGBB." };
    }
    var numbers = domain.validateGoal({ target: goal.target, progress: goal.progress });
    if (!numbers.ok) {
      return { ok: false, message: numbers.message };
    }
    return { ok: true, message: "" };
  }

  /** Vínculos sin duplicados (una rutina vinculada suma +1 una sola vez). */
  function normalizeGoalLinks(ids) {
    return ids.filter(function (id, index) {
      return ids.indexOf(id) === index;
    });
  }

  /** Escribe la colección de objetivos al instante; el estado solo cambia si la escritura es correcta. */
  function persistGoals(nextGoals) {
    var saved = storage.saveCollection("goals", nextGoals);
    if (!saved.ok) {
      notifyWriteError(saved);
      return {
        ok: false,
        message: "No se pudo guardar: " + saved.error.message,
        error: saved.error,
      };
    }
    state.goals = nextGoals;
    return { ok: true, message: "" };
  }

  function createGoal(input) {
    var goal = {
      id: newId(),
      createdAt: new Date().toISOString(),
      title: input.title,
      description: input.description,
      year: input.year,
      target: input.target,
      progress: input.progress,
      color: input.color,
      linkedRoutineIds: normalizeGoalLinks(input.linkedRoutineIds),
    };
    var validation = validateGoalAgainst(goal);
    if (!validation.ok) {
      return validation;
    }
    var result = persistGoals(state.goals.concat([goal]));
    if (!result.ok) {
      return result;
    }
    return { ok: true, message: "Objetivo «" + goal.title + "» creado." };
  }

  function updateGoal(id, input) {
    var previous = goalById(id);
    if (!previous) {
      return { ok: false, message: "El objetivo ya no existe." };
    }
    var goal = Object.assign({}, previous, {
      title: input.title,
      description: input.description,
      year: input.year,
      target: input.target,
      progress: input.progress,
      color: input.color,
      linkedRoutineIds: normalizeGoalLinks(input.linkedRoutineIds),
    });
    var validation = validateGoalAgainst(goal);
    if (!validation.ok) {
      return validation;
    }
    var nextGoals = state.goals.map(function (item) {
      return item.id === id ? goal : item;
    });
    var result = persistGoals(nextGoals);
    if (!result.ok) {
      return result;
    }
    return { ok: true, message: "Objetivo «" + goal.title + "» actualizado." };
  }

  /** Elimina el objetivo; no toca el progreso de ningún otro. */
  function deleteGoal(id) {
    var goal = goalById(id);
    if (!goal) {
      return { ok: false, message: "El objetivo ya no existe." };
    }
    var nextGoals = state.goals.filter(function (item) {
      return item.id !== id;
    });
    var result = persistGoals(nextGoals);
    if (!result.ok) {
      return result;
    }
    return { ok: true, message: "Objetivo «" + goal.title + "» eliminado." };
  }

  /**
   * Ajuste manual (±1/±5/±10/±25/±50 o valor libre) con suelo 0
   * y sin tope superior; el delta llega validado por la UI.
   */
  function adjustGoal(id, delta) {
    var check = domain.validateManualDelta(delta);
    if (!check.ok) {
      return { ok: false, message: check.message };
    }
    var goal = goalById(id);
    if (!goal) {
      return { ok: false, message: "El objetivo ya no existe." };
    }
    var before = goal.progress;
    var updated = domain.applyManualAdjust(goal, check.value);
    var nextGoals = state.goals.map(function (item) {
      return item.id === id ? updated : item;
    });
    var result = persistGoals(nextGoals);
    if (!result.ok) {
      return result;
    }
    return { ok: true, message: describeGoalAdjust(goal.title, before, updated.progress, delta) };
  }

  /** Feedback del ajuste; sin cambio es porque ya estaba en el suelo 0. */
  function describeGoalAdjust(title, before, after, delta) {
    if (after === before) {
      return "El progreso de «" + title + "» ya está en 0 (suelo mínimo).";
    }
    return (
      "Progreso de «" + title + "»: " + after + " (" + (delta > 0 ? "+" : "") + delta + ")."
    );
  }

  /**
   * Diálogo de confirmación propio (nunca `alert`/`confirm`)
   * con el título del objetivo y sus consecuencias; cancelar no borra nada.
   */
  function askDeleteGoal(goal) {
    var body = ui.el("div", {}, [
      ui.el("p", {}, ["Vas a eliminar ", ui.el("strong", { text: goal.title }), "."]),
      ui.el("p", {
        text: "Se eliminará el objetivo con su progreso; las rutinas vinculadas no se modifican.",
      }),
    ]);
    ui.confirmDialog({
      title: "Eliminar objetivo",
      body: body,
      confirmLabel: "Eliminar",
      tone: "danger",
    }).then(function (confirmed) {
      if (!confirmed) return;
      fadeOutAndDeleteGoal(goal);
    });
  }

  /** La tarjeta existente se desvanece (220 ms) y solo entonces se borra. */
  function fadeOutAndDeleteGoal(goal) {
    goalRemovingId = goal.id;
    var escaped =
      typeof CSS !== "undefined" && CSS.escape ? CSS.escape(goal.id) : goal.id;
    var item = document.querySelector('[data-goal-id="' + escaped + '"]');
    if (item) {
      item.classList.add("goals-item-removing");
    }
    window.setTimeout(function () {
      goalRemovingId = null;
      if (goalEditing !== null && goalEditing.mode === "edit" && goalEditing.goalId === goal.id) {
        closeGoalForm();
      }
      var result = deleteGoal(goal.id);
      ui.toast({ message: result.message, variant: result.ok ? "success" : "error" });
      rerender();
    }, REMOVE_FADE_MS);
  }

  // ---- Ajustes (y salidas del modo bloqueo) -------------
  // Panel abierto desde el enlace de la navbar sin ruta propia:
  // tema, exportar backup `mirutina-backup-YYYY-MM-DD.json`, importar
  // con confirmación de sobrescritura total y
  // vaciar con doble confirmación. Con `schemaVersion` futura solo quedan las
  // dos salidas de: exportar el JSON crudo y vaciar los datos.

  /** Nombre propio del export crudo (no es un backup: no lleva schemaVersion). */
  var RAW_BACKUP_PREFIX = "mirutina-raw-";
  var settings = {
    overlay: null,
    panel: null,
    errorNode: null,
    previousFocus: null,
    // true mientras un diálogo de ui.js (importar/vaciar) está encima.
    suspended: false,
  };

  function openSettings() {
    if (settings.overlay) return;
    settings.previousFocus =
      document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
    settings.suspended = false;
    settings.errorNode = null;

    var locked = state.status === "locked";
    var body = ui.el("div", { class: "settings-body" });
    if (!locked) {
      body.appendChild(buildThemeRow());
    }
    body.appendChild(buildSettingsData(locked));

    var panel = ui.el(
      "div",
      {
        class: "dialog-panel settings-panel",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "settings-title",
        tabindex: "-1",
      },
      [
        ui.el("h2", { class: "dialog-title", id: "settings-title", text: "Ajustes" }),
        ui.el("div", { class: "dialog-body" }, [body]),
        ui.el("div", { class: "dialog-actions" }, [
          ui.el("button", {
            type: "button",
            class: "btn btn-secondary",
            text: "Cerrar",
            onclick: closeSettings,
          }),
        ]),
      ]
    );
    var overlay = ui.el("div", { class: "dialog-overlay" }, [panel]);
    // Solo el clic directo en el fondo cierra (no el arrastre de texto).
    overlay.addEventListener("mousedown", function (event) {
      if (event.target === overlay) closeSettings();
    });

    settings.overlay = overlay;
    settings.panel = panel;
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onSettingsKeydown, true);
    panel.focus();
  }

  function closeSettings() {
    if (!settings.overlay) return;
    var overlay = settings.overlay;
    settings.overlay = null;
    settings.panel = null;
    settings.errorNode = null;
    settings.suspended = false;
    document.removeEventListener("keydown", onSettingsKeydown, true);
    overlay.remove();
    if (settings.previousFocus && document.contains(settings.previousFocus)) {
      settings.previousFocus.focus();
    }
    settings.previousFocus = null;
  }

  /** Escape cierra y Tab queda atrapado dentro del panel (como ui.js). */
  function onSettingsKeydown(event) {
    if (!settings.overlay || settings.suspended) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      closeSettings();
      return;
    }
    if (event.key !== "Tab") return;
    var focusable = settings.panel.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) {
      event.preventDefault();
      settings.panel.focus();
      return;
    }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!settings.panel.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  function buildThemeRow() {
    var label = ui.el("span", { class: "settings-row-label" });
    function paint() {
      label.textContent = "Tema actual: " + (state.theme === "light" ? "claro" : "oscuro");
    }
    paint();
    return ui.el("div", { class: "settings-row" }, [
      label,
      ui.el("button", {
        type: "button",
        class: "btn btn-secondary btn-sm",
        text: "Cambiar tema",
        onclick: function () {
          toggleTheme();
          paint();
        },
      }),
    ]);
  }

  /** Secciones de datos: en modo bloqueo solo las dos salidas. */
  function buildSettingsData(locked) {
    var errorNode = ui.el("p", {
      id: "settings-error",
      class: "settings-error",
      role: "alert",
      hidden: true,
    });
    settings.errorNode = errorNode;

    var children = [];
    if (locked) {
      children.push(
        ui.el("p", {
          class: "settings-locked",
          text:
            "Estos datos fueron creados por una versión más nueva de la app: " +
            "no se leen ni se escriben. Elige una salida:",
        })
      );
      children.push(
        ui.el("div", { class: "settings-actions" }, [
          ui.el("button", {
            id: "settings-export-raw",
            type: "button",
            class: "btn btn-primary",
            text: "Exportar JSON crudo",
            onclick: function () {
              exportData(true);
            },
          }),
          ui.el("button", {
            id: "settings-clear",
            type: "button",
            class: "btn btn-danger",
            text: "Vaciar todos los datos",
            onclick: askClearAll,
          }),
        ])
      );
    } else {
      children.push(
        ui.el("p", {
          class: "settings-hint",
          text:
            "Los datos viven en este navegador: copiar la carpeta no los " +
            "transporta. Exporta un backup para moverlos a otro equipo.",
        })
      );
      children.push(ui.el("p", { class: "settings-section-title", text: "Copia de seguridad" }));
      children.push(
        ui.el("div", { class: "settings-actions" }, [
          ui.el("button", {
            id: "settings-export",
            type: "button",
            class: "btn btn-primary",
            text: "Exportar backup JSON",
            onclick: function () {
              exportData(false);
            },
          }),
        ])
      );
      children.push(ui.el("p", { class: "settings-section-title", text: "Restaurar desde un fichero" }));
      children.push(buildImportRow());
      children.push(ui.el("p", { class: "settings-section-title", text: "Zona de peligro" }));
      children.push(
        ui.el("div", { class: "settings-actions" }, [
          ui.el("button", {
            id: "settings-clear",
            type: "button",
            class: "btn btn-danger",
            text: "Vaciar todos los datos",
            onclick: askClearAll,
          }),
        ])
      );
    }
    children.push(errorNode);
    return ui.el("section", { class: "settings-section", "aria-label": "Datos" }, children);
  }

  function buildImportRow() {
    var input = ui.el("input", {
      id: "settings-import",
      name: "settings-import",
      type: "file",
      accept: "application/json,.json",
      class: "settings-file",
    });
    input.addEventListener("change", function () {
      var file = input.files && input.files[0] ? input.files[0] : null;
      // Reinicia la selección para poder volver a elegir el mismo fichero.
      input.value = "";
      handleImportFile(file);
    });
    return ui.el("div", { class: "settings-import" }, [
      ui.el("label", {
        class: "settings-import-label",
        htmlFor: "settings-import",
        text: "Elegir fichero de backup (.json)",
      }),
      input,
    ]);
  }

  /** Motivo del rechazo junto a la acción; nada cambia en los datos. */
  function showSettingsError(message) {
    if (settings.errorNode) {
      settings.errorNode.textContent = message;
      settings.errorNode.hidden = false;
    }
    ui.toast({ message: message, variant: "error" });
  }

  /** Descarga el backup (o el JSON crudo en modo bloqueo) sin red. */
  function exportData(raw) {
    var result = raw ? storage.exportRaw() : storage.exportAll();
    if (!result.ok) {
      showSettingsError("No se pudo exportar: " + result.error.message);
      return;
    }
    var name = raw
      ? RAW_BACKUP_PREFIX + today() + ".json"
      : storage.backupFileName(today());
    downloadText(result.value, name);
    ui.toast({
      message: (raw ? "JSON crudo exportado: " : "Backup exportado: ") + name,
      variant: "success",
    });
  }

  /** Descarga un texto como fichero (Blob + enlace efímero; solo `file://` local). */
  function downloadText(text, filename) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  /** Lee y valida el fichero; inválido → motivo y nada cambia. */
  function handleImportFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () {
      showSettingsError("No se pudo leer el fichero seleccionado.");
    };
    reader.onload = function () {
      var parsed = storage.parseBackup(String(reader.result));
      if (!parsed.ok) {
        showSettingsError("No se importó nada: " + parsed.error.message);
        return;
      }
      askImportConfirmation(parsed.value, file.name);
    };
    reader.readAsText(file);
  }

  function describeCounts(routines, entries, goals) {
    return (
      routines.length +
      " rutinas, " +
      entries.length +
      " registros y " +
      goals.length +
      " objetivos"
    );
  }

  /** La confirmación advierte la sobrescritura total con sus alcances. */
  function askImportConfirmation(backup, fileName) {
    settings.suspended = true;
    var body = ui.el("div", {}, [
      ui.el("p", {}, ["Vas a importar ", ui.el("strong", { text: fileName }), "."]),
      ui.el("p", {
        text:
          "Se sobrescribirán todos los datos actuales (" +
          describeCounts(state.routines, state.entries, state.goals) +
          ") por los del fichero (" +
          describeCounts(backup.routines, backup.completions, backup.goals) +
          "). Esta acción no se puede deshacer.",
      }),
      ui.el("p", { text: "Cancelar o un fichero inválido no cambian nada." }),
    ]);
    ui.confirmDialog({
      title: "Importar backup",
      body: body,
      confirmLabel: "Importar y sobrescribir",
      tone: "danger",
    }).then(function (confirmed) {
      settings.suspended = false;
      if (!confirmed) {
        ui.toast({ message: "Importación cancelada: no cambió nada.", variant: "info" });
        return;
      }
      var result = storage.importAll(backup);
      if (!result.ok) {
        showSettingsError("No se pudo importar: " + result.error.message);
        return;
      }
      // todas las colecciones de golpe + re-render sin recargar.
      reloadState();
      applyTheme(state.theme);
      updateThemeButton();
      closeSettings();
      resetScreenState();
      rerender();
      ui.toast({
        message:
          "Backup importado (" +
          describeCounts(backup.routines, backup.completions, backup.goals) +
          ").",
        variant: "success",
      });
    });
  }

  /** Vaciar es destrucción total → doble confirmación propia. */
  function askClearAll() {
    settings.suspended = true;
    ui.confirmDialog({
      title: "Vaciar todos los datos",
      body: ui.el("div", {}, [
        ui.el("p", {}, [
          "Se eliminarán ",
          ui.el("strong", { text: "todas" }),
          " las rutinas, registros, objetivos y preferencias guardados en este navegador.",
        ]),
        ui.el("p", {
          text:
            "No hay copia remota: exporta un backup antes si quieres conservar los datos.",
        }),
      ]),
      confirmLabel: "Continuar",
      tone: "danger",
    }).then(function (first) {
      if (!first) {
        settings.suspended = false;
        return;
      }
      ui.confirmDialog({
        title: "Última confirmación",
        body: ui.el("div", {}, [
          ui.el("p", {
            text:
              "Esta acción no se puede deshacer: se borrarán todas las claves mirutina.* de este navegador.",
          }),
          ui.el("p", {}, [
            "¿Vaciar ahora ",
            ui.el("strong", {
              text: describeCounts(state.routines, state.entries, state.goals),
            }),
            "?",
          ]),
        ]),
        confirmLabel: "Sí, vaciar todo",
        tone: "danger",
      }).then(function (second) {
        settings.suspended = false;
        if (!second) return;
        clearAllData();
      });
    });
  }

  function clearAllData() {
    var result = storage.clearAll();
    if (!result.ok) {
      showSettingsError("No se pudieron vaciar los datos: " + result.error.message);
      return;
    }
    reloadState();
    applyTheme(state.theme);
    updateThemeButton();
    closeSettings();
    resetScreenState();
    // Con el esquema vacío se sale del modo bloqueo.
    rerender();
    ui.toast({ message: "Datos vaciados: la app empieza de cero.", variant: "success" });
  }

  // ---- Historial ---------------------
  // Semana de lunes a domingo con navegación libre — también a
  // semanas futuras, que se muestran con guion y sin porcentaje
  // —, resumen hasta hoy, tarjetas por día con
  // borde azul en hoy y salto a la semana de una fecha.

  /** Semana visible en Historial; null = semana de hoy. Se limpia al cambiar de ruta. */
  var historyAnchor = null;

  var HISTORY_WEEKDAY_TITLES = {
    1: "Lunes",
    2: "Martes",
    3: "Miércoles",
    4: "Jueves",
    5: "Viernes",
    6: "Sábado",
    7: "Domingo",
  };

  function renderHistorial(container) {
    var hoy = today();
    // Cualquier fecha de la semana visible; arranca en la de hoy.
    var anchor = historyAnchor === null ? hoy : historyAnchor;
    var range = domain.weekRange(anchor);
    var futureWeek = domain.compareDates(range.start, hoy) > 0;
    var percent = domain.partialPeriodPercent(state.entries, state.routines, range, hoy);

    var page = ui.el("div", { class: "hist-page" });
    page.appendChild(renderHistoryHeader(range));
    page.appendChild(renderHistorySummary(range, percent, futureWeek, hoy));
    page.appendChild(renderHistoryDays(range, hoy));
    page.appendChild(renderHistoryJump());
    container.appendChild(page);
  }

  function renderHistoryHeader(range) {
    return revealWrap(
      ui.el("header", { class: "hist-header" }, [
        ui.el("h1", { class: "hist-title" }, [ui.icon("calendar", { size: 28 }), "Historial"]),
        // navegación como grupo segmentado con iconos.
        ui.el(
          "div",
          { class: "segmented", role: "group", "aria-label": "Navegación de semanas" },
          [
            ui.el(
              "button",
              {
                type: "button",
                class: "segmented-btn",
                "aria-label": "Semana anterior",
                onclick: function () {
                  changeHistoryAnchor(domain.addDays(range.start, -7));
                },
              },
              [ui.icon("chevron-left", { size: 16 }), "Anterior"]
            ),
            ui.el(
              "button",
              {
                type: "button",
                class: "segmented-btn",
                "aria-label": "Semana siguiente",
                onclick: function () {
                  changeHistoryAnchor(domain.addDays(range.start, 7));
                },
              },
              ["Siguiente", ui.icon("chevron-right", { size: 16 })]
            ),
          ]
        ),
      ]),
      0
    );
  }

  /** Navegación libre previa/posterior, sin límite con el futuro. */
  function changeHistoryAnchor(next) {
    checkMidnight();
    historyAnchor = next;
    rerender();
  }

  /** Color del semáforo como CSS var (verde/ámbar/rojo). */
  function semaphoreCss(percent) {
    var color = domain.semaforoColor(percent);
    return color === "green"
      ? "var(--color-success)"
      : color === "yellow"
        ? "var(--color-warning)"
        : "var(--color-danger)";
  }

  /** "Semana del … al …", conteo, % grande y barra del semáforo. */
  function renderHistorySummary(range, percent, futureWeek, hoy) {
    var counts = periodCountsForRange(range, hoy);
    var body = futureWeek
      ? ui.el("p", {
          class: "hist-summary-empty",
          text: "Sin datos todavía (semana futura)",
        })
      : [
          ui.el("div", { class: "hist-summary-top" }, [
            ui.el("div", {}, [
              ui.el("h2", {
                class: "hist-summary-title",
                text:
                  "Semana del " +
                  formatShortNumericDate(range.start) +
                  " al " +
                  formatShortNumericDate(range.end),
              }),
              ui.el("p", {
                class: "hist-summary-counts",
                text: counts.completed + " de " + counts.scheduled + " rutinas cumplidas",
              }),
            ]),
            ui.el("p", {
              class: "hist-summary-big",
              style: { color: semaphoreCss(percent) },
              text: Math.round(percent) + "%",
            }),
          ]),
          ui.progressBar({
            value: percent,
            label: "Cumplimiento de la semana",
            size: "lg",
            color: semaphoreCss(percent),
          }),
          ui.el("p", {
            class: "hist-summary-hint",
            text: "Los días futuros no puntúan ni penalizan (semana de lunes a domingo).",
          }),
        ];

    return revealWrap(
      ui.el("section", { class: "hist-summary card", "aria-label": "Resumen de la semana" }, body),
      60
    );
  }

  /** Conteos cumplidas/programadas del periodo recortado a hoy (misma base que statsSummary). */
  function periodCountsForRange(range, hoy) {
    return domain
      .perRoutineStats(state.entries, state.routines, range, hoy)
      .reduce(
        function (totals, row) {
          totals.completed += row.completedCount;
          totals.scheduled += row.scheduledCount;
          return totals;
        },
        { completed: 0, scheduled: 0 }
      );
  }

  function renderHistoryDays(range, hoy) {
    var body;
    if (state.routines.length === 0) {
      body = ui.emptyState({
        icon: "🗓️",
        title: "Aún no hay rutinas",
        description: "Crea rutinas para empezar a registrar su cumplimiento y verlo aquí.",
        actions: ui.el("a", {
          class: "btn btn-secondary btn-sm",
          href: "#/rutinas",
          text: "Ir a Rutinas",
        }),
      });
    } else {
      var grid = ui.el("div", { class: "hist-days" });
      for (var index = 0; index < 7; index += 1) {
        grid.appendChild(historyDayCard(domain.addDays(range.start, index), hoy));
      }
      body = grid;
    }
    return revealWrap(
      ui.el("section", { class: "hist-section", "aria-label": "Días de la semana" }, [body]),
      120
    );
  }

  /**
   * Tarjeta de un día con cabecera (día + fecha dd/mm), filas con
   * punto de color + nombre + icono circular ✓/✗ (guion en días futuros,
   * sin marcar) y pie "X/Y" + "%". Hoy con borde de acento.
   */
  function historyDayCard(date, hoy) {
    var weekday = domain.weekdayOf(date);
    var isToday = date === hoy;
    var isFuture = domain.isFuture(date, hoy);
    var schedule = domain.scheduleForDate(state.routines, date, hoy);
    var dayEntries = domain.entriesForDate(state.entries, date);
    var completion = domain.dayCompletion(dayEntries, schedule);
    var title = HISTORY_WEEKDAY_TITLES[weekday];

    var children = [
      ui.el("header", { class: "hist-card-head" }, [
        ui.el("h3", { class: "hist-card-name", text: title }),
        ui.el("span", { class: "hist-card-date", text: formatDayShort(date) }),
      ]),
    ];

    if (schedule.length === 0) {
      children.push(ui.el("p", { class: "hist-card-empty", text: "—" }));
    } else {
      var list = ui.el("ul", { class: "hist-list" });
      schedule.forEach(function (routine) {
        var marked = domain.isMarked(dayEntries, routine.id);
        var indicator = isFuture
          ? ui.el("span", {
              class: "hist-indicator-dash",
              role: "img",
              "aria-label": "sin registrar (día futuro)",
              text: "—",
            })
          : marked
            ? ui.icon("check-circle-fill", {
                size: 18,
                className: "hist-indicator-icon hist-ok",
                label: "cumplida",
              })
            : ui.icon("x-circle-fill", {
                size: 18,
                className: "hist-indicator-icon hist-ko",
                label: "no cumplida",
              });
        list.appendChild(
          ui.el("li", { class: "hist-item" }, [
            ui.el("span", {
              class: "hist-dot",
              style: { background: routine.color },
              "aria-hidden": "true",
            }),
            ui.el("span", { class: "hist-routine", text: routine.name }),
            indicator,
          ])
        );
      });
      children.push(list);
    }

    if (!isFuture) {
      children.push(
        ui.el("div", { class: "hist-card-foot" }, [
          ui.el("span", {}, [
            ui.el("strong", {
              text: completion.completedCount + "/" + completion.scheduledCount,
            }),
          ]),
          ui.el("strong", {
            style: { color: semaphoreCss(completion.percent) },
            text: Math.round(completion.percent) + "%",
          }),
        ])
      );
    }

    return ui.el(
      "article",
      {
        class: isToday ? "hist-card hist-card-today" : "hist-card",
        "aria-label":
          title + " " + formatDayShort(date) + (isToday ? " (hoy)" : ""),
      },
      children
    );
  }

  /** Salto a la semana que contiene la fecha elegida (cualquier fecha). */
  function renderHistoryJump() {
    var errorNode = ui.el("p", {
      id: "jump-date-error",
      class: "field-error",
      role: "alert",
      hidden: true,
    });
    var input = ui.el("input", {
      id: "jump-date",
      name: "jump-date",
      type: "date",
      class: "hist-jump-input",
      "aria-describedby": "jump-date-error",
    });

    var form = ui.el(
      "form",
      {
        class: "hist-jump",
        novalidate: "true",
        onsubmit: function (event) {
          event.preventDefault();
          if (input.value === "") {
            input.setAttribute("aria-invalid", "true");
            errorNode.hidden = false;
            errorNode.textContent = "Elige una fecha para saltar a su semana.";
            return;
          }
          input.removeAttribute("aria-invalid");
          errorNode.hidden = true;
          errorNode.textContent = "";
          changeHistoryAnchor(input.value);
        },
      },
      [
        ui.el("label", {
          class: "hist-jump-label",
          htmlFor: "jump-date",
          text: "Saltar a la semana de…",
        }),
        ui.el("div", { class: "hist-jump-row" }, [
          input,
          ui.el("button", {
            type: "submit",
            class: "btn btn-secondary",
            text: "Ir a la semana",
          }),
        ]),
        errorNode,
      ]
    );

    return revealWrap(
      ui.el("section", { class: "hist-jump-section", "aria-label": "Saltar a una semana" }, [form]),
      180
    );
  }

  /** Etiqueta del rango visible, p. ej. "6 – 12 oct 2026" (cruzando mes/año). */
  function formatRange(start, end) {
    return formatLongishDate(start) + " – " + formatLongishDate(end);
  }

  function formatLongishDate(dateString) {
    var parts = dateString.split("-").map(Number);
    var parsed = new Date(parts[0], parts[1] - 1, parts[2]);
    return parsed.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  /** Fecha dd/mm/aaaa (resumen y rango de estadísticas). */
  function formatShortNumericDate(dateString) {
    var parts = dateString.split("-").map(Number);
    var day = String(parts[2]).padStart(2, "0");
    var month = String(parts[1]).padStart(2, "0");
    return day + "/" + month + "/" + parts[0];
  }

  /** Fecha dd/mm (cabecera de las tarjetas del historial). */
  function formatDayShort(dateString) {
    return formatShortNumericDate(dateString).slice(0, 5);
  }

  // ---- Estadísticas --------------------
  // Filtro Semana/Mes/Año/Personalizado, 3 tarjetas, barras
  // por rutina, dona, línea fija de 7 días ajena al filtro
  // tabla de detalle, rejilla de rachas, re-render
  // al cambiar el filtro sin recargar y estados vacíos.

  var STATS_PERIOD_TABS = [
    { id: "week", label: "Semana" },
    { id: "month", label: "Mes" },
    { id: "year", label: "Año" },
    { id: "custom", label: "Personalizado" },
  ];

  /** Filtro activo; se limpia al cambiar de ruta. */
  var statsPeriod = "week";
  /** Último rango personalizado válido (un rango inválido nunca se aplica). */
  var statsCustomRange = null;
  /** Borrador vivo del formulario de rango (start/end/errores junto al campo). */
  var statsCustomDraft = null;

  function renderEstadisticas(container) {
    var hoy = today();
    var fallbackRange = { start: domain.addDays(hoy, -29), end: hoy };
    var appliedCustom = statsCustomRange || fallbackRange;
    var range = rangeForPeriod(statsPeriod, hoy, appliedCustom);

    var summary = domain.statsSummary(state.entries, state.routines, range, hoy);
    var routineStats = domain.perRoutineStats(state.entries, state.routines, range, hoy);
    var donut = domain.donutData(state.entries, state.routines, range, hoy);
    // la línea no recibe el rango, solo "hoy": no reacciona al filtro.
    var weekLine = domain.last7DaysLine(state.entries, state.routines, hoy);
    var streaks = state.routines
      .map(function (routine) {
        return { routine: routine, streak: domain.routineStreak(state.entries, routine, hoy) };
      })
      .sort(function (a, b) {
        return b.streak - a.streak || a.routine.name.localeCompare(b.routine.name, "es");
      });
    var hasData = summary.scheduledCount > 0;

    // barras por rutina (colores) | dona "Global" (verde/rojo + leyenda).
    var chartsGrid = ui.el("div", { class: "stats-grid-2" }, [
      ui.el("section", { class: "stats-chart-card card", "aria-label": "Cumplimiento por rutina" }, [
        ui.el("h2", { class: "stats-block-title" }, [
          ui.icon("chart", { size: 20 }),
          "Cumplimiento por rutina",
        ]),
        routineStats.length > 0
          ? charts.barChart(
              routineStats.map(function (row) {
                return {
                  id: row.routine.id,
                  label: row.routine.name,
                  percent: row.percent,
                  color: row.routine.color,
                };
              })
            )
          : ui.emptyState({
              icon: "📊",
              title: "Sin datos en el periodo",
              description: "No hay rutinas programadas dentro del rango seleccionado.",
            }),
      ]),
      ui.el("section", { class: "stats-chart-card card", "aria-label": "Global" }, [
        ui.el("h2", { class: "stats-block-title" }, [
          ui.icon("target", { size: 20 }),
          "Global",
        ]),
        hasData
          ? charts.donutChart(donut)
          : ui.emptyState({
              icon: "🍩",
              title: "Sin registros en el periodo",
              description:
                "Cuando haya rutinas programadas verás aquí la dona de cumplimiento.",
            }),
      ]),
    ]);

    var page = ui.el("div", { class: "stats-page" });
    page.appendChild(renderStatsFilter(hoy, fallbackRange, range));
    page.appendChild(
      ui.el(
        "div",
        {
          class: "stats-panel",
          role: "tabpanel",
          id: "tabpanel-" + statsPeriod,
          "aria-labelledby": "tab-" + statsPeriod,
        },
        [
          renderStatsCards(summary, range, hasData),
          chartsGrid,
          renderStatsBlock("note", "Detalle por rutina", 180,
            routineStats.length > 0
              ? statsRoutineTable(routineStats)
              : ui.emptyState({
                  icon: "📋",
                  title: "Sin detalle por rutina",
                  description: "El periodo seleccionado no tiene rutinas programadas.",
                })
          ),
        ]
      )
    );
    page.appendChild(
      revealWrap(
        ui.el("section", { class: "stats-section", "aria-labelledby": "stats-line-title" }, [
          ui.el("div", { class: "stats-block-head" }, [
            ui.el("h2", { id: "stats-line-title", class: "stats-block-title" }, [
              ui.icon("chart", { size: 20 }),
              "Últimos 7 días",
            ]),
          ]),
          state.routines.length > 0
            ? charts.lineChart(weekLine)
            : ui.emptyState({
                icon: "📈",
                title: "Sin rutinas para mostrar",
                description: "Crea rutinas para ver el cumplimiento diario de la semana.",
              }),
        ]),
        0
      )
    );
    page.appendChild(
      revealWrap(
        ui.el("section", { class: "stats-section", "aria-labelledby": "stats-streaks-title" }, [
          ui.el("h2", { id: "stats-streaks-title", class: "stats-block-title" }, [
            ui.icon("flame", { size: 20 }),
            "Rachas actuales por rutina",
          ]),
          streaks.length > 0
            ? statsStreakGrid(streaks)
            : ui.emptyState({
                icon: "🔥",
                title: "Sin rutinas para mostrar",
                description: "Crea rutinas para ver aquí su racha actual.",
              }),
        ]),
        60
      )
    );
    container.appendChild(page);
  }

  /** Rango del periodo seleccionado (el dominio recorta a hoy). */
  function rangeForPeriod(period, hoy, custom) {
    switch (period) {
      case "month":
        return domain.monthRange(hoy);
      case "year":
        return { start: hoy.slice(0, 4) + "-01-01", end: hoy.slice(0, 4) + "-12-31" };
      case "custom":
        return custom;
      case "week":
      default:
        return domain.weekRange(hoy);
    }
  }

  /** Pills de periodo + línea de rango visible ("📅 Este mes: … a …"). */
  function renderStatsFilter(hoy, fallbackRange, range) {
    var periodLabels = {
      week: "Esta semana",
      month: "Este mes",
      year: "Este año",
      custom: "Personalizado",
    };
    return revealWrap(
      ui.el("div", { class: "stats-filter" }, [
        ui.el("header", { class: "stats-header" }, [
          ui.el("h1", { class: "stats-title" }, [ui.icon("chart", { size: 28 }), "Estadísticas"]),
          ui.tabs({
            items: STATS_PERIOD_TABS,
            value: statsPeriod,
            ariaLabel: "Filtro de periodo",
            onChange: function (id) {
              checkMidnight();
              statsPeriod = id;
              if (id === "custom" && statsCustomDraft === null) {
                var applied = statsCustomRange || fallbackRange;
                statsCustomDraft = { start: applied.start, end: applied.end, errors: {} };
              }
              rerender();
            },
          }),
        ]),
        ui.el("p", { class: "stats-range-line" }, [
          ui.icon("calendar", { size: 17 }),
          " ",
          periodLabels[statsPeriod] + ": ",
          ui.el("strong", {
            text:
              formatShortNumericDate(range.start) +
              " a " +
              formatShortNumericDate(range.end),
          }),
        ]),
        statsPeriod === "custom" ? buildCustomRangeForm(hoy, fallbackRange) : null,
      ]),
      0
    );
  }

  /** Rango inicio–fin con validación en vivo junto al campo. */
  function buildCustomRangeForm(hoy, fallbackRange) {
    var applied = statsCustomRange || fallbackRange;
    if (statsCustomDraft === null) {
      statsCustomDraft = { start: applied.start, end: applied.end, errors: {} };
    }
    var draft = statsCustomDraft;

    var startInput = ui.el("input", {
      id: "custom-range-start",
      name: "custom-range-start",
      type: "date",
      class: "stats-date-input",
      value: draft.start,
      max: hoy,
      "data-draft": "custom-range-start",
    });
    var endInput = ui.el("input", {
      id: "custom-range-end",
      name: "custom-range-end",
      type: "date",
      class: "stats-date-input",
      value: draft.end,
      max: hoy,
      "data-draft": "custom-range-end",
    });

    startInput.addEventListener("change", function () {
      draft.start = startInput.value;
      applyCustomRange(draft);
    });
    endInput.addEventListener("change", function () {
      draft.end = endInput.value;
      applyCustomRange(draft);
    });

    return ui.el("div", { class: "stats-range-row" }, [
      ui.field({ label: "Inicio", control: startInput, error: draft.errors.inicio }),
      ui.field({ label: "Fin", control: endInput, error: draft.errors.fin }),
    ]);
  }

  /** Solo un rango válido llega al estado; el fallo se muestra junto al campo. */
  function applyCustomRange(draft) {
    if (draft.start === "" || draft.end === "") {
      draft.errors =
        draft.start === ""
          ? { inicio: "Selecciona la fecha de inicio." }
          : { fin: "Selecciona la fecha de fin." };
      rerender();
      return;
    }
    var result = domain.validateCustomRange(draft.start, draft.end, today());
    if (!result.ok) {
      // El fallo indica qué campo incumple: inicio > fin → inicio; fin > hoy → fin.
      var startInvalid = domain.compareDates(draft.start, draft.end) > 0;
      draft.errors = startInvalid ? { inicio: result.message } : { fin: result.message };
      rerender();
      return;
    }
    draft.errors = {};
    statsCustomRange = result.value;
    rerender();
  }

  /** 3 tarjetas del periodo con números coloreados por semántica. */
  function renderStatsCards(summary, range, hasData) {
    return revealWrap(
      ui.el("section", { class: "stats-cards", "aria-label": "Resumen del periodo" }, [
        summaryCard(
          "Cumplimiento general",
          hasData ? Math.round(summary.percent) + "%" : "—",
          hasData ? formatRange(range.start, range.end) : "Sin datos en este periodo",
          "accent"
        ),
        summaryCard(
          "Registros cumplidos",
          hasData ? String(summary.completedCount) : "—",
          "Rutinas marcadas en el periodo",
          "success"
        ),
        summaryCard(
          "Registros totales",
          hasData ? String(summary.scheduledCount) : "—",
          "Programados: cumplidos + no cumplidos"
        ),
      ]),
      0
    );
  }

  /** Sección genérica de estadísticas: título con icono + contenido. */
  function renderStatsBlock(iconName, title, delayMs, content) {
    return revealWrap(
      ui.el("section", { class: "stats-section", "aria-label": title }, [
        ui.el("h2", { class: "stats-block-title" }, [ui.icon(iconName, { size: 20 }), title]),
        content,
      ]),
      delayMs
    );
  }

  /** Tabla de detalle por rutina con columna "%" + barra. */
  function statsRoutineTable(rows) {
    var tbody = ui.el("tbody");
    rows.forEach(function (row) {
      tbody.appendChild(
        ui.el("tr", {}, [
          ui.el("th", { scope: "row", class: "stats-table-name" }, [
            ui.el("span", {
              class: "stats-table-dot",
              style: { background: row.routine.color },
              "aria-hidden": "true",
            }),
            ui.el("span", { text: row.routine.name }),
          ]),
          ui.el("td", {
            class: "stats-table-counts",
            text: row.completedCount + " / " + row.scheduledCount,
          }),
          ui.el("td", {
            class: "stats-table-percent-col",
            text: Math.round(row.percent) + "%",
          }),
          ui.el("td", { class: "stats-table-progress" }, [
            ui.progressBar({
              value: row.percent,
              label: "Cumplimiento de " + row.routine.name + " en el periodo",
              color: row.routine.color,
            }),
          ]),
        ])
      );
    });

    return ui.el("div", { class: "stats-table-wrapper" }, [
      ui.el("table", { class: "stats-table" }, [
        ui.el("thead", {}, [
          ui.el("tr", {}, [
            ui.el("th", { scope: "col", text: "Rutina" }),
            ui.el("th", { scope: "col", text: "Cumplidas / programadas" }),
            ui.el("th", { scope: "col", text: "%" }),
            ui.el("th", { scope: "col", text: "Progreso" }),
          ]),
        ]),
        tbody,
      ]),
    ]);
  }

  /** Rejilla con la racha actual de cada rutina. */
  function statsStreakGrid(items) {
    var grid = ui.el("ul", { class: "streak-grid" });
    items.forEach(function (item) {
      grid.appendChild(
        ui.el("li", { class: "streak-cell" }, [
          ui.el("span", { class: "streak-cell-head" }, [
            ui.el("span", {
              class: "streak-cell-dot",
              style: { background: item.routine.color },
              "aria-hidden": "true",
            }),
            ui.el("span", { class: "streak-cell-name", text: item.routine.name }),
          ]),
          ui.el("span", {
            class: "streak-cell-count",
            text: "🔥 " + item.streak + " " + (item.streak === 1 ? "día" : "días"),
          }),
        ])
      );
    });
    return grid;
  }

  // ---- Registro diario -------------------

  /** Fecha seleccionada en Registro; null = hoy. Se limpia al cambiar de ruta. */
  var logDate = null;
  /** Error del selector de fecha (futuro intentado). */
  var logDateError = null;
  /** Paneles "Notas" abiertos por rutina; no se persisten. */
  var openNotes = {};

  function renderRegistro(container) {
    var hoy = today();
    var date = logDate === null ? hoy : logDate;
    var schedule = domain.scheduleForDate(state.routines, date, hoy);
    var completion = domain.dayCompletion(
      domain.entriesForDate(state.entries, date),
      schedule
    );

    var page = ui.el("div", { class: "log-page" });
    page.appendChild(renderLogHeader(date, hoy));
    page.appendChild(renderLogSummary(completion, date, hoy));
    page.appendChild(renderLogChecklist(date, schedule, completion));
    container.appendChild(page);
  }

  function renderLogHeader(date, hoy) {
    return revealWrap(
      ui.el("header", { class: "log-header" }, [
        ui.el("div", {}, [
          ui.el("h1", { class: "log-title" }, [
            ui.icon("check-circle", { size: 28 }),
            "Registro diario",
          ]),
          ui.el("div", { class: "page-sub-row" }, [
            ui.el("p", { class: "log-date-line", text: formatLongDate(date) }),
            // pill "Hoy" junto a la fecha larga.
            date === hoy ? ui.el("span", { class: "pill pill-today", text: "Hoy" }) : null,
          ]),
        ]),
        ui.el("div", { class: "log-date-nav" }, [
          ui.el("button", {
            type: "button",
            class: "btn btn-secondary btn-sm",
            "aria-label": "Día anterior",
            onclick: function () {
              changeLogDate(domain.addDays(date, -1));
            },
          }, [ui.icon("chevron-left", { size: 15 }), "Anterior"]),
          ui.el("div", { class: "log-date-field" }, [
            ui.el("label", { class: "log-date-label", htmlFor: "log-date", text: "Fecha" }),
            ui.el("input", {
              id: "log-date",
              name: "log-date",
              type: "date",
              class: "log-date-input",
              value: date,
              max: hoy,
              onchange: function (event) {
                if (event.target.value !== "") {
                  changeLogDate(event.target.value);
                }
              },
            }),
          ]),
          ui.el("button", {
            type: "button",
            class: "btn btn-secondary btn-sm",
            "aria-label": "Día siguiente",
            disabled: domain.compareDates(date, hoy) >= 0,
            onclick: function () {
              changeLogDate(domain.addDays(date, 1));
            },
          }, ["Siguiente", ui.icon("chevron-right", { size: 15 })]),
          date !== hoy
            ? ui.el("button", {
                type: "button",
                class: "btn btn-ghost btn-sm",
                text: "Hoy",
                onclick: function () {
                  changeLogDate(hoy);
                },
              })
            : null,
        ]),
        logDateError
          ? ui.el("p", { class: "log-date-error", role: "alert", text: logDateError })
          : null,
      ]),
      0
    );
  }

  /** Las fechas futuras se bloquean con mensaje junto al campo. */
  function changeLogDate(next) {
    checkMidnight();
    if (domain.isFuture(next, today())) {
      logDateError = "No puedes registrar una fecha futura; solo hoy y días anteriores.";
      rerender();
      return;
    }
    logDateError = null;
    logDate = next;
    rerender();
  }

  /** Métrica grande del resumen. */
  function logMetric(label, value, tone) {
    return ui.el("div", { class: "log-metric" }, [
      ui.el("p", { class: "log-metric-label", text: label }),
      ui.el("p", {
        class: "log-metric-value" + (tone ? " log-metric-" + tone : ""),
        text: value,
      }),
    ]);
  }

  /** 4 métricas + barra de ocupación con % dentro y escala 0h/24h. */
  function renderLogSummary(completion, date, hoy) {
    var occupancyValue = domain.occupancyPercent(state.routines, date, hoy);
    var freeMinutes = domain.freeMinutesForDate(state.routines, date, hoy);
    var occupiedText = domain.formatDuration(
      domain.occupiedMinutesForDate(state.routines, date, hoy)
    );
    var todayPercent = completion.percent;
    var progressTone =
      todayPercent < 40 ? "danger" : todayPercent >= 70 ? "success" : null;

    var occupancyFill = ui.el("div", { class: "occupancy-fill" });
    occupancyFill.style.width = Math.min(100, Math.max(0, occupancyValue)) + "%";

    var card = ui.el("div", { class: "card log-summary-card" }, [
      ui.el("div", { class: "log-metrics" }, [
        logMetric("Progreso", Math.round(todayPercent) + "%", progressTone),
        logMetric(
          "Cumplidas",
          completion.completedCount + "/" + completion.scheduledCount,
          "accent"
        ),
        logMetric("Tiempo destinado", domain.formatDuration(completion.scheduledMinutes)),
        logMetric("Tiempo cumplido", domain.formatDuration(completion.completedMinutes), "success"),
      ]),
      ui.progressBar({
        value: todayPercent,
        label: "Cumplimiento del día",
        size: "lg",
        color: semaphoreCss(todayPercent),
      }),
      ui.el("div", { class: "occupancy" }, [
        ui.el("div", { class: "log-summary-head" }, [
          ui.el("span", { class: "occupancy-label" }, [
            ui.icon("chart", { size: 16 }),
            "Ocupación del día: ",
            ui.el("strong", { text: occupiedText + " de 24h" }),
          ]),
          // Badge de tiempo libre.
          ui.el("span", { class: "free-badge" }, [
            ui.icon("clock", { size: 14 }),
            "Tiempo libre: " + domain.formatDuration(freeMinutes),
          ]),
        ]),
        ui.el("div", {
          class: "occupancy-bar",
          role: "progressbar",
          "aria-label": "Porcentaje de las 24 horas ocupado por rutinas",
          "aria-valuemin": "0",
          "aria-valuemax": "100",
          "aria-valuenow": String(Math.round(occupancyValue)),
        }, [
          occupancyFill,
          ui.el("span", {
            class: "occupancy-percent",
            text: Math.round(occupancyValue) + "%",
          }),
        ]),
        ui.el("div", { class: "occupancy-scale" }, [
          ui.el("span", { text: "0h" }),
          ui.el("span", { text: domain.formatDuration(freeMinutes) + " libres" }),
          ui.el("span", { text: "24h" }),
        ]),
      ]),
    ]);

    return revealWrap(
      ui.el("section", { class: "log-section", "aria-label": "Resumen del día" }, [card]),
      60
    );
  }

  function renderLogChecklist(date, schedule, completion) {
    var head = ui.el("div", { class: "log-checklist-head" }, [
      ui.el("h2", { class: "section-title" }, [
        ui.icon("list", { size: 20 }),
        "Rutinas del día",
      ]),
      schedule.length > 0
        ? ui.el("div", { class: "log-bulk-actions" }, [
            ui.el("button", {
              type: "button",
              class: "btn btn-secondary btn-sm",
              text: "Marcar todas",
              disabled: completion.completedCount === schedule.length,
              onclick: function () {
                setAll(date, true);
              },
            }),
            ui.el("button", {
              type: "button",
              class: "btn btn-ghost btn-sm",
              text: "Desmarcar todas",
              disabled: completion.completedCount === 0,
              onclick: function () {
                setAll(date, false);
              },
            }),
          ])
        : null,
    ]);

    var body;
    if (schedule.length === 0) {
      body = ui.emptyState({
        title: "No hay rutinas programadas para este día",
        description:
          "Programa rutinas desde la pantalla de Rutinas y vuelve aquí para registrarlas.",
      });
    } else {
      var dayEntries = domain.entriesForDate(state.entries, date);
      var list = ui.el("div", { class: "log-checklist" });
      schedule.forEach(function (routine) {
        list.appendChild(logRoutineCard(routine, dayEntries, date));
      });
      body = list;
    }

    return revealWrap(
      ui.el("section", { class: "log-section", "aria-label": "Rutinas del día" }, [
        head,
        body,
      ]),
      120
    );
  }

  /**
   * Tarjeta de rutina del Registro con acento del color de la
   * rutina, descripción, duración y botón "Notas" colapsable (autoguardado
   * intacto; el panel no se persiste).
   */
  function logRoutineCard(routine, dayEntries, date) {
    var marked = domain.isMarked(dayEntries, routine.id);
    var isOpen = !!openNotes[routine.id];

    var notesToggle = ui.el(
      "button",
      {
        type: "button",
        class: "btn btn-secondary btn-sm",
        "aria-expanded": String(isOpen),
        onclick: function () {
          openNotes[routine.id] = !openNotes[routine.id];
          collapse.hidden = !openNotes[routine.id];
          notesToggle.setAttribute("aria-expanded", String(openNotes[routine.id]));
        },
      },
      [ui.icon("note", { size: 15 }), "Notas"]
    );

    var collapse = ui.el(
      "div",
      { class: "note-collapse", hidden: !isOpen },
      [buildNoteEditor(routine, date, dayEntries)]
    );

    return ui.el(
      "div",
      {
        class: "log-routine-card" + (marked ? " log-item-marked" : ""),
        style: { "border-left-color": routine.color },
      },
      [
        ui.el("div", { class: "log-routine-main" }, [
          ui.checkbox({
            id: "check-" + routine.id,
            checked: marked,
            checkedColor: "var(--color-success)",
            ariaLabel: (marked ? "Desmarcar " : "Marcar ") + routine.name,
            onChange: function () {
              toggleRoutine(routine.id, date);
            },
          }),
          ui.el("div", { class: "log-routine-text" }, [
            ui.el("span", {
              class: "log-routine-name" + (marked ? " log-name-done" : ""),
              text: routine.name,
            }),
            routine.description
              ? ui.el("span", {
                  class: "log-routine-description",
                  text: routine.description,
                })
              : null,
            ui.el("span", { class: "log-duration-pill" }, [
              ui.icon("clock", { size: 13 }),
              domain.formatDuration(routine.durationMinutes),
            ]),
          ]),
        ]),
        ui.el("div", { class: "log-routine-actions" }, [notesToggle]),
        collapse,
      ]
    );
  }

  /**
   * Editor de nota por rutina del día: guardado automático al
   * instante sobre la entrada (solo con la rutina marcada). No re-renderiza
   * mientras se escribe, de modo que el borrador en curso nunca se pisa
   * los re-renderes ajenos lo conservan vía `data-draft`.
   */
  function buildNoteEditor(routine, date, dayEntries) {
    var entry = dayEntries.find(function (item) {
      return item.routineId === routine.id;
    });
    var marked = domain.isMarked(dayEntries, routine.id);
    var initial = entry && entry.note ? entry.note : "";
    var textareaId = "note-" + routine.id;
    var hintId = "note-hint-" + routine.id;
    var counterId = "note-counter-" + routine.id;

    var hint = ui.el("span", { id: hintId, class: "note-hint" });
    var counter = ui.el("span", {
      id: counterId,
      class: initial.length > NOTE_MAX_LENGTH ? "note-counter-over" : "note-counter",
      "aria-hidden": "true",
      text: initial.length + "/" + NOTE_MAX_LENGTH,
    });
    var textarea = ui.el("textarea", {
      id: textareaId,
      name: textareaId,
      class: "note-textarea",
      rows: 2,
      value: initial,
      disabled: !marked,
      placeholder: marked ? "Añade una nota…" : "Marca la rutina para añadir una nota",
      "aria-describedby": hintId,
      "data-draft": textareaId,
      "data-note-routine": routine.id,
      "data-note-date": date,
    });
    textarea.addEventListener("input", function () {
      var text = textarea.value;
      if (text.length > NOTE_MAX_LENGTH) {
        // aviso y bloqueo del guardado hasta que se acorte.
        applyNoteMeta(routine.id, text);
        hint.textContent = noteOverLimitMessage();
        return;
      }
      var result = saveNote(routine.id, date, text);
      applyNoteMeta(routine.id, text);
      if (result.ok) {
        hint.textContent = "Guardada ✓";
      } else {
        hint.textContent = result.message;
        ui.toast({ message: result.message, variant: "error" });
      }
    });

    return ui.el("div", { class: "note-editor" }, [
      ui.el("label", { class: "note-label", htmlFor: textareaId, text: "Nota" }),
      textarea,
      ui.el("div", { class: "note-meta" }, [hint, counter]),
    ]);
  }

  function noteOverLimitMessage() {
    return (
      "La nota no puede superar los " +
      NOTE_MAX_LENGTH +
      " caracteres; no se guardará hasta que la acortes."
    );
  }

  /** Pinta contador y color del límite para la nota de una rutina. */
  function applyNoteMeta(routineId, text) {
    var counter = document.getElementById("note-counter-" + routineId);
    if (!counter) return;
    counter.textContent = text.length + "/" + NOTE_MAX_LENGTH;
    counter.className = text.length > NOTE_MAX_LENGTH ? "note-counter-over" : "note-counter";
  }

  /**
   * Tras restaurar borradores, la nota mostrada vuelve al valor
   * guardado: la fuente de verdad es la entrada, que pudo cambiar, no existir
   * (desmarcar la borra) o llegar de otra pestaña. El único borrador que
   * sobrevive es el que está fuera de límite, porque ese no se guardó.
   */
  function resyncNoteEditors() {
    var textareas = document.querySelectorAll("textarea.note-textarea");
    Array.prototype.forEach.call(textareas, function (textarea) {
      var routineId = textarea.getAttribute("data-note-routine");
      var date = textarea.getAttribute("data-note-date");
      var entry = state.entries.find(function (item) {
        return item.routineId === routineId && item.date === date;
      });
      var saved = entry && entry.note ? entry.note : "";
      var overLimitDraft = textarea.value.length > NOTE_MAX_LENGTH;
      var shown = overLimitDraft ? textarea.value : saved;
      if (textarea.value !== shown) textarea.value = shown;
      applyNoteMeta(routineId, shown);
      var hint = document.getElementById("note-hint-" + routineId);
      if (hint) {
        hint.textContent = overLimitDraft ? noteOverLimitMessage() : "";
      }
    });
  }

  // ---- Rutinas: CRUD ----------------

  var DEFAULT_ROUTINE_COLOR = "#6366f1";
  var HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
  /** La tarjeta se desvanece antes de quitarse del DOM. */
  var REMOVE_FADE_MS = 220;
  var WEEKDAY_SHORT_LABELS = {
    1: "Lun",
    2: "Mar",
    3: "Mié",
    4: "Jue",
    5: "Vie",
    6: "Sáb",
    7: "Dom",
  };

  /** Formulario abierto: null | { mode:"create" } | { mode:"edit", routineId }. */
  var editing = null;
  /** Datos vivos del formulario (se conservan en los re-renderes externos). */
  var formState = null;
  /** Nodos del formulario para pintar/limpiar errores en vivo. */
  var formRefs = null;
  /** Rutina en desvanecimiento tras confirmar su borrado. */
  var removingId = null;

  function findRoutine(id) {
    return state.routines.find(function (routine) {
      return routine.id === id;
    });
  }

  function renderRutinas(container) {
    var page = ui.el("div", { class: "rt-page" });
    page.appendChild(renderRutinasHeader());
    if (editing !== null) {
      page.appendChild(
        revealWrap(
          ui.el("section", {
            "aria-label": editing.mode === "create" ? "Crear rutina" : "Editar rutina",
          }, [ui.el("div", { class: "card" }, [buildRoutineForm()])]),
          0
        )
      );
    }
    page.appendChild(renderRutinasList());
    container.appendChild(page);
  }

  function renderRutinasHeader() {
    return revealWrap(
      ui.el("header", { class: "rt-header" }, [
        ui.el("h1", { class: "rt-title" }, [ui.icon("list", { size: 28 }), "Mis Rutinas"]),
        editing === null
          ? ui.el(
              "button",
              {
                type: "button",
                class: "btn btn-primary",
                onclick: openCreateForm,
              },
              [ui.icon("plus", { size: 18 }), "Nueva rutina"]
            )
          : null,
      ]),
      0
    );
  }

  function openCreateForm() {
    editing = { mode: "create" };
    formState = {
      candidateId: newId(),
      name: "",
      description: "",
      color: DEFAULT_ROUTINE_COLOR,
      hours: "0",
      minutes: "30",
      weekdays: [],
      active: true,
      errors: {},
      showErrors: false,
      formError: null,
    };
    rerender();
  }

  function openEditForm(routine) {
    editing = { mode: "edit", routineId: routine.id };
    formState = {
      candidateId: routine.id,
      name: routine.name,
      description: routine.description,
      color: routine.color,
      hours: String(Math.floor(routine.durationMinutes / 60)),
      minutes: String(routine.durationMinutes % 60),
      weekdays: routine.weekdays.slice().sort(function (a, b) {
        return a - b;
      }),
      active: routine.active,
      errors: {},
      showErrors: false,
      formError: null,
    };
    rerender();
  }

  function closeForm() {
    editing = null;
    formState = null;
    formRefs = null;
  }

  function renderRutinasList() {
    var body;
    if (state.routines.length === 0) {
      body = ui.emptyState({
        icon: "📆",
        title: "Aún no hay rutinas",
        description:
          "Crea tu primera rutina para empezar a registrar cumplimiento y objetivos.",
        actions: ui.el("button", {
          type: "button",
          class: "btn btn-primary",
          text: "Crear la primera rutina",
          onclick: openCreateForm,
        }),
      });
    } else {
      var list = ui.el("ul", { class: "rt-list" });
      state.routines.forEach(function (routine) {
        list.appendChild(routineItem(routine));
      });
      body = list;
    }
    return revealWrap(
      ui.el("section", { class: "rt-section", "aria-label": "Lista de rutinas" }, [body]),
      60
    );
  }

  /**
   * Tarjeta de rutina con borde izquierdo del color de la
   * rutina, nombre (con emoji), descripción, duración con reloj, pills de
   * días (activos en índigo con glow) y pie Editar/Eliminar.
   */
  function routineItem(routine) {
    var days = ui.el("div", { class: "rt-days", role: "list", "aria-label": "Días de la semana" });
    domain.WEEKDAYS.forEach(function (weekday) {
      var on = routine.weekdays.indexOf(weekday) !== -1;
      days.appendChild(
        ui.el("span", {
          class: on ? "rt-day-pill rt-day-pill-on" : "rt-day-pill",
          role: "listitem",
          "aria-label": domain.WEEKDAY_LABELS[weekday] + (on ? ": programado" : ": no programado"),
          text: WEEKDAY_SHORT_LABELS[weekday],
        })
      );
    });

    var card = ui.el("div", { class: "card rt-card", style: { "border-left-color": routine.color } }, [
      ui.el("div", { class: "rt-card-head" }, [
        ui.el("span", {
          class: "rt-dot",
          style: { background: routine.color },
          "aria-hidden": "true",
        }),
        ui.el("h2", { class: "rt-name", text: routine.name }),
        ui.checkbox({
          id: "rt-active-" + routine.id,
          checked: routine.active,
          ariaLabel: (routine.active ? "Desactivar " : "Activar ") + routine.name,
          onChange: function (checked) {
            var result = setRoutineActive(routine.id, checked);
            ui.toast({ message: result.message, variant: result.ok ? "success" : "error" });
            // Re-render: si la activación quedó bloqueada, el checkbox vuelve
            // al estado persistido.
            rerender();
          },
        }),
      ]),
      routine.description
        ? ui.el("p", { class: "rt-description", text: routine.description })
        : null,
      ui.el("p", { class: "rt-meta" }, [
        ui.icon("clock", { size: 15 }),
        domain.formatDuration(routine.durationMinutes),
        routine.active ? null : ui.el("span", { class: "pill pill-muted", text: "Inactiva" }),
      ]),
      days,
      ui.el("div", { class: "rt-actions" }, [
        ui.el(
          "button",
          {
            type: "button",
            class: "btn btn-secondary btn-sm",
            onclick: function () {
              openEditForm(routine);
            },
          },
          [ui.icon("edit", { size: 15 }), "Editar"]
        ),
        ui.el(
          "button",
          {
            type: "button",
            class: "btn btn-danger btn-sm",
            onclick: function () {
              askDeleteRoutine(routine);
            },
          },
          [ui.icon("trash", { size: 15 }), "Eliminar"]
        ),
      ]),
    ]);
    return ui.el(
      "li",
      {
        class: removingId === routine.id ? "rt-item rt-item-removing" : "rt-item",
        "data-routine-id": routine.id,
      },
      [card]
    );
  }

  /**
   * Diálogo de confirmación propio (nunca `alert`/`confirm`)
   * con el nombre de la rutina y sus consecuencias; cancelar no borra nada.
   */
  function askDeleteRoutine(routine) {
    var body = ui.el("div", {}, [
      ui.el("p", {}, [
        "Vas a eliminar ",
        ui.el("strong", { text: routine.name }),
        ".",
      ]),
      ui.el("p", {
        text:
          "Se eliminarán también sus registros de cumplimiento y sus vínculos " +
          "con objetivos; las estadísticas se recalcularán.",
      }),
    ]);
    ui.confirmDialog({
      title: "Eliminar rutina",
      body: body,
      confirmLabel: "Eliminar",
      tone: "danger",
    }).then(function (confirmed) {
      if (!confirmed) return;
      fadeOutAndDelete(routine);
    });
  }

  /**
   * (animación de desvanecimiento): la tarjeta existente se desvanece
   * (220 ms) y solo entonces se borra el estado y la persistencia; con
   * `prefers-reduced-motion` el global de styles.css la reduce a 1 ms.
   */
  function fadeOutAndDelete(routine) {
    removingId = routine.id;
    var escaped =
      typeof CSS !== "undefined" && CSS.escape ? CSS.escape(routine.id) : routine.id;
    var item = document.querySelector('[data-routine-id="' + escaped + '"]');
    if (item) {
      item.classList.add("rt-item-removing");
    }
    window.setTimeout(function () {
      removingId = null;
      var result = deleteRoutine(routine.id);
      ui.toast({ message: result.message, variant: result.ok ? "success" : "error" });
      rerender();
    }, REMOVE_FADE_MS);
  }

  // ---- Formulario de rutina ----------------------

  function buildRoutineForm() {
    var s = formState;
    formRefs = {};

    var nameInput = ui.el("input", {
      id: "routine-name",
      name: "routine-name",
      type: "text",
      class: "rf-input",
      value: s.name,
      placeholder: "Ej: Correr, Leer, Meditar…",
    });
    var descriptionInput = ui.el("input", {
      id: "routine-description",
      name: "routine-description",
      type: "text",
      class: "rf-input",
      value: s.description,
      placeholder: "Detalles, motivación, etc.",
    });
    var hoursInput = ui.el("input", {
      id: "routine-hours",
      name: "routine-hours",
      type: "number",
      class: "rf-number",
      min: 0,
      max: 24,
      inputmode: "numeric",
      value: s.hours,
      "aria-label": "Horas",
    });
    var minutesInput = ui.el("input", {
      id: "routine-minutes",
      name: "routine-minutes",
      type: "number",
      class: "rf-number",
      min: 0,
      max: 59,
      inputmode: "numeric",
      value: s.minutes,
      "aria-label": "Minutos",
    });
    var durationRow = ui.el("div", { class: "rf-duration-row" }, [
      ui.el("span", { class: "rf-duration-part" }, [
        hoursInput,
        ui.el("span", { class: "rf-unit", "aria-hidden": "true", text: "h" }),
      ]),
      ui.el("span", { class: "rf-duration-part" }, [
        minutesInput,
        ui.el("span", { class: "rf-unit", "aria-hidden": "true", text: "m" }),
      ]),
    ]);
    var colorSwatch = ui.el("input", {
      type: "color",
      class: "color-swatch",
      value: HEX_COLOR_PATTERN.test(s.color) ? s.color.toLowerCase() : DEFAULT_ROUTINE_COLOR,
      "aria-label": "Selector de color",
      title: "Selector de color",
    });
    var colorText = ui.el("input", {
      id: "routine-color",
      name: "routine-color",
      type: "text",
      class: "color-text",
      value: s.color,
      spellcheck: false,
      placeholder: "#RRGGBB",
    });
    var colorRow = ui.el("div", { class: "color-row" }, [colorSwatch, colorText]);
    var freePanel = ui.el("div", {});
    var formErrorNode = ui.el("p", {
      class: "rf-form-error",
      role: "alert",
      text: s.formError || "",
      hidden: s.formError ? false : true,
    });

    formRefs.name = nameInput;
    formRefs.description = descriptionInput;
    formRefs.hours = hoursInput;
    formRefs.minutes = minutesInput;
    formRefs.durationRow = durationRow;
    formRefs.color = colorText;
    formRefs.colorSwatch = colorSwatch;
    formRefs.freePanel = freePanel;
    formRefs.formError = formErrorNode;

    bindFormInput(nameInput, "name");
    bindFormInput(descriptionInput, "description");
    bindFormInput(hoursInput, "hours");
    bindFormInput(minutesInput, "minutes");
    bindFormInput(colorText, "color");
    colorSwatch.addEventListener("change", function () {
      // El picker siempre emite un hex válido; se refleja en la entrada manual.
      formState.color = colorSwatch.value.toUpperCase();
      colorText.value = formState.color;
      refreshFormErrors();
    });

    var form = ui.el(
      "form",
      {
        class: "rf-form",
        novalidate: "true",
        onsubmit: function (event) {
          event.preventDefault();
          submitRoutineForm();
        },
      },
      [
        ui.el("div", { class: "rf-group" }, [
          ui.el("p", { class: "rf-group-title", text: "Identidad" }),
          ui.field({ label: "Nombre", control: nameInput, error: s.errors.name, required: true }),
          ui.field({ label: "Descripción (opcional)", control: descriptionInput }),
          ui.field({ label: "Color", control: colorRow, error: s.errors.color, required: true }),
        ]),
        ui.el("div", { class: "rf-group" }, [
          ui.el("p", { class: "rf-group-title", text: "Horario" }),
          ui.field({
            label: "Duración",
            control: durationRow,
            error: s.errors.duration,
            hint: "Entre 1 minuto y 24 h.",
            required: true,
          }),
          buildWeekdayPicker(),
          freePanel,
        ]),
        ui.el("div", { class: "rf-group" }, [
          ui.el("p", { class: "rf-group-title", text: "Estado" }),
          ui.el("div", {}, [
            ui.checkbox({
              id: "routine-active",
              name: "routine-active",
              label: "Rutina activa",
              checked: s.active,
              onChange: function (checked) {
                formState.active = checked;
                refreshFreePanel();
              },
            }),
            ui.el("p", {
              class: "rf-hint",
              text:
                "Al guardar, una rutina activa valida el límite de 24 h por día; " +
                "desactivar siempre está permitido (solo afecta a días futuros).",
            }),
          ]),
        ]),
        formErrorNode,
        ui.el("div", { class: "rf-actions" }, [
          ui.el("button", { type: "submit", class: "btn btn-primary" }, [
            ui.icon("save", { size: 17 }),
            "Guardar",
          ]),
          ui.el("button", {
            type: "button",
            class: "btn btn-ghost",
            text: "Cancelar",
            onclick: function () {
              closeForm();
              rerender();
            },
          }),
        ]),
      ]
    );
    freePanel.appendChild(buildFreeTimePanel());
    return form;
  }

  /** Días de la semana con atajos "Marcar todos/Desmarcar todos" y
   * tiempo libre por día junto a cada día. */
  function buildWeekdayPicker() {
    var errorNode = ui.el("p", {
      class: "wd-error",
      role: "alert",
      text: formState.errors.weekdays || "",
      hidden: formState.errors.weekdays ? false : true,
    });
    formRefs.weekdaysError = errorNode;

    var freeByWeekday = {};
    freeTimeDays().forEach(function (day) {
      freeByWeekday[day.weekday] = day;
    });

    var grid = ui.el("div", { class: "wd-grid", role: "group", "aria-labelledby": "wd-legend" });
    domain.WEEKDAYS.forEach(function (weekday) {
      var selected = formState.weekdays.indexOf(weekday) !== -1;
      var dayWrap = ui.el("span", {
        class: selected ? "wd-day wd-day-selected" : "wd-day",
      });
      var box = ui.checkbox({
        id: "weekday-" + weekday,
        name: "weekday-" + weekday,
        label: WEEKDAY_SHORT_LABELS[weekday],
        checked: selected,
        onChange: function (checked) {
          if (checked) {
            formState.weekdays = formState.weekdays
              .concat([weekday])
              .sort(function (a, b) {
                return a - b;
              });
          } else {
            formState.weekdays = formState.weekdays.filter(function (item) {
              return item !== weekday;
            });
          }
          dayWrap.classList.toggle("wd-day-selected", checked);
          refreshFormErrors();
          refreshFreePanel();
        },
      });
      var free = freeByWeekday[weekday];
      if (free) {
        box.appendChild(
          ui.el("span", {
            class: "wd-day-free",
            text: domain.formatDuration(free.actualFreeMinutes) + " libres",
          })
        );
      }
      dayWrap.appendChild(box);
      grid.appendChild(dayWrap);
    });

    var shortcuts = ui.el("div", { class: "wd-shortcuts" }, [
      ui.el("button", {
        type: "button",
        class: "btn btn-secondary btn-sm",
        text: "Marcar todos",
        onclick: function () {
          formState.weekdays = domain.WEEKDAYS.slice();
          refreshFreePanel();
          rerender();
        },
      }),
      ui.el("button", {
        type: "button",
        class: "btn btn-ghost btn-sm",
        text: "Desmarcar todos",
        onclick: function () {
          formState.weekdays = [];
          refreshFreePanel();
          rerender();
        },
      }),
    ]);

    return ui.el("div", { class: "wd-group" }, [
      ui.el("span", { class: "wd-legend", id: "wd-legend", text: "Días de la semana *" }),
      shortcuts,
      grid,
      errorNode,
    ]);
  }

  function bindFormInput(control, key) {
    control.addEventListener("input", function () {
      formState[key] = control.value;
      if (key === "color" && HEX_COLOR_PATTERN.test(control.value)) {
        formRefs.colorSwatch.value = control.value.toLowerCase();
      }
      if (key === "hours" || key === "minutes") {
        refreshFreePanel();
      }
      refreshFormErrors();
    });
  }

  /** Revalida y repinta todos los campos tras el primer intento fallido (errores en vivo). */
  function refreshFormErrors() {
    if (formState === null || !formState.showErrors) return;
    var errors = validateRoutineForm();
    formState.errors = errors;
    ui.setFieldError(formRefs.name, errors.name || null);
    ui.setFieldError(formRefs.color, errors.color || null);
    ui.setFieldError(formRefs.durationRow, errors.duration || null);
    formRefs.weekdaysError.textContent = errors.weekdays || "";
    formRefs.weekdaysError.hidden = !errors.weekdays;
  }

  function refreshFreePanel() {
    if (formRefs === null || formRefs.freePanel === null) return;
    formRefs.freePanel.replaceChildren(buildFreeTimePanel());
  }

  /** Validaciones por campo del formulario. */
  function validateRoutineForm() {
    var s = formState;
    var errors = {};
    var nameResult = domain.validateRoutineName(s.name);
    if (!nameResult.ok) {
      errors.name = nameResult.message;
    }
    if (!HEX_COLOR_PATTERN.test(s.color)) {
      errors.color = "Introduce un color en formato #RRGGBB.";
    }
    var hoursNumber = Number(s.hours);
    var minutesNumber = Number(s.minutes);
    var durationResult = domain.validateDuration(
      Number.isFinite(hoursNumber) ? hoursNumber : NaN,
      Number.isFinite(minutesNumber) ? minutesNumber : NaN
    );
    if (!durationResult.ok) {
      errors.duration = durationResult.message;
    }
    var weekdaysResult = domain.validateWeekdays(s.weekdays);
    if (!weekdaysResult.ok) {
      errors.weekdays = weekdaysResult.message;
    }
    return errors;
  }

  /**
   * Tiempos libres de los 7 días con la propuesta del formulario
   * en vivo (en edición ya se descuenta la duración anterior).
   * @returns {Array} resultado de `domain.freeTimeByWeekday`.
   */
  function freeTimeDays() {
    var s = formState;
    var previous = editing.mode === "edit" ? findRoutine(editing.routineId) : null;
    var hoursNumber = Number(s.hours);
    var minutesNumber = Number(s.minutes);
    var durationResult = domain.validateDuration(
      Number.isFinite(hoursNumber) ? hoursNumber : NaN,
      Number.isFinite(minutesNumber) ? minutesNumber : NaN
    );
    var candidate = {
      id: s.candidateId,
      name: s.name.trim() || "Sin nombre",
      description: s.description,
      color: s.color,
      durationMinutes: durationResult.ok ? durationResult.value : 0,
      weekdays: s.weekdays,
      active: s.active,
      createdAt: previous ? previous.createdAt : new Date(0).toISOString(),
    };
    return domain.freeTimeByWeekday(
      state.routines,
      candidate,
      previous ? previous.durationMinutes : 0
    );
  }

  /**
   * (panel de tiempo libre): los 7 días con el tiempo actual y el que
   * quedaría con la propuesta en vivo; en rojo los días que excederían las
   * 24 h. Formato de tabla limpia con cifras tabulares y delta
   * alineada a la derecha.
   */
  function buildFreeTimePanel() {
    var s = formState;
    var days = freeTimeDays();

    var list = ui.el("ul", { class: "ft-list", "aria-labelledby": "ft-title" });
    list.appendChild(
      ui.el("li", { class: "ft-row ft-row-head", "aria-hidden": "true" }, [
        ui.el("span", { class: "ft-day", text: "Día" }),
        ui.el("span", { class: "ft-cell", text: "Actual" }),
        ui.el("span", { class: "ft-cell", text: "Propuesto" }),
        ui.el("span", { class: "ft-delta", text: "Δ" }),
      ])
    );
    days.forEach(function (day) {
      var exceeds = day.proposedFreeMinutes < 0;
      var isSelected = s.weekdays.indexOf(day.weekday) !== -1;
      var deltaMinutes = day.proposedFreeMinutes - day.actualFreeMinutes;
      list.appendChild(
        ui.el(
          "li",
          {
            class:
              "ft-row" +
              (isSelected ? " ft-row-selected" : "") +
              (exceeds ? " ft-row-exceeds" : ""),
          },
          [
            ui.el("span", { class: "ft-day" }, [
              ui.el("span", {
                class: "ft-day-full",
                text: domain.WEEKDAY_LABELS[day.weekday],
              }),
              ui.el("span", {
                class: "ft-day-short",
                text: WEEKDAY_SHORT_LABELS[day.weekday],
              }),
            ]),
            ui.el("span", {
              class: "ft-cell",
              text: domain.formatDuration(day.actualFreeMinutes),
            }),
            exceeds
              ? ui.el("strong", {
                  class: "ft-exceeds",
                  title: "Excede las 24 h del día",
                  text: "excede",
                })
              : ui.el("strong", {
                  class: "ft-proposed",
                  text: domain.formatDuration(day.proposedFreeMinutes),
                }),
            ui.el("span", {
              class: exceeds ? "ft-delta ft-delta-exceeds" : "ft-delta",
              text:
                exceeds
                  ? "+" + formatDeltaDuration(-day.proposedFreeMinutes)
                  : deltaMinutes === 0
                    ? "—"
                    : "−" + formatDeltaDuration(-deltaMinutes),
            }),
          ]
        )
      );
    });

    return ui.el("div", { class: "ft-panel" }, [
      ui.el("p", {
        class: "ft-title",
        id: "ft-title",
        text: "Tiempo libre por día",
      }),
      ui.el("p", {
        class: "ft-hint",
        text: "Actual → con la propuesta. En rojo, los días que excederían 24 h.",
      }),
      list,
    ]);
  }

  /** Duración compacta para deltas: "30m" por debajo de 1 h, "2h 30m" si no. */
  function formatDeltaDuration(minutes) {
    return minutes < 60 ? minutes + "m" : domain.formatDuration(minutes);
  }

  /** Envía el formulario: valida junto al campo; los fallos se muestran en línea. */
  function submitRoutineForm() {
    var errors = validateRoutineForm();
    formState.errors = errors;
    formState.showErrors = true;
    if (Object.keys(errors).length > 0) {
      refreshFormErrors();
      return;
    }

    var durationResult = domain.validateDuration(
      Number(formState.hours),
      Number(formState.minutes)
    );
    var input = {
      name: formState.name.trim(),
      description: formState.description.trim(),
      color: formState.color.toUpperCase(),
      durationMinutes: durationResult.value,
      weekdays: formState.weekdays,
      active: formState.active,
    };
    var result =
      editing.mode === "edit"
        ? updateRoutine(editing.routineId, input)
        : createRoutine(input);

    if (result.ok) {
      ui.toast({ message: result.message, variant: "success" });
      closeForm();
      rerender();
      return;
    }
    // (días excedidos nombrados) o fallo de escritura: aviso junto a la
    // acción; el estado en memoria no cambió.
    formState.formError = result.message;
    formRefs.formError.textContent = result.message;
    formRefs.formError.hidden = false;
  }

  // ---- Casos de uso de rutinas -------------

  /** Validaciones en runtime antes de persistir. */
  function validateRoutineAgainst(routines, routine) {
    var nameResult = domain.validateRoutineName(routine.name);
    if (!nameResult.ok) {
      return { ok: false, message: nameResult.message };
    }
    var colorResult = domain.validateHexColor(routine.color);
    if (!colorResult.ok) {
      return { ok: false, message: colorResult.message };
    }
    var hours = Math.floor(routine.durationMinutes / 60);
    var minutes = routine.durationMinutes % 60;
    var durationResult = domain.validateDuration(hours, minutes);
    if (!durationResult.ok) {
      return { ok: false, message: durationResult.message };
    }
    var weekdaysResult = domain.validateWeekdays(routine.weekdays);
    if (!weekdaysResult.ok) {
      return { ok: false, message: weekdaysResult.message };
    }
    // también al editar/activar; una rutina inactiva no ocupa días.
    var exceeded = domain.checkDailyLimit(routines, routine);
    if (exceeded.length > 0) {
      return { ok: false, message: "No se puede guardar: " + describeExceededDays(exceeded) + "." };
    }
    return { ok: true, message: "" };
  }

  /** Días excedidos con su exceso: "lunes (+1h 30m)". */
  function describeExceededDays(exceeded) {
    return exceeded
      .map(function (day) {
        return (
          domain.WEEKDAY_LABELS[day.weekday] +
          " (+" +
          domain.formatDuration(day.excessMinutes) +
          ")"
        );
      })
      .join(", ");
  }

  /** Escribe la colección de rutinas al instante; el estado solo cambia si la escritura es correcta. */
  function persistRoutines(nextRoutines) {
    var saved = storage.saveCollection("routines", nextRoutines);
    if (!saved.ok) {
      return {
        ok: false,
        message: "No se pudo guardar: " + saved.error.message,
        error: saved.error,
      };
    }
    state.routines = nextRoutines;
    return { ok: true, message: "" };
  }

  function createRoutine(input) {
    var routine = {
      id: newId(),
      createdAt: new Date().toISOString(),
      name: input.name,
      description: input.description,
      color: input.color,
      durationMinutes: input.durationMinutes,
      weekdays: input.weekdays,
      active: input.active,
    };
    var validation = validateRoutineAgainst(state.routines, routine);
    if (!validation.ok) {
      return validation;
    }
    var result = persistRoutines(state.routines.concat([routine]));
    if (!result.ok) {
      return result;
    }
    return { ok: true, message: "Rutina «" + routine.name + "» creada." };
  }

  function updateRoutine(id, input) {
    var previous = findRoutine(id);
    if (!previous) {
      return { ok: false, message: "La rutina ya no existe." };
    }
    var routine = {
      id: previous.id,
      createdAt: previous.createdAt,
      name: input.name,
      description: input.description,
      color: input.color,
      durationMinutes: input.durationMinutes,
      weekdays: input.weekdays,
      active: input.active,
    };
    var validation = validateRoutineAgainst(state.routines, routine);
    if (!validation.ok) {
      return validation;
    }
    var nextRoutines = state.routines.map(function (item) {
      return item.id === id ? routine : item;
    });
    var result = persistRoutines(nextRoutines);
    if (!result.ok) {
      return result;
    }
    return { ok: true, message: "Rutina «" + routine.name + "» actualizada." };
  }

  /**
   * Desactivar siempre permitido (solo afecta a días futuros);
   * activar exige pasar (24 h) y, si no, se mantiene inactiva.
   */
  function setRoutineActive(id, active) {
    var previous = findRoutine(id);
    if (!previous) {
      return { ok: false, message: "La rutina ya no existe." };
    }
    if (previous.active === active) {
      return {
        ok: true,
        message: active ? "La rutina ya estaba activa." : "La rutina ya estaba desactivada.",
      };
    }
    var routine = Object.assign({}, previous, { active: active });
    if (active) {
      // Solo la activación valida el límite; desactivar nunca se bloquea.
      var exceeded = domain.checkDailyLimit(state.routines, routine);
      if (exceeded.length > 0) {
        return {
          ok: false,
          message:
            "No se puede activar «" + routine.name + "»: " + describeExceededDays(exceeded) + ".",
        };
      }
    }
    var nextRoutines = state.routines.map(function (item) {
      return item.id === id ? routine : item;
    });
    var result = persistRoutines(nextRoutines);
    if (!result.ok) {
      return result;
    }
    return { ok: true, message: "«" + routine.name + "» " + (active ? "activada." : "desactivada.") };
  }

  /**
   * Elimina la rutina con sus registros y desvincula sus
   * objetivos (el progreso ya acumulado no se recalcula). Escrituras
   * encadenadas con reversión best-effort.
   */
  function deleteRoutine(id) {
    var routine = findRoutine(id);
    if (!routine) {
      return { ok: false, message: "La rutina ya no existe." };
    }
    var nextRoutines = state.routines.filter(function (item) {
      return item.id !== id;
    });
    var nextEntries = state.entries.filter(function (entry) {
      return entry.routineId !== id;
    });
    var nextGoals = state.goals.map(function (goal) {
      return goal.linkedRoutineIds.indexOf(id) === -1
        ? goal
        : Object.assign({}, goal, {
            linkedRoutineIds: goal.linkedRoutineIds.filter(function (routineId) {
              return routineId !== id;
            }),
          });
    });

    var savedRoutines = storage.saveCollection("routines", nextRoutines);
    if (!savedRoutines.ok) {
      notifyWriteError(savedRoutines);
      return { ok: false, message: "No se pudo eliminar: " + savedRoutines.error.message };
    }
    var savedEntries = storage.saveCollection("completions", nextEntries);
    if (!savedEntries.ok) {
      storage.saveCollection("routines", state.routines);
      notifyWriteError(savedEntries);
      return { ok: false, message: "No se pudo eliminar: " + savedEntries.error.message };
    }
    var savedGoals = storage.saveCollection("goals", nextGoals);
    if (!savedGoals.ok) {
      storage.saveCollection("completions", state.entries);
      storage.saveCollection("routines", state.routines);
      notifyWriteError(savedGoals);
      return { ok: false, message: "No se pudo eliminar: " + savedGoals.error.message };
    }
    state.routines = nextRoutines;
    state.entries = nextEntries;
    state.goals = nextGoals;
    return { ok: true, message: "Rutina «" + routine.name + "» eliminada con sus registros." };
  }

  // ---- Arranque ------------------------------------------------------------

  function init() {
    reloadState();
    applyTheme(state.theme);
    notifyStartupIssues();
    bindNavbar();
    render();

    // Footer con el año actual.
    var footerYear = document.getElementById("footer-year");
    if (footerYear) footerYear.textContent = String(new Date().getFullYear());

    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("focus", onVisibleOrFocus);
    document.addEventListener("visibilitychange", onVisibleOrFocus);
    storage.startListening(onStorageChange);
  }

  // API pública (orquestación y verificación manual en consola).
  MiRutina.app = {
    init: init,
    render: render,
    rerender: rerender,
    toggleRoutine: toggleRoutine,
    setAll: setAll,
    saveNote: saveNote,
    NOTE_MAX_LENGTH: NOTE_MAX_LENGTH,
    toggleTheme: toggleTheme,
    checkMidnight: checkMidnight,
    openSettings: openSettings,
    getState: function () {
      return state;
    },
  };

  init();
})(window.MiRutina);
