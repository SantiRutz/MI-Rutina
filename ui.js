/**
 * MiRutina Vanilla — ui.js
 * Helpers DOM (con escape), navbar, toasts aria-live, diálogo propio con
 * foco atrapado, campos con error, checkbox accesible, empty-states,
 * tabs, reveal y restauración de contexto. Sin cálculos de
 * negocio ni localStorage.
 */
"use strict";

window.MiRutina = window.MiRutina || {};

(function (MiRutina) {
  /** 4 s visibles (mínimo 3 s). */
  var TOAST_DURATION_MS = 4000;

  var seq = 0;

  // ------------------------------------------------------------------
  // Helpers DOM
  // ------------------------------------------------------------------

  /**
   * Escapado para interpolar texto del usuario en HTML.
   * @param {*} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Crea un elemento de forma segura: nunca se pasa HTML crudo, el texto
   * va por `text` (textContent) y los atributos por setAttribute.
   * @param {string} tag Nombre de la etiqueta.
   * @param {Object} [attrs] class/className, text, style (objeto o string),
   * on<Event> (función) y cualquier atributo normal (aria-*, role, id…).
   * Los valores null/false se omiten.
   * @param {Array|Node|string|number} [children] Hijos; las cadenas son texto.
   * @returns {HTMLElement|SVGElement}
   */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    applyAttrs(node, attrs);
    appendChildren(node, children);
    return node;
  }

  function applyAttrs(node, attrs) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (key) {
      applyAttr(node, key, attrs[key]);
    });
  }

  function applyAttr(node, key, value) {
    if (value == null || value === false) return;
    // setAttribute en HTML convierte a minúsculas: htmlFor → "for".
    if (key === "htmlFor") key = "for";
    if (key === "text") {
      node.textContent = String(value);
      return;
    }
    if (key === "class" || key === "className") {
      node.setAttribute("class", String(value));
      return;
    }
    if (key === "style" && typeof value === "object") {
      Object.keys(value).forEach(function (prop) {
        node.style.setProperty(prop, value[prop]);
      });
      return;
    }
    if (/^on[a-z]+$/i.test(key) && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
      return;
    }
    if (key === "value" && "value" in node) {
      node.value = String(value);
      return;
    }
    if (key === "checked" && "checked" in node) {
      node.checked = Boolean(value);
      return;
    }
    node.setAttribute(key, value === true ? "" : String(value));
  }

  function appendChildren(node, children) {
    if (children == null || children === false) return;
    if (Array.isArray(children)) {
      children.forEach(function (child) {
        appendChildren(node, child);
      });
      return;
    }
    if (children instanceof Node) {
      node.appendChild(children);
      return;
    }
    node.appendChild(document.createTextNode(String(children)));
  }

  /** Vacía un contenedor (re-render seguro). */
  function clear(node) {
    node.replaceChildren();
  }

  /**
   * Igual que `el` pero en el namespace SVG (rect, path, circle…);
   * `document.createElement` no sirve para etiquetas SVG.
   * @param {string} tag
   * @param {Object} [attrs]
   * @param {Array|Node|string|number} [children]
   * @returns {SVGElement}
   */
  function svgEl(tag, attrs, children) {
    var node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    applyAttrs(node, attrs);
    appendChildren(node, children);
    return node;
  }

  // ------------------------------------------------------------------
  // Iconos SVG inline (sin icon-fonts ni recursos externos)
  // ------------------------------------------------------------------

  /**
   * Trazos "outline" de cada icono (viewBox 24x24, stroke currentColor).
   * Cada entrada es una lista de specs {d, fill?} o {circle:[cx,cy,r]}.
   */
  var ICONS = {
    logo: [
      { rect: [3, 3, 18, 18, 4] },
      { d: "M8 12.5l2.5 2.5L16 9" },
    ],
    home: [{ d: "M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" }],
    list: [{ d: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" }],
    "check-circle": [
      { d: "M21.5 11.1V12a9.5 9.5 0 1 1-5.6-8.7" },
      { d: "M21.5 5L12 14.5l-3-3" },
    ],
    calendar: [
      { rect: [3, 4.5, 18, 16.5, 3] },
      { d: "M16 2.5v4M8 2.5v4M3 10h18" },
    ],
    chart: [{ d: "M3 3v18h18M8 17v-5M13 17V7M18 17v-8" }],
    trophy: [
      { d: "M8 21h8M12 17.5V21M7 4h10v6a5 5 0 0 1-10 0z" },
      { d: "M7 6H4v1.5a3.5 3.5 0 0 0 3.5 3.5M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5" },
    ],
    gear: [
      { circle: [12, 12, 3.2] },
      {
        d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
      },
    ],
    sun: [
      { circle: [12, 12, 4.5] },
      { d: "M12 1.5v2.5M12 20v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M1.5 12H4M20 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8" },
    ],
    moon: [{ d: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" }],
    plus: [{ d: "M12 5v14M5 12h14" }],
    edit: [
      { d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" },
      { d: "M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" },
    ],
    trash: [{ d: "M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }],
    "chevron-left": [{ d: "M15 18l-6-6 6-6" }],
    "chevron-right": [{ d: "M9 18l6-6-6-6" }],
    flame: [{ d: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" }],
    clock: [{ circle: [12, 12, 9] }, { d: "M12 7v5.2l3.4 2" }],
    note: [
      { d: "M14 2.5H6.5A2 2 0 0 0 4.5 4.5v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" },
      { d: "M14 2.5V8h5.5M8.5 13h7M8.5 17h7" },
    ],
    target: [{ circle: [12, 12, 9] }, { circle: [12, 12, 5] }, { circle: [12, 12, 1.4] }],
    check: [{ d: "M20 6L9 17l-5-5" }],
    x: [{ d: "M18 6L6 18M6 6l12 12" }],
    "check-circle-fill": [
      { circle: [12, 12, 10], fill: true },
      { d: "M8 12.3l2.6 2.6L16 9.5", stroke: "#0f0f0f" },
    ],
    "x-circle-fill": [
      { circle: [12, 12, 10], fill: true },
      { d: "M9 9l6 6M15 9l-6 6", stroke: "#0f0f0f" },
    ],
    save: [
      { d: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" },
      { d: "M17 21v-8H7v8M7 3v5h8" },
    ],
    "arrow-right": [{ d: "M5 12h14M12 5l7 7-7 7" }],
    alert: [
      { d: "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" },
      { d: "M12 9v4.5M12 17.2h.01" },
    ],
    lock: [{ rect: [4, 10.5, 16, 10.5, 3] }, { d: "M8 10.5V7a4 4 0 0 1 8 0v3.5" }],
    sparkle: [{ d: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" }],
  };

  /**
   * Icono SVG inline (decorativo por defecto: aria-hidden).
   * @param {string} name Clave de ICONS.
   * @param {{size?:number, className?:string, label?:string}} [options] Con
   * `label` el icono deja de ser decorativo (role="img" + aria-label).
   * @returns {SVGElement}
   */
  function icon(name, options) {
    options = options || {};
    var specs = ICONS[name] || ICONS.sparkle;
    var size = options.size || 20;
    var attrs = {
      class: "icon" + (options.className ? " " + options.className : ""),
      width: String(size),
      height: String(size),
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      focusable: "false",
    };
    if (options.label) {
      attrs.role = "img";
      attrs["aria-label"] = options.label;
    } else {
      attrs["aria-hidden"] = "true";
    }

    var children = specs.map(function (spec) {
      if (spec.circle) {
        return svgEl("circle", {
          cx: String(spec.circle[0]),
          cy: String(spec.circle[1]),
          r: String(spec.circle[2]),
          fill: spec.fill ? "currentColor" : "none",
          stroke: spec.stroke || (spec.fill ? "none" : "currentColor"),
          "stroke-width": spec.stroke ? 2.4 : 2,
        });
      }
      if (spec.rect) {
        return svgEl("rect", {
          x: String(spec.rect[0]),
          y: String(spec.rect[1]),
          width: String(spec.rect[2]),
          height: String(spec.rect[3]),
          rx: String(spec.rect[4]),
          fill: spec.fill ? "currentColor" : "none",
        });
      }
      return svgEl("path", {
        d: spec.d,
        fill: spec.fill ? "currentColor" : "none",
        stroke: spec.stroke || "currentColor",
      });
    });
    var node = svgEl("svg", attrs, children);
    return node;
  }

  // ------------------------------------------------------------------
  // Navbar: ruta activa + aria-current
  // ------------------------------------------------------------------

  /**
   * Marca el enlace de la ruta activa (aria-current="page" + clase.active).
   * @param {string} route Hash actual, p. ej. "#/registro" ("" → "#/").
   */
  function setActiveRoute(route) {
    var normalized = !route || route === "#" ? "#/" : route;
    var links = document.querySelectorAll(".navbar .nav-link");
    Array.prototype.forEach.call(links, function (link) {
      var active = link.getAttribute("href") === normalized;
      link.classList.toggle("active", active);
      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  // ------------------------------------------------------------------
  // Toasts (feedback inmediato; aria-live para lectores)
  // ------------------------------------------------------------------

  var toastRegion = null;
  var toastTimers = new Map();
  var toastNodes = new Map();

  function getToastRegion() {
    if (!toastRegion || !document.body.contains(toastRegion)) {
      toastRegion = el("div", {
        class: "toast-region",
        role: "status",
        "aria-live": "polite",
      });
      document.body.appendChild(toastRegion);
    }
    return toastRegion;
  }

  /**
   * Muestra un toast abajo-derecha; cola apilada, 4 s y cierre manual.
   * Con `persistent: true` no se auto-retira (solo cierre manual): para
   * avisos que deben durar mientras dure el problema.
   * @param {string|{message:string, variant?:string, persistent?:boolean}} input Texto o
   * `{ message, variant, persistent }` con variant "info" | "success" | "error".
   * @returns {number} id del toast.
   */
  function toast(input) {
    var message =
      typeof input === "string" ? input : String((input && input.message) || "");
    var variant =
      typeof input === "string" || !input || !input.variant
        ? "info"
        : input.variant;
    if (["info", "success", "error"].indexOf(variant) < 0) variant = "info";
    var persistent =
      typeof input !== "string" && !!(input && input.persistent);

    var id = ++seq;
    var node = el(
      "div",
      { class: "toast toast-" + variant },
      [
        el("span", { class: "toast-message", text: message }),
        el("button", {
          type: "button",
          class: "toast-close",
          "aria-label": "Cerrar aviso",
          text: "✕",
          onclick: function () {
            dismissToast(id);
          },
        }),
      ]
    );

    getToastRegion().appendChild(node);
    toastNodes.set(id, node);
    if (!persistent) {
      toastTimers.set(
        id,
        setTimeout(function () {
          dismissToast(id);
        }, TOAST_DURATION_MS)
      );
    }
    return id;
  }

  /** Cierra un toast por id (sin duplicar timers). */
  function dismissToast(id) {
    var timer = toastTimers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      toastTimers.delete(id);
    }
    var node = toastNodes.get(id);
    if (node) {
      node.remove();
      toastNodes.delete(id);
    }
  }

  // ------------------------------------------------------------------
  // Diálogo propio de confirmación (nunca alert/confirm nativos)
  // ------------------------------------------------------------------

  var dialogStack = [];

  function focusableIn(panel) {
    return panel.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
  }

  function onDialogKeydown(event) {
    var top = dialogStack[dialogStack.length - 1];
    if (!top) return;

    if (event.key === "Escape") {
      event.stopPropagation();
      top.close(false);
      return;
    }
    if (event.key !== "Tab") return;

    var focusable = focusableIn(top.panel);
    if (focusable.length === 0) {
      event.preventDefault();
      top.panel.focus();
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
    } else if (!top.panel.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  /**
   * Diálogo modal propio con foco atrapado, Escape/clic en el fondo y
   * foco devuelto al cerrar. Apila diálogos; Escape
   * cierra solo el superior.
   * @param {Object} [options]
   * @param {string} [options.title="Confirmar"]
   * @param {string|Node} [options.body] Cadenas van como texto (sin HTML crudo).
   * @param {string} [options.confirmLabel="Confirmar"]
   * @param {string} [options.cancelLabel="Cancelar"]
   * @param {"default"|"danger"} [options.tone="default"]
   * @returns {Promise<boolean>} true al confirmar, false al cancelar.
   */
  function confirmDialog(options) {
    options = options || {};
    var title = options.title || "Confirmar";
    var body = options.body;
    var confirmLabel = options.confirmLabel || "Confirmar";
    var cancelLabel = options.cancelLabel || "Cancelar";
    var tone = options.tone === "danger" ? "danger" : "default";

    return new Promise(function (resolve) {
      var titleId = "dialog-title-" + ++seq;
      var previousFocus =
        document.activeElement && document.activeElement !== document.body
          ? document.activeElement
          : null;

      var overlay, panel;

      function close(result) {
        var index = dialogStack.indexOf(entry);
        if (index < 0) return;
        dialogStack.splice(index, 1);
        if (dialogStack.length === 0) {
          document.removeEventListener("keydown", onDialogKeydown, true);
        }
        overlay.remove();
        if (previousFocus && document.contains(previousFocus)) {
          previousFocus.focus();
        }
        resolve(result);
      }

      var cancelBtn = el("button", {
        type: "button",
        class: "btn btn-secondary",
        text: cancelLabel,
        onclick: function () {
          close(false);
        },
      });
      var confirmBtn = el("button", {
        type: "button",
        class: tone === "danger" ? "btn btn-danger" : "btn btn-primary",
        text: confirmLabel,
        onclick: function () {
          close(true);
        },
      });

      panel = el(
        "div",
        {
          class: "dialog-panel",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": titleId,
          tabindex: "-1",
        },
        [
          el("h2", { class: "dialog-title", id: titleId, text: title }),
          body
            ? el("div", { class: "dialog-body" }, [body])
            : null,
          el("div", { class: "dialog-actions" }, [cancelBtn, confirmBtn]),
        ]
      );

      overlay = el("div", { class: "dialog-overlay" }, [panel]);
      // Solo el clic directo en el fondo cancela (no el arrastre de texto).
      overlay.addEventListener("mousedown", function (event) {
        if (event.target === event.currentTarget) close(false);
      });

      var entry = { panel: panel, close: close };
      dialogStack.push(entry);
      document.addEventListener("keydown", onDialogKeydown, true);

      document.body.appendChild(overlay);
      panel.focus();
    });
  }

  // ------------------------------------------------------------------
  // Campos de formulario (error junto al campo)
  // ------------------------------------------------------------------

  /**
   * Campo label + control + error inline (`role="alert"`, aria-invalid).
   * @param {Object} options
   * @param {string} options.label Texto del label.
   * @param {HTMLElement} options.control Control con id (se le asigna si falta).
   * @param {string} [options.error]
   * @param {string} [options.hint]
   * @param {boolean} [options.required=false] Marca " *" junto al label.
   * @returns {HTMLElement} Contenedor `.field`.
   */
  function field(options) {
    var label = options.label;
    var control = options.control;
    if (!control.id) control.id = "field-" + ++seq;

    var labelNode = el("label", { class: "field-label", htmlFor: control.id, text: label });
    if (options.required) {
      labelNode.appendChild(
        el("span", { class: "field-required", "aria-hidden": "true", text: " *" })
      );
      control.setAttribute("required", "");
    }

    var wrap = el("div", { class: "field" }, [
      labelNode,
      control,
      options.error
        ? fieldError(options.error)
        : options.hint
          ? el("p", { class: "field-hint", text: options.hint })
          : null,
    ]);
    if (options.error) control.setAttribute("aria-invalid", "true");
    return wrap;
  }

  function fieldError(message) {
    return el("p", { class: "field-error", role: "alert", text: message });
  }

  /**
   * Muestra/limpia el error de un campo creado con `field`.
   * @param {HTMLElement} control El control (input/textarea/…) del campo.
   * @param {string|null} message Mensaje de error; null lo limpia.
   */
  function setFieldError(control, message) {
    var wrap = control.closest(".field");
    if (!wrap) return;
    var existing = wrap.querySelector(".field-error");
    var hint = wrap.querySelector(".field-hint");

    if (message) {
      if (existing) {
        existing.textContent = message;
      } else {
        wrap.appendChild(fieldError(message));
      }
      if (hint) hint.hidden = true;
      control.setAttribute("aria-invalid", "true");
    } else {
      if (existing) existing.remove();
      if (hint) hint.hidden = false;
      control.removeAttribute("aria-invalid");
    }
  }

  // ------------------------------------------------------------------
  // Checkbox accesible con "pop"
  // ------------------------------------------------------------------

  /**
   * Checkbox nativo (teclado gratis) con animación pop al marcar.
   * @param {Object} [options]
   * @param {string} [options.label] Texto visible; si falta, exige ariaLabel.
   * @param {string} [options.ariaLabel]
   * @param {boolean} [options.checked=false]
   * @param {boolean} [options.disabled=false]
   * @param {string} [options.name]
   * @param {string} [options.value]
   * @param {string} [options.checkedColor] Color CSS del check marcado.
   * @param {function(boolean):void} [options.onChange]
   * @returns {HTMLElement}
   */
  function checkbox(options) {
    options = options || {};
    var inputId = options.id || "checkbox-" + ++seq;
    var input = el("input", {
      id: inputId,
      type: "checkbox",
      class: "checkbox-input",
      name: options.name,
      value: options.value,
      checked: Boolean(options.checked),
      disabled: Boolean(options.disabled),
      "aria-label": options.label ? null : options.ariaLabel,
    });
    if (options.checkedColor) {
      input.style.setProperty("--checkbox-checked-color", options.checkedColor);
    }
    if (typeof options.onChange === "function") {
      input.addEventListener("change", function () {
        options.onChange(input.checked);
      });
    }

    var children = [input];
    if (options.label) {
      children.push(el("span", { class: "checkbox-label", text: options.label }));
    }
    return el("label", { class: "checkbox-wrapper", htmlFor: inputId }, children);
  }

  // ------------------------------------------------------------------
  // Barra de progreso con brillo
  // ------------------------------------------------------------------

  /**
   * Barra `role="progressbar"` con aria-label y fill animado (brillo 2 s).
   * @param {Object} [options]
   * @param {number} [options.value=0] Porcentaje; se satura en 0–100.
   * @param {string} [options.label="Progreso"] Nombre accesible.
   * @param {"sm"|"lg"} [options.size="sm"] 8 px en tarjetas, 16 px en resúmenes.
   * @param {string} [options.color] Color CSS del relleno (por defecto acento).
   * @returns {HTMLElement}
   */
  function progressBar(options) {
    options = options || {};
    var value = Number(options.value);
    if (!isFinite(value)) value = 0;
    var clamped = Math.min(100, Math.max(0, value));

    var fill = el("div", { class: "progress-fill" });
    fill.style.width = clamped + "%";
    if (options.color) {
      // El color de la entidad guía el degradado (CSS con color-mix + fallback).
      fill.classList.add("has-color");
      fill.style.setProperty("--bar-color", options.color);
    }

    return el(
      "div",
      {
        class: "progress-track progress-" + (options.size === "lg" ? "lg" : "sm"),
        role: "progressbar",
        "aria-label": options.label || "Progreso",
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuenow": String(Math.round(clamped)),
      },
      [fill]
    );
  }

  // ------------------------------------------------------------------
  // Empty state
  // ------------------------------------------------------------------

  /**
   * Estado vacío centrado para listas sin datos.
   * @param {Object} options
   * @param {string} options.title
   * @param {string} [options.description]
   * @param {string} [options.icon="🗂️"] Emoji decorativo (aria-hidden).
   * @param {Node|Array} [options.actions] Controles opcionales.
   * @returns {HTMLElement}
   */
  function emptyState(options) {
    options = options || {};
    return el(
      "div",
      { class: "empty-state" },
      [
        el("span", { class: "empty-icon", "aria-hidden": "true", text: options.icon || "🗂️" }),
        el("p", { class: "empty-title", text: options.title || "" }),
        options.description
          ? el("p", { class: "empty-description", text: options.description })
          : null,
        options.actions
          ? el("div", { class: "empty-actions" }, [options.actions])
          : null,
      ]
    );
  }

  // ------------------------------------------------------------------
  // Tabs / filtros (WAI-ARIA: flechas, Home, End)
  // ------------------------------------------------------------------

  /**
   * Grupo de pestañas accesible con roving tabindex.
   * @param {Object} options
   * @param {Array<{id:string,label:string}>} options.items
   * @param {string} options.value Id activo.
   * @param {function(string):void} options.onChange
   * @param {string} options.ariaLabel Nombre accesible del grupo.
   * @returns {HTMLElement}
   */
  function tabs(options) {
    var items = options.items || [];
    var value = options.value;
    var onChange = options.onChange;

    function select(id, focus) {
      onChange(id);
      if (focus) {
        var target = document.getElementById("tab-" + id);
        if (target) target.focus();
      }
    }

    var list = el("div", {
      class: "tablist",
      role: "tablist",
      "aria-label": options.ariaLabel || "Filtros",
      onkeydown: function (event) {
        var index = items.findIndex(function (item) {
          return item.id === value;
        });
        if (index < 0) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          select(items[(index + 1) % items.length].id, true);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          select(items[(index - 1 + items.length) % items.length].id, true);
        } else if (event.key === "Home") {
          event.preventDefault();
          select(items[0].id, true);
        } else if (event.key === "End") {
          event.preventDefault();
          select(items[items.length - 1].id, true);
        }
      },
    });

    items.forEach(function (item) {
      var selected = item.id === value;
      list.appendChild(
        el("button", {
          id: "tab-" + item.id,
          type: "button",
          role: "tab",
          class: selected ? "tab tab-selected" : "tab",
          "aria-selected": String(selected),
          tabIndex: selected ? 0 : -1,
          text: item.label,
          onclick: function () {
            select(item.id, false);
          },
        })
      );
    });
    return list;
  }

  // ------------------------------------------------------------------
  // Reveal on scroll ( + prefers-reduced-motion)
  // ------------------------------------------------------------------

  var revealObserver = null;

  function reducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function getRevealObserver() {
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("reveal-visible");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15 }
      );
    }
    return revealObserver;
  }

  function observeReveal(node) {
    // Con reduced-motion (o sin IntersectionObserver) el contenido queda
    // visible sin animación: nunca oculto.
    if (reducedMotion() || typeof IntersectionObserver === "undefined") {
      node.classList.add("reveal-visible");
      return;
    }
    getRevealObserver().observe(node);
  }

  /**
   * Activa el reveal sobre `.reveal` en el árbol dado (y el propio nodo).
   * @param {HTMLElement|Document} root
   * @param {number} [delayMs=0] Escalonado (transition-delay).
   */
  function reveal(root, delayMs) {
    root = root || document;
    var nodes = [];
    if (root.classList && root.classList.contains("reveal")) nodes.push(root);
    if (root.querySelectorAll) {
      Array.prototype.push.apply(nodes, root.querySelectorAll(".reveal"));
    }
    nodes.forEach(function (node) {
      if (delayMs > 0) node.style.transitionDelay = delayMs + "ms";
      observeReveal(node);
    });
  }

  // ------------------------------------------------------------------
  // Restauración de contexto post-render
  // ------------------------------------------------------------------

  function findControl(key) {
    if (key.id && document.getElementById(key.id)) {
      return document.getElementById(key.id);
    }
    if (key.name) {
      return document.querySelector('[name="' + escapeCssAttr(key.name) + '"]');
    }
    if (key.key) {
      return document.querySelector('[data-draft="' + escapeCssAttr(key.key) + '"]');
    }
    return null;
  }

  function escapeCssAttr(value) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }

  /**
   * Captura scroll, elemento fococado (id/nombre + cursor) y borradores de
   * los inputs/textarea/select con `data-draft` (opt-in).
   * @returns {{scrollY:number, focus:Object|null, drafts:Array}}
   */
  function captureContext() {
    var active = document.activeElement;
    var focus = null;
    if (active && active !== document.body && active !== document.documentElement) {
      focus = {
        id: active.id || "",
        name: active.getAttribute ? active.getAttribute("name") || "" : "",
      };
      try {
        if (typeof active.selectionStart === "number") {
          focus.selectionStart = active.selectionStart;
          focus.selectionEnd = active.selectionEnd;
        }
      } catch (e) {
        /* Inputs de tipo no-texto lanzan aquí; no hay cursor que guardar. */
      }
    }

    var drafts = [];
    document
      .querySelectorAll("input[data-draft], textarea[data-draft], select[data-draft]")
      .forEach(function (input) {
        var key = input.id || input.name || input.dataset.draft;
        if (!key) return;
        drafts.push({
          key: key,
          id: input.id || "",
          name: input.name || "",
          value: input.value,
        });
      });

    return { scrollY: window.scrollY, focus: focus, drafts: drafts };
  }

  /**
   * Restaura borradores → foco (+ cursor) → scroll, en ese orden para que
   * el scroll final no lo desplace el foco.
   * @param {{scrollY:number, focus:Object|null, drafts:Array}} context
   */
  function restoreContext(context) {
    if (!context) return;

    (context.drafts || []).forEach(function (draft) {
      var target = findControl(draft);
      if (target && target.value !== draft.value) target.value = draft.value;
    });

    if (context.focus) {
      var focusTarget = findControl(context.focus);
      if (focusTarget) {
        focusTarget.focus();
        try {
          if (
            typeof context.focus.selectionStart === "number" &&
            typeof focusTarget.setSelectionRange === "function"
          ) {
            focusTarget.setSelectionRange(
              context.focus.selectionStart,
              context.focus.selectionEnd
            );
          }
        } catch (e) {
          /* Tipo de input sin selección (p. ej. number): foco basta. */
        }
      }
    }

    if (typeof context.scrollY === "number") {
      window.scrollTo(0, context.scrollY);
    }
  }

  // ------------------------------------------------------------------
  // API pública
  // ------------------------------------------------------------------

  MiRutina.ui = {
    // DOM
    escapeHtml: escapeHtml,
    el: el,
    svgEl: svgEl,
    clear: clear,
    // Iconos SVG inline
    icon: icon,
    // Navbar
    setActiveRoute: setActiveRoute,
    // Toasts
    toast: toast,
    dismissToast: dismissToast,
    // Diálogo propio
    confirmDialog: confirmDialog,
    // Campos
    field: field,
    setFieldError: setFieldError,
    // Controles
    checkbox: checkbox,
    progressBar: progressBar,
    tabs: tabs,
    // Estados
    emptyState: emptyState,
    // Reveal
    reveal: reveal,
    // Restauración de contexto
    captureContext: captureContext,
    restoreContext: restoreContext,
  };
})(window.MiRutina);
