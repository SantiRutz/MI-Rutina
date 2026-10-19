/**
 * MiRutina Vanilla — storage.js
 * localStorage con claves mirutina.*, schemaVersion, export/import y
 * errores tipados. Sin DOM, sin cálculos de negocio.
 * Cubre persistencia, JSON corrupto, bloqueo de esquema, export/import,
 * escudos de racha, modo foco, idioma y recordatorio de backup (claves
 * aditivas, opcionales en backups antiguos), escucha del evento storage entre
 * pestañas y revert con aviso tipado. Los mensajes visibles se traducen con
 * MiRutina.i18n (se construyen al usarse, nunca al cargar el módulo).
 */
(function () {
  "use strict";

  window.MiRutina = window.MiRutina || {};

  const i18n = window.MiRutina.i18n;

  function t(key, params) {
    return i18n.t(key, params);
  }

  const SCHEMA_VERSION = 1;

  // Claves namespaciadas.
  const KEYS = {
    routines: "mirutina.routines",
    completions: "mirutina.completions",
    goals: "mirutina.goals",
    shields: "mirutina.shields",
    focus: "mirutina.focus",
    backupPrefs: "mirutina.backupPrefs",
    lastExport: "mirutina.lastExport",
    theme: "mirutina.theme",
    lang: "mirutina.lang",
    schemaVersion: "mirutina.schemaVersion",
  };

  const KEY_PREFIX = "mirutina.";
  const COLLECTION_NAMES = ["routines", "completions", "goals", "shields"];
  // Colecciones que pueden faltar en un backup antiguo: se completan con [].
  const OPTIONAL_COLLECTIONS = ["shields"];
  const ALL_KEYS = [
    KEYS.routines,
    KEYS.completions,
    KEYS.goals,
    KEYS.shields,
    KEYS.focus,
    KEYS.backupPrefs,
    KEYS.lastExport,
    KEYS.theme,
    KEYS.lang,
    KEYS.schemaVersion,
  ];

  const THEMES = ["dark", "light"];
  const DEFAULT_THEME = "dark";
  // Idiomas soportados (idioma por defecto: español, sin autodetección).
  const LANGS = ["es", "en"];
  const DEFAULT_LANG = "es";
  // Frecuencia del recordatorio de backup en días (0 = nunca).
  const BACKUP_REMINDER_DAYS = [0, 7, 14, 30];
  const DEFAULT_BACKUP_REMINDER_DAYS = 14;

  /**
   * Registro de migraciones: `{ deVersión: (colecciones) => colecciones }`.
   * Vacío hoy (la distribución nace en v1). Las claves añadidas después
   * (escudos, modo foco) son aditivas y opcionales: un backup antiguo sin
   * ellas se importa con valores por defecto, así que no exigen nueva versión.
   */
  const MIGRATIONS = {};

  const ERROR_CODES = {
    unavailable: "unavailable", // localStorage no accesible
    quota: "quota", // cuota excedida
    locked: "locked", // schemaVersion futura/desconocida
    corrupted: "corrupted", // JSON corrupto en una clave
    invalid: "invalid", // dato o backup con estructura inválida
    version: "version", // versión de esquema del backup no reconocida
  };

  /**
   * Mensajes del bloqueo, de la falta de localStorage y de la cuota.
   * Son funciones: el idioma puede cambiar en caliente, así que el texto se
   * resuelve en cada uso y no al cargar el módulo.
   */
  function lockedMessage() {
    return t("storage.locked");
  }

  function unavailableMessage() {
    return t("storage.unavailable");
  }

  function quotaMessage() {
    return t("storage.quota");
  }

  // Estado interno derivado del último arranque/escritura.
  let locked = false;
  let corruptedCollections = [];

  // ---- Errores tipados -----------------------------------------------------

  /** Error con código estable para que la app decida revertir y avisar. */
  function storageError(code, message) {
    const error = new Error(message);
    error.name = "StorageError";
    error.code = code;
    return error;
  }

  function fail(code, message) {
    return { ok: false, error: storageError(code, message) };
  }

  function ok(value) {
    return { ok: true, value: value };
  }

  /** Clasifica una excepción de escritura: cuota vs. no disponible. */
  function classifyWriteError(exception) {
    const name = exception && exception.name;
    const isQuota =
      name === "QuotaExceededError" ||
      name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      (typeof DOMException !== "undefined" &&
        exception instanceof DOMException &&
        exception.code === 22);
    if (isQuota) {
      return storageError(ERROR_CODES.quota, quotaMessage());
    }
    return storageError(ERROR_CODES.unavailable, unavailableMessage());
  }

  // ---- Acceso crudo a localStorage -----------------------------------------

  /** ¿Es accesible `localStorage` en lectura? (la escritura puede fallar igual por cuota). */
  function isAvailable() {
    try {
      void window.localStorage.length;
      return true;
    } catch (e) {
      return false;
    }
  }

  function readRaw(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null; // sin acceso: se trata como ausente
    }
  }

  /** Escritura síncrona (al instante) con error tipado ante fallo. */
  function writeRaw(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: classifyWriteError(e) };
    }
  }

  function removeRaw(key) {
    try {
      window.localStorage.removeItem(key);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: classifyWriteError(e) };
    }
  }

  function parseJson(raw) {
    try {
      return ok(JSON.parse(raw));
    } catch (e) {
      return fail(ERROR_CODES.corrupted, t("storage.corruptedJson"));
    }
  }

  function stringifyValue(value) {
    try {
      return ok(JSON.stringify(value));
    } catch (e) {
      return fail(ERROR_CODES.invalid, t("storage.serializeFailed"));
    }
  }

  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  // ---- Colecciones ---------------------------------------------------------

  function collectionKey(name) {
    return COLLECTION_NAMES.indexOf(name) !== -1 ? KEYS[name] : null;
  }

  /** Lee una colección; JSON corrupto o forma irreconocible → error `corrupted` sin tocar las demás. */
  function loadCollection(name) {
    const key = collectionKey(name);
    if (key === null) {
      return fail(ERROR_CODES.invalid, t("storage.unknownCollection", { name: name }));
    }
    if (locked) {
      return fail(ERROR_CODES.locked, lockedMessage());
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, unavailableMessage());
    }
    const raw = readRaw(key);
    if (raw === null) {
      return ok([]);
    }
    const parsed = parseJson(raw);
    if (!parsed.ok) {
      return parsed;
    }
    if (!Array.isArray(parsed.value)) {
      return fail(ERROR_CODES.corrupted, t("storage.notAList"));
    }
    return parsed;
  }

  /** Serializa y escribe una colección completa (escritura al instante). */
  function saveCollection(name, items) {
    const key = collectionKey(name);
    if (key === null) {
      return fail(ERROR_CODES.invalid, t("storage.unknownCollection", { name: name }));
    }
    if (!Array.isArray(items)) {
      return fail(ERROR_CODES.invalid, t("storage.collectionNotList", { name: name }));
    }
    if (locked) {
      return fail(ERROR_CODES.locked, lockedMessage());
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, unavailableMessage());
    }
    const serialized = stringifyValue(items);
    if (!serialized.ok) {
      return serialized;
    }
    return writeRaw(key, serialized.value);
  }

  /**
   * Patrón de persistencia con revert implícito: `mutate`
   * recibe el valor actual y devuelve el nuevo; el estado en memoria solo
   * cambia (`holder.value = nuevo`) si la escritura tiene éxito. Si falla,
   * `holder` queda intacto y el error tipado permite el aviso junto a la acción.
   */
  function withPersist(name, holder, mutate) {
    if (!isPlainObject(holder) || !Array.isArray(holder.value)) {
      return fail(ERROR_CODES.invalid, t("storage.holderRequired"));
    }
    if (typeof mutate !== "function") {
      return fail(ERROR_CODES.invalid, t("storage.mutateRequired"));
    }
    if (locked) {
      return fail(ERROR_CODES.locked, lockedMessage());
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, unavailableMessage());
    }
    const next = mutate(holder.value);
    if (!Array.isArray(next)) {
      return fail(ERROR_CODES.invalid, t("storage.mutateNotList"));
    }
    const saved = saveCollection(name, next);
    if (!saved.ok) {
      return saved; // holder intacto: la app pinta el aviso y sigue
    }
    holder.value = next;
    return ok(next);
  }

  // ---- Tema -------------------------------------------------

  /** Tema validado (`dark`/`light`); valor ausente o inválido → oscuro por defecto. */
  function loadTheme() {
    const raw = readRaw(KEYS.theme);
    return THEMES.indexOf(raw) !== -1 ? raw : DEFAULT_THEME;
  }

  function saveTheme(theme) {
    if (THEMES.indexOf(theme) === -1) {
      return fail(ERROR_CODES.invalid, t("storage.themeInvalid"));
    }
    if (locked) {
      return fail(ERROR_CODES.locked, lockedMessage());
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, unavailableMessage());
    }
    // Sin JSON: el script inline del <head> compara el valor crudo.
    return writeRaw(KEYS.theme, theme);
  }

  // ---- Idioma --------------------------------------------------------------

  /** Idioma validado (`es`/`en`); ausente o inválido → español por defecto. */
  function loadLang() {
    const raw = readRaw(KEYS.lang);
    return LANGS.indexOf(raw) !== -1 ? raw : DEFAULT_LANG;
  }

  function saveLang(lang) {
    if (LANGS.indexOf(lang) === -1) {
      return fail(ERROR_CODES.invalid, t("storage.langInvalid"));
    }
    if (locked) {
      return fail(ERROR_CODES.locked, lockedMessage());
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, unavailableMessage());
    }
    // Sin JSON: el script inline del <head> compara el valor crudo.
    return writeRaw(KEYS.lang, lang);
  }

  // ---- Modo foco (selección del día) ---------------------------------

  /** Forma esperada: `{ date: "YYYY-MM-DD", routineIds: string[] }`; otra cosa → null. */
  function normalizeFocus(value) {
    if (!isPlainObject(value)) {
      return null;
    }
    if (typeof value.date !== "string" || !Array.isArray(value.routineIds)) {
      return null;
    }
    const ids = value.routineIds.filter(function (id) {
      return typeof id === "string";
    });
    return { date: value.date, routineIds: ids };
  }

  /** Foco guardado del dispositivo; ausente o ilegible → null (sin foco). */
  function loadFocus() {
    const raw = readRaw(KEYS.focus);
    if (raw === null) {
      return null;
    }
    const parsed = parseJson(raw);
    return parsed.ok ? normalizeFocus(parsed.value) : null;
  }

  /** Guarda el foco del día (null lo borra); mismo contrato de error que las colecciones. */
  function saveFocus(focus) {
    if (locked) {
      return fail(ERROR_CODES.locked, lockedMessage());
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, unavailableMessage());
    }
    if (focus === null) {
      return removeRaw(KEYS.focus);
    }
    const normalized = normalizeFocus(focus);
    if (normalized === null) {
      return fail(ERROR_CODES.invalid, t("storage.focusInvalid"));
    }
    const serialized = stringifyValue(normalized);
    if (!serialized.ok) {
      return serialized;
    }
    return writeRaw(KEYS.focus, serialized.value);
  }

  // ---- Recordatorio de backup ----------------------------------------------

  /** Preferencias normalizadas del recordatorio; inválidas → valores por defecto. */
  function normalizeBackupPrefs(value) {
    if (!isPlainObject(value)) {
      return null;
    }
    const days = value.reminderDays;
    return {
      reminderDays:
        BACKUP_REMINDER_DAYS.indexOf(days) !== -1 ? days : DEFAULT_BACKUP_REMINDER_DAYS,
      dismissedAt: typeof value.dismissedAt === "string" ? value.dismissedAt : null,
    };
  }

  /** Preferencias guardadas; ausentes o ilegibles → 14 días sin descarte. */
  function loadBackupPrefs() {
    const raw = readRaw(KEYS.backupPrefs);
    if (raw === null) {
      return { reminderDays: DEFAULT_BACKUP_REMINDER_DAYS, dismissedAt: null };
    }
    const parsed = parseJson(raw);
    if (!parsed.ok) {
      return { reminderDays: DEFAULT_BACKUP_REMINDER_DAYS, dismissedAt: null };
    }
    return (
      normalizeBackupPrefs(parsed.value) || {
        reminderDays: DEFAULT_BACKUP_REMINDER_DAYS,
        dismissedAt: null,
      }
    );
  }

  /** Guarda las preferencias del recordatorio (mismo contrato de error que el resto). */
  function saveBackupPrefs(prefs) {
    if (locked) {
      return fail(ERROR_CODES.locked, lockedMessage());
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, unavailableMessage());
    }
    const normalized = normalizeBackupPrefs(prefs);
    if (normalized === null || BACKUP_REMINDER_DAYS.indexOf(prefs.reminderDays) === -1) {
      return fail(
        ERROR_CODES.invalid,
        t("storage.reminderInvalid", { days: BACKUP_REMINDER_DAYS.join(", ") })
      );
    }
    const serialized = stringifyValue(normalized);
    if (!serialized.ok) {
      return serialized;
    }
    const written = writeRaw(KEYS.backupPrefs, serialized.value);
    return written.ok ? ok(normalized) : written;
  }

  /** Instante ISO del último backup exportado; ausente o inválido → null. */
  function loadLastExport() {
    const raw = readRaw(KEYS.lastExport);
    if (raw === null || Number.isNaN(new Date(raw).getTime())) {
      return null;
    }
    return raw;
  }

  /** Anota el instante ISO de un backup exportado (valor crudo, sin JSON). */
  function saveLastExport(iso) {
    if (locked) {
      return fail(ERROR_CODES.locked, lockedMessage());
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, unavailableMessage());
    }
    if (typeof iso !== "string" || Number.isNaN(new Date(iso).getTime())) {
      return fail(ERROR_CODES.invalid, t("storage.lastExportInvalid"));
    }
    const written = writeRaw(KEYS.lastExport, iso);
    return written.ok ? ok(iso) : written;
  }

  // ---- schemaVersion, bloqueo y migración -------------------

  /**
   * Lee `mirutina.schemaVersion` sin interpretar colecciones:
   * `fresh` (ausente → primera instalación), `current`, `old` (migrable),
   * `future` (> soportada → bloqueo) o `unknown` (no entedida → bloqueo).
   */
  function readStoredVersion() {
    const raw = readRaw(KEYS.schemaVersion);
    if (raw === null) {
      return { state: "fresh", version: SCHEMA_VERSION };
    }
    const parsed = parseJson(raw);
    if (!parsed.ok) {
      return { state: "unknown", version: null };
    }
    const version = parsed.value;
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
      return { state: "unknown", version: version };
    }
    if (version > SCHEMA_VERSION) {
      return { state: "future", version: version };
    }
    if (version < SCHEMA_VERSION) {
      return { state: "old", version: version };
    }
    return { state: "current", version: version };
  }

  /** Aplica la cadena de migraciones; sin camino conocido → `null` (no se borra nada). */
  function migrateCollections(collections, version) {
    let current = version;
    let migrated = collections;
    while (current < SCHEMA_VERSION) {
      const step = MIGRATIONS[current];
      if (typeof step !== "function") {
        return null;
      }
      migrated = step(migrated);
      current += 1;
    }
    return migrated;
  }

  function emptyState(status, schemaVersion) {
    return {
      status: status,
      schemaVersion: schemaVersion,
      routines: [],
      completions: [],
      goals: [],
      shields: [],
      focus: null,
      theme: DEFAULT_THEME,
      lang: DEFAULT_LANG,
      corrupted: [],
    };
  }

  function readCollectionsState() {
    const state = {};
    corruptedCollections = [];
    COLLECTION_NAMES.forEach(function (name) {
      const result = loadCollection(name);
      if (result.ok) {
        state[name] = result.value;
      } else {
        state[name] = []; // arranque vacío de esa colección; las demás intactas
        corruptedCollections.push(name);
      }
    });
    state.theme = loadTheme();
    state.lang = loadLang();
    state.focus = loadFocus();
    return state;
  }

  /**
   * Arranque: lee schemaVersion antes que las colecciones;
   * cada colección se parsea por separado. Con versión futura o desconocida →
   * modo bloqueo: ni lectura interpretada ni escritura, nunca se borra nada;
   * las salidas (export crudo / vaciar con doble confirmación) las ofrece la app.
   */
  function loadState() {
    if (!isAvailable()) {
      locked = false;
      corruptedCollections = [];
      return emptyState("unavailable", null);
    }
    const stored = readStoredVersion();
    if (stored.state === "future" || stored.state === "unknown") {
      locked = true;
      corruptedCollections = [];
      return emptyState("locked", stored.version);
    }
    locked = false;
    const state = readCollectionsState();
    if (stored.state === "old") {
      const migrated = migrateCollections(
        { routines: state.routines, completions: state.completions, goals: state.goals },
        stored.version
      );
      if (migrated === null) {
        locked = true; // sin camino de migración: bloqueo, datos intactos
        return emptyState("locked", stored.version);
      }
      state.routines = migrated.routines;
      state.completions = migrated.completions;
      state.goals = migrated.goals;
      // Reescritura con la versión nueva (mejor esfuerzo; un fallo posterior
      // de escritura queda cubierto por el patrón withPersist en cada acción).
      saveCollection("routines", state.routines);
      saveCollection("completions", state.completions);
      saveCollection("goals", state.goals);
    }
    if (stored.state === "fresh" || stored.state === "old") {
      writeRaw(KEYS.schemaVersion, JSON.stringify(SCHEMA_VERSION));
    }
    return {
      status: "ok",
      schemaVersion: SCHEMA_VERSION,
      routines: state.routines,
      completions: state.completions,
      goals: state.goals,
      shields: state.shields,
      focus: state.focus,
      theme: state.theme,
      lang: state.lang,
      corrupted: corruptedCollections.slice(),
    };
  }

  function isLocked() {
    return locked;
  }

  /** Colecciones detectadas como dañadas en el último arranque/exportación. */
  function getCorruptedCollections() {
    return corruptedCollections.slice();
  }

  // ---- Export / import -------------------------------

  /** Nombre del fichero de backup: `mirutina-backup-YYYY-MM-DD.json`. */
  function backupFileName(today) {
    return "mirutina-backup-" + today + ".json";
  }

  /**
   * Backup JSON legible (capa): colecciones + tema + idioma + schemaVersion.
   * Una colección corrupta viaja vacía (solo se exporta lo legible).
   * Con esquema bloqueado → exportRaw (salida del modo bloqueo).
   */
  function exportAll() {
    if (locked) {
      return fail(ERROR_CODES.locked, t("storage.exportLocked"));
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, unavailableMessage());
    }
    const state = readCollectionsState();
    const exportedAt = new Date().toISOString();
    return stringifyValue({
      app: "mirutina",
      kind: "backup",
      schemaVersion: SCHEMA_VERSION,
      exportedAt: exportedAt,
      theme: state.theme,
      lang: state.lang,
      // Referencia del recordatorio: el propio backup es "el último backup".
      lastExport: exportedAt,
      backupReminderDays: loadBackupPrefs().reminderDays,
      routines: state.routines,
      completions: state.completions,
      goals: state.goals,
      shields: state.shields,
      focus: state.focus,
    });
  }

  /**
   * JSON crudo de las claves `mirutina.*` tal cual están, sin interpretar
   * Salida del modo bloqueo; disponible también sin bloqueo.
   */
  function exportRaw() {
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, unavailableMessage());
    }
    const keys = {};
    ALL_KEYS.forEach(function (key) {
      keys[key] = readRaw(key);
    });
    return stringifyValue({
      app: "mirutina",
      kind: "raw",
      exportedAt: new Date().toISOString(),
      keys: keys,
    });
  }

  /** Valida el contenido de un fichero importado. */
  function parseBackup(text) {
    if (typeof text !== "string") {
      return fail(ERROR_CODES.invalid, t("storage.expectedJson"));
    }
    const parsed = parseJson(text);
    if (!parsed.ok) {
      return fail(ERROR_CODES.invalid, t("storage.notJson"));
    }
    return validateBackup(parsed.value);
  }

  /**
   * Estructura mínima de un backup: formato y versión de esquema reconocidos.
   * Las claves añadidas después del lanzamiento (escudos, modo foco, idioma,
   * último backup y frecuencia del recordatorio) pueden faltar: un backup
   * antiguo se completa con valores por defecto.
   */
  function validateBackup(value) {
    if (!isPlainObject(value)) {
      return fail(ERROR_CODES.invalid, t("storage.notBackup"));
    }
    if (value.app !== undefined && value.app !== "mirutina") {
      return fail(ERROR_CODES.invalid, t("storage.wrongApp"));
    }
    if (typeof value.schemaVersion !== "number" || !Number.isInteger(value.schemaVersion)) {
      return fail(ERROR_CODES.invalid, t("storage.schemaMissing"));
    }
    if (value.schemaVersion !== SCHEMA_VERSION) {
      return fail(
        ERROR_CODES.version,
        t("storage.schemaUnknown", { version: value.schemaVersion })
      );
    }
    for (let i = 0; i < COLLECTION_NAMES.length; i += 1) {
      const name = COLLECTION_NAMES[i];
      const list = value[name];
      if (list === undefined && OPTIONAL_COLLECTIONS.indexOf(name) !== -1) {
        continue; // backup antiguo: se importa vacía
      }
      if (!Array.isArray(list)) {
        return fail(ERROR_CODES.invalid, t("storage.collectionMissing", { name: name }));
      }
      for (let j = 0; j < list.length; j += 1) {
        if (!isPlainObject(list[j])) {
          return fail(ERROR_CODES.invalid, t("storage.collectionEntries", { name: name }));
        }
      }
    }
    if (value.theme !== undefined && THEMES.indexOf(value.theme) === -1) {
      return fail(ERROR_CODES.invalid, t("storage.backupThemeInvalid"));
    }
    if (value.focus !== undefined && value.focus !== null && normalizeFocus(value.focus) === null) {
      return fail(ERROR_CODES.invalid, t("storage.backupFocusInvalid"));
    }
    return ok({
      routines: value.routines,
      completions: value.completions,
      goals: value.goals,
      shields: Array.isArray(value.shields) ? value.shields : [],
      focus: normalizeFocus(value.focus),
      theme: value.theme !== undefined ? value.theme : DEFAULT_THEME,
      // Ausente o inválido (backup antiguo) → español, el idioma por defecto.
      lang: LANGS.indexOf(value.lang) !== -1 ? value.lang : DEFAULT_LANG,
      // Ausente (backup antiguo) → se conserva la referencia local del export.
      lastExport: typeof value.lastExport === "string" && !Number.isNaN(new Date(value.lastExport).getTime())
        ? value.lastExport
        : null,
      backupReminderDays: BACKUP_REMINDER_DAYS.indexOf(value.backupReminderDays) !== -1
        ? value.backupReminderDays
        : DEFAULT_BACKUP_REMINDER_DAYS,
      schemaVersion: SCHEMA_VERSION,
    });
  }

  /** Reversión best-effort tras un fallo a mitad del import (nunca escritura parcial aparente). */
  function restoreRawValues(previous) {
    Object.keys(previous).forEach(function (key) {
      if (previous[key] === null) {
        removeRaw(key);
      } else {
        writeRaw(key, previous[key]);
      }
    });
  }

  /**
   * Reemplaza todas las colecciones de golpe. Acepta el
   * backup ya validado por `parseBackup` (se revalida por seguridad). Si una
   * escritura falla a mitad, se revierten las claves previas y se devuelve
   * el error tipado; cancelación e inválidos no escriben nada.
   */
  function importAll(backup) {
    if (locked) {
      return fail(ERROR_CODES.locked, lockedMessage());
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, unavailableMessage());
    }
    const validated = validateBackup(backup);
    if (!validated.ok) {
      return validated;
    }
    const data = validated.value;
    const previous = {};
    ALL_KEYS.forEach(function (key) {
      previous[key] = readRaw(key);
    });
    const writes = [
      [KEYS.routines, JSON.stringify(data.routines)],
      [KEYS.completions, JSON.stringify(data.completions)],
      [KEYS.goals, JSON.stringify(data.goals)],
      [KEYS.shields, JSON.stringify(data.shields)],
      // Foco ausente en el backup → se borra la clave (queda sin foco).
      [KEYS.focus, data.focus === null ? null : JSON.stringify(data.focus)],
      // El descarte local se limpia: con datos restaurados toca reevaluar.
      [
        KEYS.backupPrefs,
        JSON.stringify({ reminderDays: data.backupReminderDays, dismissedAt: null }),
      ],
      [KEYS.theme, data.theme],
      [KEYS.lang, data.lang],
      [KEYS.schemaVersion, JSON.stringify(SCHEMA_VERSION)],
    ];
    if (data.lastExport !== null) {
      writes.push([KEYS.lastExport, data.lastExport]);
    }
    for (let i = 0; i < writes.length; i += 1) {
      const result =
        writes[i][1] === null ? removeRaw(writes[i][0]) : writeRaw(writes[i][0], writes[i][1]);
      if (!result.ok) {
        restoreRawValues(previous);
        return result;
      }
    }
    corruptedCollections = [];
    return ok(data);
  }

  /**
   * Borra todas las claves `mirutina.*` (vaciar datos: salida del modo
   * bloqueo con doble confirmación en la app y desde Ajustes). Es la
   * única escritura permitida con esquema bloqueado.
   */
  function clearAll() {
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, unavailableMessage());
    }
    const toRemove = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key !== null && key.indexOf(KEY_PREFIX) === 0) {
        toRemove.push(key);
      }
    }
    for (let j = 0; j < toRemove.length; j += 1) {
      const removed = removeRaw(toRemove[j]);
      if (!removed.ok) {
        return removed;
      }
    }
    locked = false;
    corruptedCollections = [];
    return ok(toRemove.length);
  }

  // ---- Refresco de cortesía entre pestañas -----------------

  /**
   * Notifica cuando otra pestaña del mismo origen escribe una clave
   * `mirutina.*`. Sin garantía de orden ni entrega; devuelve la función
   * para dejar de escuchar.
   */
  function startListening(onChange) {
    function handler(event) {
      if (typeof event.key !== "string" || event.key.indexOf(KEY_PREFIX) !== 0) {
        return;
      }
      if (typeof onChange === "function") {
        onChange({ key: event.key, newValue: event.newValue });
      }
    }
    window.addEventListener("storage", handler);
    return function stopListening() {
      window.removeEventListener("storage", handler);
    };
  }

  // ---- API pública ---------------------------------------------------------

  window.MiRutina.storage = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    KEYS: KEYS,
    ERROR_CODES: ERROR_CODES,
    isAvailable: isAvailable,
    isLocked: isLocked,
    loadState: loadState,
    loadCollection: loadCollection,
    saveCollection: saveCollection,
    withPersist: withPersist,
    loadTheme: loadTheme,
    saveTheme: saveTheme,
    LANGS: LANGS,
    DEFAULT_LANG: DEFAULT_LANG,
    loadLang: loadLang,
    saveLang: saveLang,
    loadFocus: loadFocus,
    saveFocus: saveFocus,
    loadBackupPrefs: loadBackupPrefs,
    saveBackupPrefs: saveBackupPrefs,
    loadLastExport: loadLastExport,
    saveLastExport: saveLastExport,
    BACKUP_REMINDER_DAYS: BACKUP_REMINDER_DAYS,
    DEFAULT_BACKUP_REMINDER_DAYS: DEFAULT_BACKUP_REMINDER_DAYS,
    backupFileName: backupFileName,
    exportAll: exportAll,
    exportRaw: exportRaw,
    parseBackup: parseBackup,
    importAll: importAll,
    clearAll: clearAll,
    startListening: startListening,
    getCorruptedCollections: getCorruptedCollections,
  };
})();
