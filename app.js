"use strict";

const byId = (id) => document.getElementById(id);
const defaults = { angle: 45, speed: 24, height: 4, gravity: 9.81, coefficient: 0.15 };
const settings = { ...defaults };
const canvas = byId("canvas");
const ctx = canvas.getContext("2d");
const tooltip = byId("tooltip");
const drag = byId("drag");
const presets = [...document.querySelectorAll("[data-g]")];
const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const tickDecimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4, useGrouping: false });
const scientific = new Intl.NumberFormat("ru-RU", { notation: "scientific", maximumFractionDigits: 2 });
const fmt = (value) => Math.abs(value) >= 1e6 || (value !== 0 && Math.abs(value) < 0.01)
  ? scientific.format(value)
  : decimal.format(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ink = "#336550";
const copper = "#a74f31";
let flight, path, comparison, baseline, view, pointer;
let pinned = null;
let hover = null;
let customGravity = false;
let width = 0;
let height = 0;
let density = 1;

const formulas = {
  model: ["Модель полёта",
    "Тело движется в вертикальной плоскости. Начало координат находится на земле под точкой запуска, а ось y направлена вверх. Полёт заканчивается при касании земли. Масштабы осей подбираются независимо.",
    "Ускорение g постоянно. Пресеты меняют только g. Если выбрано сопротивление воздуха, к ускорению добавляется член −kv⃗ независимо от выбранного пресета."],
  angle: ["Угол запуска α", "Угол начальной скорости к горизонтали. Отрицательные значения направляют тело вниз.",
    ["α = atan2(vᵧ₀, vₓ₀)"], ["α (рад) = α (°) · π / 180"]],
  speed: ["Начальная скорость v₀", "Модуль скорости в момент запуска.",
    ["vₓ₀ = v₀ cos α,  vᵧ₀ = v₀ sin α"], ["v₀ = √(vₓ₀² + vᵧ₀²)"]],
  height: ["Начальная высота h₀", "Координата y в момент запуска. Уровень земли соответствует y = 0.", ["h₀ = y(0)"]],
  gravity: ["Ускорение свободного падения g", "Положительный модуль ускорения, направленного вниз.",
    ["aᵧ = −g  без сопротивления"], ["aᵧ = −g − kvᵧ  с сопротивлением"]],
  drag: ["Сопротивление воздуха", "В линейной модели сила направлена против скорости, а её величина растёт пропорционально скорости. k — коэффициент сопротивления на единицу массы в с⁻¹.",
    ["F⃗ = −mk v⃗"], ["aₓ = −kvₓ,  aᵧ = −g − kvᵧ"]],
  time: ["Время t", "Время отсчитывается от запуска. Если известны координата x и ненулевая горизонтальная скорость vₓ₀, его можно выразить через x.",
    ["t = x / vₓ₀  без сопротивления"], ["t = −ln(1 − kx/vₓ₀) / k  при k > 0"],
    "При вертикальном полёте одной координате y могут соответствовать два момента времени."],
  x: ["Горизонтальная координата x", ["x(t) = vₓ₀t  без сопротивления"], ["x(t) = vₓ₀A(t)  при k > 0"],
    ["A(t) = (1 − e⁻ᵏᵗ) / k"]],
  y: ["Вертикальная координата y", ["y(t) = h₀ + vᵧ₀t − gt²/2  без сопротивления"],
    ["y(t) = h₀ + vᵧ₀A(t) − g(t − A(t))/k  при k > 0"], ["A(t) = (1 − e⁻ᵏᵗ) / k"]],
  vector: ["Радиус-вектор r⃗", "Вектор от начала координат до выбранной точки. На графике он показан рыжей линией.",
    ["r⃗(t) = (x(t), y(t))"], ["|r⃗(t)| = √(x(t)² + y(t)²)"]],
  range: ["Дальность L", "Горизонтальное расстояние от точки запуска до точки касания земли.", ["L = x(T)"]],
  peak: ["Максимальная высота H", "При vᵧ₀ ≤ 0 максимальная высота равна h₀. При vᵧ₀ > 0 вершина достигается в момент, когда vᵧ = 0.",
    ["H = y(tₘₐₓ)"], ["tₘₐₓ = vᵧ₀/g  без сопротивления"], ["tₘₐₓ = ln(1 + kvᵧ₀/g)/k  при k > 0"]],
  duration: ["Время полёта T", "При старте с земли без движения вверх T = 0. В остальных случаях T — момент касания земли на спуске.",
    ["T = (vᵧ₀ + √(vᵧ₀² + 2gh₀)) / g  без сопротивления"],
    "При k > 0 время находится численно из y(T) = 0 на нисходящей части траектории."],
};

function renderFormulaText(text) {
  return text.split(/([A-Za-z]\u20d7)/u).map((part) => {
    if (!part.endsWith("\u20d7")) return part;
    const symbol = document.createElement("i");
    symbol.className = "vector-symbol";
    symbol.textContent = part[0];
    return symbol;
  });
}

const dialog = byId("formula-dialog");
document.querySelectorAll("[data-formula]").forEach((button) => {
  button.addEventListener("click", () => {
    const [title, ...lines] = formulas[button.dataset.formula];
    byId("formula-title").replaceChildren(...renderFormulaText(title));
    byId("formula-body").replaceChildren(...lines.map((line) => {
      const paragraph = document.createElement("p");
      paragraph.append(...renderFormulaText(Array.isArray(line) ? line[0] : line));
      if (Array.isArray(line)) paragraph.className = "equation";
      return paragraph;
    }));
    dialog.showModal();
  });
});
dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});

