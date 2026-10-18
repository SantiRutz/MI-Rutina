/**
 * MiRutina Vanilla — storage.js
 * localStorage con claves mirutina.*, schemaVersion, export/import y
 * errores tipados. Sin DOM, sin cálculos de negocio.
 * Cubre persistencia, JSON corrupto, bloqueo de esquema, export/import,
 * escucha del evento storage entre pestañas y revert con aviso tipado.
 */
(function () {
  "use strict";

  window.MiRutina = window.MiRutina || {};

  const SCHEMA_VERSION = 1;

  // Claves namespaciadas.
  const KEYS = {
    routines: "mirutina.routines",
    completions: "mirutina.completions",
    goals: "mirutina.goals",
    theme: "mirutina.theme",
    schemaVersion: "mirutina.schemaVersion",
  };

  const KEY_PREFIX = "mirutina.";
  const COLLECTION_NAMES = ["routines", "completions", "goals"];
  const ALL_KEYS = [
    KEYS.routines,
    KEYS.completions,
    KEYS.goals,
    KEYS.theme,
    KEYS.schemaVersion,
  ];

  const THEMES = ["dark", "light"];
  const DEFAULT_THEME = "dark";

  /**
   * Registro de migraciones: `{ deVersión: (colecciones) => colecciones }`.
   * Vacío hoy (la distribución nace en v1); punto único de entrada de
   * formatos nuevos.
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

  const LOCKED_MESSAGE =
    "Estos datos fueron creados por una versión más nueva de la app. " +
    "Exporta el JSON crudo o vacía los datos para continuar.";
  const UNAVAILABLE_MESSAGE =
    "No se pueden guardar datos en este navegador: localStorage no está disponible.";
  const QUOTA_MESSAGE =
    "No hay espacio para guardar en este navegador (cuota de almacenamiento excedida).";

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
      return storageError(ERROR_CODES.quota, QUOTA_MESSAGE);
    }
    return storageError(ERROR_CODES.unavailable, UNAVAILABLE_MESSAGE);
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
      return fail(ERROR_CODES.corrupted, "JSON corrupto en la clave; se trata la colección como vacía.");
    }
  }

  function stringifyValue(value) {
    try {
      return ok(JSON.stringify(value));
    } catch (e) {
      return fail(ERROR_CODES.invalid, "No se pudo serializar el dato a JSON.");
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
      return fail(ERROR_CODES.invalid, "Colección desconocida: " + name);
    }
    if (locked) {
      return fail(ERROR_CODES.locked, LOCKED_MESSAGE);
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, UNAVAILABLE_MESSAGE);
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
      return fail(ERROR_CODES.corrupted, "La clave no contiene una lista; se trata la colección como vacía.");
    }
    return parsed;
  }

  /** Serializa y escribe una colección completa (escritura al instante). */
  function saveCollection(name, items) {
    const key = collectionKey(name);
    if (key === null) {
      return fail(ERROR_CODES.invalid, "Colección desconocida: " + name);
    }
    if (!Array.isArray(items)) {
      return fail(ERROR_CODES.invalid, 'La colección "' + name + '" debe ser una lista.');
    }
    if (locked) {
      return fail(ERROR_CODES.locked, LOCKED_MESSAGE);
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, UNAVAILABLE_MESSAGE);
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
      return fail(ERROR_CODES.invalid, "withPersist necesita un holder con la referencia viva { value: lista }.");
    }
    if (typeof mutate !== "function") {
      return fail(ERROR_CODES.invalid, "withPersist necesita una función mutate(actual) => nueva.");
    }
    if (locked) {
      return fail(ERROR_CODES.locked, LOCKED_MESSAGE);
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, UNAVAILABLE_MESSAGE);
    }
    const next = mutate(holder.value);
    if (!Array.isArray(next)) {
      return fail(ERROR_CODES.invalid, "mutate debe devolver la nueva lista.");
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
      return fail(ERROR_CODES.invalid, 'El tema debe ser "dark" o "light".');
    }
    if (locked) {
      return fail(ERROR_CODES.locked, LOCKED_MESSAGE);
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, UNAVAILABLE_MESSAGE);
    }
    // Sin JSON: el script inline del <head> compara el valor crudo.
    return writeRaw(KEYS.theme, theme);
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
      theme: DEFAULT_THEME,
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
      theme: state.theme,
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
   * Backup JSON legible (capa): colecciones + tema + schemaVersion.
   * Una colección corrupta viaja vacía (solo se exporta lo legible).
   * Con esquema bloqueado → exportRaw (salida del modo bloqueo).
   */
  function exportAll() {
    if (locked) {
      return fail(ERROR_CODES.locked, "Con esquema bloqueado usa exportRaw (JSON crudo).");
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, UNAVAILABLE_MESSAGE);
    }
    const state = readCollectionsState();
    return stringifyValue({
      app: "mirutina",
      kind: "backup",
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      theme: state.theme,
      routines: state.routines,
      completions: state.completions,
      goals: state.goals,
    });
  }

  /**
   * JSON crudo de las claves `mirutina.*` tal cual están, sin interpretar
   * Salida del modo bloqueo; disponible también sin bloqueo.
   */
  function exportRaw() {
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, UNAVAILABLE_MESSAGE);
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
      return fail(ERROR_CODES.invalid, "Se esperaba el contenido JSON del fichero.");
    }
    const parsed = parseJson(text);
    if (!parsed.ok) {
      return fail(ERROR_CODES.invalid, "El fichero no es JSON válido.");
    }
    return validateBackup(parsed.value);
  }

  /** Estructura mínima de un backup: formato y versión de esquema reconocidos. */
  function validateBackup(value) {
    if (!isPlainObject(value)) {
      return fail(ERROR_CODES.invalid, "El fichero no tiene el formato de un backup de MiRutina.");
    }
    if (value.app !== undefined && value.app !== "mirutina") {
      return fail(ERROR_CODES.invalid, 'El fichero no parece un backup de MiRutina (app distinta de "mirutina").');
    }
    if (typeof value.schemaVersion !== "number" || !Number.isInteger(value.schemaVersion)) {
      return fail(ERROR_CODES.invalid, "El backup no indica una versión de esquema válida.");
    }
    if (value.schemaVersion !== SCHEMA_VERSION) {
      return fail(
        ERROR_CODES.version,
        "Versión de esquema no reconocida en el backup: " + value.schemaVersion + "."
      );
    }
    for (let i = 0; i < COLLECTION_NAMES.length; i += 1) {
      const name = COLLECTION_NAMES[i];
      const list = value[name];
      if (!Array.isArray(list)) {
        return fail(ERROR_CODES.invalid, 'El backup no incluye la colección "' + name + '" como lista.');
      }
      for (let j = 0; j < list.length; j += 1) {
        if (!isPlainObject(list[j])) {
          return fail(
            ERROR_CODES.invalid,
            'La colección "' + name + '" del backup contiene entradas que no son objetos.'
          );
        }
      }
    }
    if (value.theme !== undefined && THEMES.indexOf(value.theme) === -1) {
      return fail(ERROR_CODES.invalid, 'El tema del backup debe ser "dark" o "light".');
    }
    return ok({
      routines: value.routines,
      completions: value.completions,
      goals: value.goals,
      theme: value.theme !== undefined ? value.theme : DEFAULT_THEME,
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
      return fail(ERROR_CODES.locked, LOCKED_MESSAGE);
    }
    if (!isAvailable()) {
      return fail(ERROR_CODES.unavailable, UNAVAILABLE_MESSAGE);
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
      [KEYS.theme, data.theme],
      [KEYS.schemaVersion, JSON.stringify(SCHEMA_VERSION)],
    ];
    for (let i = 0; i < writes.length; i += 1) {
      const result = writeRaw(writes[i][0], writes[i][1]);
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
      return fail(ERROR_CODES.unavailable, UNAVAILABLE_MESSAGE);
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
