/**
 * MiRutina Vanilla — charts.js
 * Gráficos SVG a medida (barras, dona, línea) con geometría en funciones
 * puras y role="img" + aria-label. Sin librerías.
 * Etiquetas, tooltips, leyendas y fechas se traducen con MiRutina.i18n.
 */
"use strict";

window.MiRutina = window.MiRutina || {};

(function (MiRutina) {
  var ui = MiRutina.ui;
  var i18n = MiRutina.i18n;
  var el = ui.el;
  var svgEl = ui.svgEl;

  function t(key, params) {
    return i18n.t(key, params);
  }

  var SEMAPHORE_VAR = {
    green: "var(--color-success)",
    yellow: "var(--color-warning)",
    red: "var(--color-danger)",
  };

  // ------------------------------------------------------------------
  // Geometría pura (espacio normalizado 0–100; sin DOM)
  // ------------------------------------------------------------------

  var VERTICAL_PADDING = 6;

  /** Valor entre 0 y 100 (barras y escalas). */
  function clampPercent(value) {
    return Math.min(100, Math.max(0, value));
  }

  /** Ancho de una barra en el espacio 0–100 (porcentaje del ancho). */
  function barWidth(percent) {
    return round(clampPercent(percent));
  }

  /**
   * Puntos de una serie: `x` centrado en celdas iguales; `y` invertida
   * (0 arriba) escalada entre 0 y maxValue con margen vertical.
   * @param {number[]} values
   * @param {number} maxValue
   * @returns {Array<{x:number,y:number}>}
   */
  function linePoints(values, maxValue) {
    var max = maxValue > 0 ? maxValue : 1;
    var span = 100 - VERTICAL_PADDING * 2;
    return values.map(function (value, index) {
      return {
        x: round(((index + 0.5) / values.length) * 100),
        y: round(VERTICAL_PADDING + (1 - value / max) * span),
      };
    });
  }

  /** Path SVG de la polilínea ("M … L …"). */
  function linePath(points) {
    if (points.length === 0) return "";
    var head = "M " + points[0].x + " " + points[0].y;
    return points.slice(1).reduce(function (path, point) {
      return path + " L " + point.x + " " + point.y;
    }, head);
  }

  /** Path del área cerrada bajo la línea hasta la base. */
  function areaPath(points) {
    if (points.length === 0) return "";
    var first = points[0];
    var last = points[points.length - 1];
    return linePath(points) + " L " + last.x + " 100 L " + first.x + " 100 Z";
  }

  /** Circunferencia de la dona. */
  function circleCircumference(radius) {
    return round(2 * Math.PI * radius);
  }

  /**
   * `stroke-dasharray` de un arco: `fracción × circunferencia` seguido del
   * hueco hasta completar la vuelta.
   */
  function donutDash(radius, fraction) {
    var circumference = circleCircumference(radius);
    var arc = (clampPercent(fraction * 100) / 100) * circumference;
    return round(arc) + " " + circumference;
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  // ------------------------------------------------------------------
  // Utilidades compartidas
  // ------------------------------------------------------------------

  /** Inicial del día por idioma: "L"/"X" (es), "M"/"W" (en). */
  function weekdayInitial(date) {
    var domain = MiRutina.domain;
    if (!domain || typeof domain.weekdayOf !== "function") return "";
    return i18n.weekdayInitial(domain.weekdayOf(date));
  }

  function semaphoreVar(percent) {
    var domain = MiRutina.domain;
    if (!domain || typeof domain.semaforoColor !== "function") {
      return "var(--color-accent)";
    }
    return SEMAPHORE_VAR[domain.semaforoColor(percent)];
  }

  // ------------------------------------------------------------------
  // Barras horizontales: cumplimiento por rutina (estadísticas)
  // ------------------------------------------------------------------

  /**
   * Barras SVG con el cumplimiento de cada rutina. Etiquetas y % son HTML
   * (texto nítido a cualquier ancho); el SVG solo dibuja rectángulos con
   * ancho en % del viewport (responsive al contenedor).
   * @param {Array<{id:string,label:string,percent:number,color?:string}>} items
   * @returns {HTMLElement} Contenedor con role="img" + aria-label.
   */
  function barChart(items) {
    items = items || [];
    var list = el("ul", { class: "bar-list" });

    items.forEach(function (item) {
      var percent = Math.round(item.percent);
      var svg = svgEl(
        "svg",
        {
          class: "bar-svg",
          "aria-hidden": "true",
          focusable: "false",
        },
        [
          svgEl("rect", {
            x: "0",
            y: "0",
            width: barWidth(item.percent) + "%",
            height: "10",
            rx: "5",
            fill: item.color || "var(--color-accent)",
          }),
        ]
      );

      list.appendChild(
        el("li", { class: "bar-row" }, [
          el("span", { class: "bar-label", title: item.label, text: item.label }),
          el("span", { class: "bar-track" }, [svg]),
          el("span", { class: "bar-percent", text: i18n.percent(percent) }),
        ])
      );
    });

    return el(
      "div",
      { class: "chart chart-bars", role: "img", "aria-label": describeBars(items) },
      [list]
    );
  }

  function describeBars(items) {
    if (items.length === 0) return t("chart.bars.aria", { items: t("chart.days.none") });
    return t("chart.bars.aria", {
      items: items
        .map(function (item) {
          return t("chart.bars.item", {
            label: item.label,
            percent: Math.round(item.percent),
          });
        })
        .join("; "),
    });
  }

  // ------------------------------------------------------------------
  // Mini barras: 7 días del dashboard (semáforo 70/40)
  // ------------------------------------------------------------------

  /**
   * Mini gráfico de 7 días en SVG: alturas proporcionales al porcentaje y
   * color de semáforo. Cada columna lleva su texto visible.
   * @param {Array<{date:string,percent:number,color?:string}>} days
   * @returns {HTMLElement} Contenedor con role="img" + aria-label.
   */
  function miniBarChart(days) {
    days = days || [];
    var chart = el("div", {
      class: "chart chart-mini",
      role: "img",
      "aria-label": describeDays(days, "chart.mini.aria"),
    });

    days.forEach(function (day) {
      var percent = Math.round(day.percent);
      // Mínimo de 2 % de alto para que el 0 siga siendo visible.
      var height = clampPercent(Math.max(day.percent, 2));
      var color = day.color || semaphoreVar(day.percent);

      chart.appendChild(
        el("div", { class: "mini-column" }, [
          el("span", { class: "mini-value", text: i18n.percent(percent) }),
          el("div", { class: "mini-track" }, [
            svgEl(
              "svg",
              {
                class: "mini-svg",
                viewBox: "0 0 100 100",
                preserveAspectRatio: "none",
                "aria-hidden": "true",
                focusable: "false",
              },
              [
                svgEl("rect", {
                  x: "0",
                  y: round(100 - height),
                  width: "100",
                  height: round(height),
                  fill: color,
                }),
              ]
            ),
          ]),
          el("span", {
            class: "mini-day",
            "aria-hidden": "true",
            text: weekdayInitial(day.date),
          }),
        ])
      );
    });

    return chart;
  }

  // ------------------------------------------------------------------
  // Dona: cumplidos vs. no cumplidos
  // ------------------------------------------------------------------

  var DONUT_RADIUS = 44;
  var DONUT_VIEWBOX = 120;

  /**
   * Dona SVG con dos anillos y `stroke-dasharray`; centro y leyenda son HTML.
   * @param {{completed:number, pending:number}} data
   * @returns {HTMLElement}
   */
  function donutChart(data) {
    data = data || { completed: 0, pending: 0 };
    var completed = data.completed || 0;
    var pending = data.pending || 0;
    var total = completed + pending;
    var fraction = total === 0 ? 0 : completed / total;

    var svg = svgEl(
      "svg",
      {
        class: "donut-svg",
        viewBox: "0 0 " + DONUT_VIEWBOX + " " + DONUT_VIEWBOX,
        role: "img",
        "aria-label": t("chart.donut.aria", {
          completed: completed,
          total: total,
          pending: pending,
        }),
      },
      [
        svgEl("circle", {
          class: "donut-pending",
          cx: String(DONUT_VIEWBOX / 2),
          cy: String(DONUT_VIEWBOX / 2),
          r: String(DONUT_RADIUS),
        }),
        svgEl("circle", {
          class: "donut-completed",
          cx: String(DONUT_VIEWBOX / 2),
          cy: String(DONUT_VIEWBOX / 2),
          r: String(DONUT_RADIUS),
          "stroke-dasharray": donutDash(DONUT_RADIUS, fraction),
          transform:
            "rotate(-90 " + DONUT_VIEWBOX / 2 + " " + DONUT_VIEWBOX / 2 + ")",
        }),
      ]
    );

    return el("div", { class: "donut-wrap" }, [
      el("div", { class: "donut" }, [
        svg,
        el("div", { class: "donut-center" }, [
          el("span", {
            class: "donut-value",
            text: i18n.percent(fraction * 100),
          }),
          el("span", { class: "donut-caption", text: t("chart.donut.caption") }),
        ]),
      ]),
      el("ul", { class: "donut-legend" }, [
        el("li", { class: "legend-item" }, [
          el("span", { class: "legend-dot legend-dot-completed", "aria-hidden": "true" }),
          t("chart.donut.completed") + " ",
          el("strong", { text: i18n.number(completed) }),
        ]),
        el("li", { class: "legend-item" }, [
          el("span", { class: "legend-dot legend-dot-pending", "aria-hidden": "true" }),
          t("chart.donut.pending") + " ",
          el("strong", { text: i18n.number(pending) }),
        ]),
      ]),
    ]);
  }

  // ------------------------------------------------------------------
  // Línea: porcentaje diario de 7 días
  // ------------------------------------------------------------------

  var lineChartSeq = 0;

  /**
   * Línea SVG de 7 días con escala fija 0–100: curva con degradado aurora y
   * glow, área que se desvanece a opacidad 0, guías horizontales discretas y
   * puntos con tooltip de valor (sin etiquetas superpuestas). Las etiquetas
   * de día van debajo, alineadas con las celdas.
   * @param {Array<{date:string,percent:number}>} days
   * @returns {HTMLElement}
   */
  function lineChart(days) {
    days = days || [];
    var percents = days.map(function (day) {
      return day.percent;
    });
    var points = linePoints(percents, 100);
    var columns = "repeat(" + Math.max(days.length, 1) + ", minmax(0, 1fr))";
    var gradId = "line-grad-" + ++lineChartSeq;

    var svg = svgEl(
      "svg",
      {
        class: "line-svg",
        viewBox: "0 0 100 100",
        preserveAspectRatio: "none",
        "aria-hidden": "true",
        focusable: "false",
      },
      [
        // Defs: área con degradado vertical a opacidad 0 y trazo aurora.
        svgEl("defs", {}, [
          svgEl(
            "linearGradient",
            { id: gradId + "-area", x1: "0", y1: "0", x2: "0", y2: "1" },
            [
              svgEl("stop", {
                offset: "0",
                "stop-color": "#818cf8",
                "stop-opacity": "0.38",
              }),
              svgEl("stop", {
                offset: "1",
                "stop-color": "#22d3ee",
                "stop-opacity": "0",
              }),
            ]
          ),
          svgEl(
            "linearGradient",
            { id: gradId + "-stroke", x1: "0", y1: "0", x2: "1", y2: "0" },
            [
              svgEl("stop", { offset: "0", "stop-color": "#6366f1" }),
              svgEl("stop", { offset: "0.55", "stop-color": "#7c3aed" }),
              svgEl("stop", { offset: "1", "stop-color": "#22d3ee" }),
            ]
          ),
        ]),
      ].concat(gridLines()).concat([
        svgEl("path", {
          class: "line-area",
          d: areaPath(points),
          fill: "url(#" + gradId + "-area)",
        }),
        svgEl("path", {
          class: "line-path",
          d: linePath(points),
          stroke: "url(#" + gradId + "-stroke)",
          vectorEffect: "non-scaling-stroke",
        }),
      ])
    );

    var plot = el(
      "div",
      {
        class: "line-plot",
        role: "img",
        "aria-label": describeDays(days, "chart.line.aria"),
      },
      [svg]
    );
    points.forEach(function (point, index) {
      var day = days[index];
      var tipText = t("chart.line.tooltip", {
        day: weekdayInitial(day.date),
        date: i18n.dayShort(day.date),
        percent: i18n.number(Math.round(day.percent)),
      });
      var pointWrap = el(
        "button",
        {
          type: "button",
          class:
            "line-point" +
            (index === 0 ? " tip-start" : "") +
            (index === points.length - 1 ? " tip-end" : ""),
          "aria-label": tipText,
          title: tipText,
        },
        [
          el("span", { class: "line-dot", "aria-hidden": "true" }),
          el("span", { class: "line-tip", "aria-hidden": "true", text: tipText }),
        ]
      );
      pointWrap.style.left = point.x + "%";
      pointWrap.style.top = point.y + "%";
      plot.appendChild(pointWrap);
    });

    var labels = el("div", { class: "line-labels", "aria-hidden": "true" });
    labels.style.gridTemplateColumns = columns;
    days.forEach(function (day) {
      labels.appendChild(el("span", { text: weekdayInitial(day.date) }));
    });

    return el("div", { class: "line-wrap" }, [plot, labels]);
  }

  /** Guías horizontales discretas (0/25/50/75/100) dentro del viewBox. */
  function gridLines() {
    return [25, 50, 75].map(function (y) {
      return svgEl("line", {
        class: "line-grid-line",
        x1: "0",
        y1: String(y),
        x2: "100",
        y2: String(y),
      });
    });
  }

  function describeDays(days, prefixKey) {
    var prefix = t(prefixKey);
    if (!days || days.length === 0) return t("chart.days.empty", { prefix: prefix });
    return (
      prefix +
      ": " +
      days
        .map(function (day) {
          return t("chart.days.item", {
            date: i18n.numericDate(day.date),
            percent: Math.round(day.percent),
          });
        })
        .join("; ")
    );
  }

  // ------------------------------------------------------------------
  // API pública
  // ------------------------------------------------------------------

  MiRutina.charts = {
    barChart: barChart,
    miniBarChart: miniBarChart,
    donutChart: donutChart,
    lineChart: lineChart,
    // Geometría pura, testeable sin DOM.
    geometry: {
      clampPercent: clampPercent,
      barWidth: barWidth,
      linePoints: linePoints,
      linePath: linePath,
      areaPath: areaPath,
      circleCircumference: circleCircumference,
      donutDash: donutDash,
    },
  };
})(window.MiRutina);