function samples(model, k) {
  const times = [model.apexTime, model.duration];
  const span = k * model.duration;
  for (let i = 0; i < 420; i++) {
    const proportion = i / 420;
    times.push(model.duration * proportion);
    if (span > 12 && k > 0) times.push(Math.expm1(Math.log1p(span) * proportion) / k);
  }
  return times.sort((a, b) => a - b).map(model.position);
}

function syncControls() {
  presets.forEach((button) => {
    button.setAttribute("aria-pressed", String(!customGravity && Number(button.dataset.g) === settings.gravity));
  });
  byId("custom-g").setAttribute("aria-pressed", String(customGravity || !presets.some((button) => Number(button.dataset.g) === settings.gravity)));
  byId("drag-settings").hidden = !drag.checked;
  byId("comparison-legend").hidden = !drag.checked || settings.coefficient === 0;
}

function rebuild() {
  const k = drag.checked ? settings.coefficient : 0;
  flight = solveFlight({ ...settings, coefficient: k });
  path = samples(flight, k);
  const ideal = k > 0 ? solveFlight({ ...settings, coefficient: 0 }) : flight;
  comparison = k > 0 ? samples(ideal, 0) : null;
  const maxX = Math.max(flight.range, ideal.range);
  const maxY = Math.max(flight.peak, ideal.peak);
  const xSpan = maxX > 0 ? maxX : maxY || 10;
  const ySpan = maxY > 0 ? maxY : maxX * 0.4 || 10;
  baseline = { left: -0.075 * xSpan, right: 1.08 * xSpan, bottom: -0.13 * ySpan, top: 1.16 * ySpan };
  view = { ...baseline };
  hover = null;
  pinned = null;
  byId("flight-range").value = fmt(flight.range) + " м";
  byId("flight-peak").value = fmt(flight.peak) + " м";
  byId("flight-time").value = fmt(flight.duration) + " с";
  syncControls();
  draw();
}

for (const [key, original] of Object.entries(defaults)) {
  const field = byId(key);
  const slider = byId(key + "-range");
  field.addEventListener("input", () => {
    if (!field.validity.valid || field.value === "") return;
    settings[key] = field.valueAsNumber;
    if (key === "gravity") customGravity = !presets.some((button) => Number(button.dataset.g) === settings.gravity);
    if (slider) slider.value = settings[key];
    rebuild();
  });
  field.addEventListener("change", () => {
    if (!field.validity.valid || field.value === "") field.value = settings[key] ?? original;
  });
  slider?.addEventListener("input", () => {
    settings[key] = slider.valueAsNumber;
    field.value = slider.value;
    rebuild();
  });
}
byId("settings-form").addEventListener("submit", (event) => event.preventDefault());
presets.forEach((button) => button.addEventListener("click", () => {
  settings.gravity = Number(button.dataset.g);
  byId("gravity").value = settings.gravity;
  customGravity = false;
  rebuild();
}));
byId("custom-g").addEventListener("click", () => {
  customGravity = true;
  syncControls();
  byId("gravity").focus();
  byId("gravity").select();
});
drag.addEventListener("change", rebuild);
byId("reset").addEventListener("click", () => {
  byId("settings-form").reset();
  Object.assign(settings, defaults);
  customGravity = false;
  rebuild();
});

function plotArea() {
  return { x: width < 520 ? 54 : 65, y: 19, w: width - (width < 520 ? 69 : 86), h: height - 59 };
}
function project(x, y, area) {
  return [
    area.x + (x - view.left) * area.w / (view.right - view.left),
    area.y + (view.top - y) * area.h / (view.top - view.bottom),
  ];
}
function line(x, y, endX, endY, color, dashed = false) {
  ctx.strokeStyle = color;
  ctx.setLineDash(dashed ? [4, 4] : []);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);
}
function gridStep(span, target) {
  const raw = span / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  return power * [1, 2, 2.5, 5, 10].find((step) => step >= raw / power);
}
function drawGrid(area) {
  const right = area.x + area.w;
  const bottom = area.y + area.h;
  const xStep = gridStep(view.right - view.left, Math.max(2, area.w / 81));
  const yStep = gridStep(view.top - view.bottom, Math.max(2, area.h / 49));
  const tick = (value) => Math.abs(value) >= 1e5 || (value !== 0 && Math.abs(value) < 0.001)
    ? scientific.format(value) : tickDecimal.format(value);
  ctx.lineWidth = 1;
  ctx.fillStyle = "#5e6a61";
  ctx.font = "11px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = Math.ceil(view.left / xStep); i <= Math.floor(view.right / xStep); i++) {
    const x = project(i * xStep, 0, area)[0];
    line(x, area.y, x, bottom, i === 0 ? "#89988d" : "#e0e5da");
    ctx.fillText(tick(i * xStep), x, bottom + 5);
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = Math.ceil(view.bottom / yStep); i <= Math.floor(view.top / yStep); i++) {
    const y = project(0, i * yStep, area)[1];
    line(area.x, y, right, y, i === 0 ? "#89988d" : "#e0e5da");
    ctx.fillText(tick(i * yStep), area.x - 7, y);
  }
  ctx.strokeStyle = "#d7dad0";
  ctx.strokeRect(area.x, area.y, area.w, area.h);
  ctx.fillText("y, м", area.x, 10);
  ctx.fillText("x, м", right, height - 9);
}
function strokePath(points, area, color, dashed) {
  ctx.beginPath();
  points.forEach(({ x, y }, i) => {
    const [px, py] = project(x, y, area);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = dashed ? 1.5 : 2.6;
  ctx.strokeStyle = color;
  ctx.setLineDash(dashed ? [5, 5] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}
function dot(x, y, radius, fill, outline) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = outline;
  ctx.stroke();
}
function drawPoint(point, area) {
  const [x, y] = project(point.x, point.y, area);
  const [ox, oy] = project(0, 0, area);
  ctx.lineWidth = 1;
  line(x, y, x, oy, "#a88b78", true);
  line(x, y, ox, y, "#a88b78", true);
  ctx.lineWidth = 1.55;
  line(ox, oy, x, y, copper);
  const angle = Math.atan2(y - oy, x - ox);
  if (Math.hypot(x - ox, y - oy) > 14) {
    const tipX = x - 6 * Math.cos(angle);
    const tipY = y - 6 * Math.sin(angle);
    for (const side of [-0.45, 0.45]) {
      line(tipX, tipY, tipX - 8 * Math.cos(angle + side), tipY - 8 * Math.sin(angle + side), copper);
    }
  }
  dot(x, y, 4.3, copper, "#fcfbf7");
  return [x, y];
}
function draw() {
  if (!flight || width < 85 || height < 80) return;
  ctx.setTransform(density, 0, 0, density, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const area = plotArea();
  drawGrid(area);
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  if (comparison) strokePath(comparison, area, "#758378", true);
  strokePath(path, area, ink, false);
  for (const t of [0, flight.duration]) {
    const { x, y } = flight.position(t);
    dot(...project(x, y, area), 3.2, "#fcfbf7", ink);
  }
  const time = pinned ?? hover ?? flight.apexTime;
  const point = flight.position(time);
  const [x, y] = drawPoint(point, area);
  ctx.restore();

  byId("point-time").value = fmt(point.t) + " с";
  byId("point-x").value = fmt(point.x) + " м";
  byId("point-y").value = fmt(point.y) + " м";
  byId("point-vector").value = "(" + fmt(point.x) + "; " + fmt(point.y) + ") м";
  byId("point-vector").title = "Длина вектора — " + fmt(Math.hypot(point.x, point.y)) + " м";
  byId("unpin").hidden = pinned === null;
  tooltip.hidden = (pinned === null && hover === null) || x < area.x || y < area.y ||
    x > area.x + area.w || y > area.y + area.h;
  if (!tooltip.hidden) {
    tooltip.textContent = "(" + fmt(point.x) + "; " + fmt(point.y) + ") м · " + fmt(point.t) + " с";
    tooltip.style.transform = "translate(" + clamp(x + 10, 3, Math.max(3, width - tooltip.offsetWidth - 3)) +
      "px, " + clamp(y - tooltip.offsetHeight - 9, 0, height - tooltip.offsetHeight) + "px)";
  }
}

new ResizeObserver(() => {
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  density = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(height * density);
  draw();
}).observe(canvas);

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return [event.clientX - rect.left, event.clientY - rect.top];
}
function nearest(px, py, maxDistance) {
  const area = plotArea();
  if (px < area.x || px > area.x + area.w || py < area.y || py > area.y + area.h) return null;
  let best = maxDistance ** 2;
  let interval = null;
  let previous = project(path[0].x, path[0].y, area);
  for (let i = 1; i < path.length; i++) {
    const next = project(path[i].x, path[i].y, area);
    const dx = next[0] - previous[0];
    const dy = next[1] - previous[1];
    const fraction = dx || dy ? clamp(((px - previous[0]) * dx + (py - previous[1]) * dy) / (dx * dx + dy * dy), 0, 1) : 0;
    const distance = (px - previous[0] - fraction * dx) ** 2 + (py - previous[1] - fraction * dy) ** 2;
    if (distance < best) {
      best = distance;
      interval = [path[i - 1].t, path[i].t];
    }
    previous = next;
  }
  if (!interval) return null;
  const distanceAt = (time) => {
    const { x, y } = flight.position(time);
    const [screenX, screenY] = project(x, y, area);
    return (px - screenX) ** 2 + (py - screenY) ** 2;
  };
  let [left, right] = interval;
  for (let i = 0; i < 18; i++) {
    const first = left + (right - left) / 3;
    const second = right - (right - left) / 3;
    if (distanceAt(first) < distanceAt(second)) right = second;
    else left = first;
  }
  return [...interval, (left + right) / 2].reduce((a, b) => distanceAt(a) <= distanceAt(b) ? a : b);
}

canvas.addEventListener("pointermove", (event) => {
  const [x, y] = canvasPoint(event);
  if (pointer?.id === event.pointerId) {
    const area = plotArea();
    const from = pointer.view;
    const dx = x - pointer.x;
    const dy = y - pointer.y;
    pointer.moved ||= Math.hypot(dx, dy) > 5;
    if (pointer.moved) {
      const shiftX = dx * (from.right - from.left) / area.w;
      const shiftY = dy * (from.top - from.bottom) / area.h;
      view = { left: from.left - shiftX, right: from.right - shiftX, top: from.top + shiftY, bottom: from.bottom + shiftY };
      canvas.classList.add("panning");
      hover = null;
      draw();
    }
  } else if (pinned === null && event.pointerType !== "touch") {
    const next = nearest(x, y, 24);
    if (hover !== next) {
      hover = next;
      draw();
    }
  }
});
canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || pointer) return;
  const [x, y] = canvasPoint(event);
  pointer = { id: event.pointerId, x, y, moved: false, view: { ...view } };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointerup", (event) => {
  if (pointer?.id !== event.pointerId) return;
  if (!pointer.moved) {
    pinned = nearest(...canvasPoint(event), event.pointerType === "touch" ? 40 : 27);
    hover = null;
  }
  pointer = null;
  canvas.classList.remove("panning");
  draw();
});
canvas.addEventListener("lostpointercapture", () => {
  pointer = null;
  canvas.classList.remove("panning");
});
canvas.addEventListener("pointerleave", () => {
  if (pointer || hover === null) return;
  hover = null;
  draw();
});
function unpin() {
  pinned = null;
  hover = null;
  draw();
}
byId("unpin").addEventListener("click", () => {
  canvas.focus();
  unpin();
});
canvas.addEventListener("keydown", (event) => {
  const active = pinned ?? hover ?? flight.apexTime;
  if (event.key === "Escape") unpin();
  else if (event.key === "Enter" || event.key === " ") pinned = pinned === null ? active : null;
  else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
    const direction = ["ArrowLeft", "ArrowDown"].includes(event.key) ? -1 : 1;
    const next = event.key === "Home" ? 0 : event.key === "End" ? flight.duration :
      clamp(active + direction * flight.duration / (event.shiftKey ? 10 : 100), 0, flight.duration);
    if (pinned === null) hover = next;
    else pinned = next;
  } else return;
  event.preventDefault();
  draw();
});

function zoom(factor, x = 0.5, y = 0.5) {
  const span = view.right - view.left;
  const relative = span / (baseline.right - baseline.left);
  factor = clamp(relative * factor, 0.025, 24) / relative;
  const anchorX = view.left + span * x;
  const anchorY = view.top + (view.bottom - view.top) * y;
  view = {
    left: anchorX + (view.left - anchorX) * factor,
    right: anchorX + (view.right - anchorX) * factor,
    top: anchorY + (view.top - anchorY) * factor,
    bottom: anchorY + (view.bottom - anchorY) * factor,
  };
  draw();
}
byId("zoom-in").addEventListener("click", () => zoom(1 / 1.35));
byId("zoom-out").addEventListener("click", () => zoom(1.35));
byId("fit").addEventListener("click", () => {
  view = { ...baseline };
  draw();
});
canvas.addEventListener("wheel", (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const [x, y] = canvasPoint(event);
  const area = plotArea();
  zoom(event.deltaY > 0 ? 1.15 : 1 / 1.15, clamp((x - area.x) / area.w, 0, 1), clamp((y - area.y) / area.h, 0, 1));
}, { passive: false });

rebuild();

