'use strict';
// Интерфейс. Данные — в localStorage, логика подсчёта — в logic.js.
const STORE_KEY = 'mealPlanner.v1';

let state = load();
let tab = 'week';
let shopN = 1;            // какая закупка открыта
let dishView = 'dishes';  // 'dishes' | 'ingredients'
let ctx = {};             // что открыто в нижней панели

// ---------- Хранение ----------
function normalize(s) {
  if (!s.bought || typeof s.bought !== 'object') s.bought = {};
  if (!(s.splitDay >= 0 && s.splitDay <= 5)) s.splitDay = 2;
  return s;
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (isValidState(s)) return normalize(s);
  } catch (e) { /* нет данных или они повреждены */ }
  return seedState();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { alert('Не удалось сохранить данные на устройстве.'); }
}
function commit() { save(); render(); }

// ---------- Утилиты ----------
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byName = (a, b) => a.name.localeCompare(b.name, 'ru');
const newId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const seg = (action, current, options) => '<div class="seg">' + options.map(([v, label]) =>
  `<button class="${v === current ? 'on' : ''}" data-action="${action}" data-v="${v}">${label}</button>`).join('') + '</div>';

// ---------- Отрисовка ----------
function render() {
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#title').textContent = { week: 'Неделя', shop: 'Покупки', dishes: 'Блюда' }[tab];
  $('#main').innerHTML = tab === 'week' ? renderWeek() : tab === 'shop' ? renderShop() : renderDishes();
}

function renderWeek() {
  const bf = state.breakfast.map(i => i.name.toLowerCase()).join(', ') || '—';
  let h = '';
  DAYS_FULL.forEach((day, i) => {
    h += `<section class="card"><h2>${day}</h2><div class="muted small">Завтрак: ${esc(bf)}</div>`;
    for (const [slot, label] of SLOTS) {
      const dish = findDish(state, state.plan[i][slot]);
      h += `<button class="slot ${dish ? 'filled' : ''}" data-action="pick" data-day="${i}" data-slot="${slot}">
        <span class="slot-label">${label}</span><span class="slot-name">${dish ? esc(dish.name) : '+ выбрать'}</span></button>`;
    }
    h += '</section>';
  });
  return h + '<button class="btn danger wide" data-action="clear-week">Очистить неделю</button>';
}

const DAY_WHEN = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];
function renderShop() {
  const days = shopDays(state, shopN);
  const when = shopN === 1 ? 'в воскресенье' : DAY_WHEN[state.splitDay];
  let h = seg('shop-n', String(shopN), [['1', 'Закупка 1'], ['2', 'Закупка 2']]);
  h += `<p class="muted">Покупаю ${when}, продукты на <span class="nowrap">${dayRange(days)}</span></p>`;
  if (!days.length) return h + '<p class="muted">В этой закупке нет дней. Поменяйте день разделения в настройках.</p>';

  const items = shoppingList(state, days);
  const bought = it => !!state.bought[shopN + '|' + it.key];
  const row = it => `<label class="row ${bought(it) ? 'done' : ''}">
      <input type="checkbox" data-buy="${esc(shopN + '|' + it.key)}" ${bought(it) ? 'checked' : ''}>
      <span class="row-name">${esc(it.name)}</span><span class="row-qty">${formatQty(it.qty, it.unit)}</span></label>`;

  const left = items.filter(it => !bought(it));
  const done = items.filter(bought).sort(byName);
  h += `<p class="small muted">Осталось купить: ${left.length} из ${items.length}</p>`;
  for (const [dept, title] of DEPTS) {
    const list = left.filter(it => it.dept === dept).sort(byName);
    if (list.length) h += `<section class="card"><h2>${title}</h2>${list.map(row).join('')}</section>`;
  }
  if (done.length) h += `<section class="card"><h2>Куплено</h2>${done.map(row).join('')}</section>`;
  return h;
}

function usedIngredientKeys() {
  const keys = new Set(state.breakfast.map(i => normName(i.name)));
  state.dishes.forEach(d => d.ingredients.forEach(i => keys.add(normName(i.name))));
  return [...keys];
}

function renderDishes() {
  let h = seg('dish-view', dishView, [['dishes', 'Блюда'], ['ingredients', 'Ингредиенты']]);
  if (dishView === 'dishes') {
    h += '<button class="btn primary wide" data-action="dish-new">+ Добавить блюдо</button>';
    for (const [type] of SLOTS) {
      const list = state.dishes.filter(d => d.type === type).sort(byName);
      h += `<section class="card"><h2>${TYPE_TITLES[type]} <span class="muted">${list.length}</span></h2>`;
      h += list.map(d => `<button class="item" data-action="dish-edit" data-id="${d.id}">${esc(d.name)}${bannedIn(d.ingredients).length ? ' ⚠️' : ''}</button>`).join('')
        || '<p class="muted">Пока пусто</p>';
      h += '</section>';
    }
  } else {
    const infos = usedIngredientKeys().map(k => ({ key: k, ...ingInfo(state, k), name: (state.ingredients[k] || {}).name || k }));
    for (const [dept, title] of DEPTS) {
      const list = infos.filter(i => i.dept === dept).sort(byName);
      if (!list.length) continue;
      h += `<section class="card"><h2>${title}</h2>` + list.map(i =>
        `<button class="item" data-action="ing-open" data-key="${esc(i.key)}">${esc(i.name)}${i.pantry ? '<span class="badge">кладовая</span>' : ''}</button>`).join('') + '</section>';
    }
  }
  return h;
}

// ---------- Нижняя панель ----------
function openSheet(html, context) {
  ctx = context || {};
  $('#sheet-body').innerHTML = html;
  $('#overlay').hidden = false;
  document.body.classList.add('locked');
  $('.sheet').scrollTop = 0;
}
function closeSheet() {
  $('#overlay').hidden = true;
  document.body.classList.remove('locked');
  ctx = {};
}

function openPicker(day, slot) {
  const current = state.plan[day][slot];
  const list = state.dishes.filter(d => d.type === slot).sort(byName);
  let h = `<h2>${DAYS_FULL[day]} · ${SLOTS.find(s => s[0] === slot)[1]}</h2>`;
  if (current) h += '<button class="btn danger wide" data-action="slot-clear">Очистить слот</button>';
  h += list.map(d => `<button class="item ${d.id === current ? 'selected' : ''}" data-action="slot-set" data-id="${d.id}">${esc(d.name)}${bannedIn(d.ingredients).length ? ' ⚠️' : ''}</button>`).join('')
    || '<p class="muted">Нет блюд этого типа. Добавьте их во вкладке «Блюда».</p>';
  openSheet(h, { kind: 'pick', day, slot });
}

// Редактор строк ингредиентов — общий для блюда и завтрака
function ingRow(i) {
  return `<div class="ing-row">
    <input class="i-name" list="ing-names" placeholder="Продукт" value="${esc(i.name)}" autocomplete="off">
    <input class="i-qty" inputmode="decimal" placeholder="по вкусу" value="${i.qty ? fmtNum(i.qty) : ''}">
    <select class="i-unit">${UNITS.map(u => `<option${u === i.unit ? ' selected' : ''}>${u}</option>`).join('')}</select>
    <button class="icon-btn" data-action="row-remove" aria-label="Убрать">✕</button></div>`;
}
function ingEditor(ings) {
  const names = usedIngredientKeys().map(k => (state.ingredients[k] || { name: k }).name).sort((a, b) => a.localeCompare(b, 'ru'));
  return `<datalist id="ing-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div id="ing-rows">${ings.map(ingRow).join('')}</div>
    <button class="btn wide" data-action="row-add">+ Ингредиент</button>
    <div id="warn" class="warn" hidden></div>`;
}
function readRows() {
  return $$('#ing-rows .ing-row').map(r => ({
    name: r.querySelector('.i-name').value.trim().replace(/\s+/g, ' '),
    qty: parseFloat(r.querySelector('.i-qty').value.replace(',', '.')) || 0,
    unit: r.querySelector('.i-unit').value,
  })).filter(i => i.name);
}
function bannedText(found) {
  return 'В составе есть то, что вы не едите: ' + found.map(f => `${f.name} (${f.label})`).join(', ') + '.';
}
function updateWarn() {
  const w = $('#warn');
  if (!w) return;
  const found = bannedIn(readRows());
  w.hidden = !found.length;
  w.textContent = found.length ? '⚠️ ' + bannedText(found) : '';
}

function openDishEditor(id) {
  const d = id ? findDish(state, id) : { name: '', type: 'lunch', ingredients: [] };
  const ings = d.ingredients.length ? d.ingredients : [{ name: '', qty: 0, unit: 'г' }];
  openSheet(`<h2>${id ? 'Блюдо' : 'Новое блюдо'}</h2>
    <label class="field">Название<input id="f-name" value="${esc(d.name)}"></label>
    <label class="field">Тип<select id="f-type">${SLOTS.map(([v, l]) => `<option value="${v}"${v === d.type ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <h3>Ингредиенты на 1 порцию</h3>${ingEditor(ings)}
    <button class="btn primary wide" data-action="dish-save">Сохранить</button>
    ${id ? '<button class="btn danger wide" data-action="dish-delete">Удалить блюдо</button>' : ''}`, { kind: 'dish', id });
  updateWarn();
}

function saveDish() {
  const name = $('#f-name').value.trim();
  if (!name) { alert('Введите название блюда.'); return; }
  const ingredients = readRows();
  const found = bannedIn(ingredients);
  if (found.length && !confirm('⚠️ ' + bannedText(found) + '\n\nВсё равно сохранить?')) return;
  const type = $('#f-type').value;
  if (ctx.id) Object.assign(findDish(state, ctx.id), { name, type, ingredients });
  else state.dishes.push({ id: newId(), name, type, ingredients });
  ensureIngredients(state, ingredients);
  // если тип блюда поменялся, оно не должно остаться в чужом слоте
  if (ctx.id) state.plan.forEach(p => SLOTS.forEach(([s]) => { if (p[s] === ctx.id && s !== type) p[s] = null; }));
  closeSheet();
  commit();
}

function deleteDish() {
  const d = findDish(state, ctx.id);
  if (!confirm(`Удалить блюдо «${d.name}»? Оно пропадёт и из плана недели.`)) return;
  state.dishes = state.dishes.filter(x => x.id !== d.id);
  state.plan.forEach(p => SLOTS.forEach(([s]) => { if (p[s] === d.id) p[s] = null; }));
  closeSheet();
  commit();
}

function openIngredient(key) {
  const info = { ...ingInfo(state, key), name: (state.ingredients[key] || {}).name || key };
  const usedIn = state.dishes.filter(d => d.ingredients.some(i => normName(i.name) === key)).map(d => d.name).sort((a, b) => a.localeCompare(b, 'ru'));
  if (state.breakfast.some(i => normName(i.name) === key)) usedIn.unshift('Завтрак');
  openSheet(`<h2>${esc(info.name)}</h2>
    <label class="field">Отдел<select id="f-dept">${DEPTS.map(([v, l]) => `<option value="${v}"${v === info.dept ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="check"><input type="checkbox" id="f-pantry" ${info.pantry ? 'checked' : ''}> Есть в кладовой — не добавлять в покупки</label>
    <p class="small muted">Используется: ${esc(usedIn.join(', ') || 'нигде')}</p>
    <button class="btn primary wide" data-action="ing-save">Сохранить</button>`, { kind: 'ing', key, name: info.name });
}

function openSettings() {
  const opts = DAYS.slice(0, 6).map((d, i) => `<option value="${i}"${i === state.splitDay ? ' selected' : ''}>${d}</option>`).join('');
  openSheet(`<h2>Настройки</h2>
    <h3>Завтрак каждый день</h3>${ingEditor(state.breakfast)}
    <button class="btn primary wide" data-action="breakfast-save">Сохранить завтрак</button>
    <h3>Закупки</h3>
    <label class="field">Закупка 1 покрывает дни с Пн по<select id="f-split">${opts}</select></label>
    <p class="small muted">Закупка 2 — в этот же день, на оставшиеся дни недели.</p>
    <h3>Резервная копия</h3>
    <p class="small muted">Сохраните файл в «Файлы» или отправьте себе — из него можно всё восстановить.</p>
    <button class="btn wide" data-action="export">Экспорт (скачать файл)</button>
    <button class="btn wide" data-action="import">Импорт из файла</button>`, { kind: 'settings' });
  updateWarn();
}

async function exportData() {
  const fname = `pitanie-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(state, null, 2)], fname, { type: 'application/json' });
  const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: fname }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let s;
    try { s = JSON.parse(reader.result); } catch (e) { s = null; }
    if (!isValidState(s)) { alert('Это не файл резервной копии этого приложения.'); return; }
    if (!confirm('Заменить все текущие данные данными из файла?')) return;
    state = normalize(s);
    closeSheet();
    commit();
    alert('Данные восстановлены.');
  };
  reader.readAsText(file);
}

// ---------- События ----------
const actions = {
  tab: el => { tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  settings: openSettings,
  close: closeSheet,
  pick: el => openPicker(+el.dataset.day, el.dataset.slot),
  'slot-set': el => { state.plan[ctx.day][ctx.slot] = el.dataset.id; closeSheet(); commit(); },
  'slot-clear': () => { state.plan[ctx.day][ctx.slot] = null; closeSheet(); commit(); },
  'clear-week': () => {
    if (!confirm('Очистить весь план недели? Галочки «куплено» тоже сбросятся.')) return;
    state.plan = emptyPlan(); state.bought = {}; commit();
  },
  'shop-n': el => { shopN = +el.dataset.v; render(); },
  'dish-view': el => { dishView = el.dataset.v; render(); },
  'dish-new': () => openDishEditor(null),
  'dish-edit': el => openDishEditor(el.dataset.id),
  'dish-save': saveDish,
  'dish-delete': deleteDish,
  'row-add': () => {
    $('#ing-rows').insertAdjacentHTML('beforeend', ingRow({ name: '', qty: 0, unit: 'г' }));
    $('#ing-rows .ing-row:last-child .i-name').focus();
  },
  'row-remove': el => { el.closest('.ing-row').remove(); updateWarn(); },
  'ing-open': el => openIngredient(el.dataset.key),
  'ing-save': () => {
    state.ingredients[ctx.key] = { name: ctx.name, dept: $('#f-dept').value, pantry: $('#f-pantry').checked };
    closeSheet(); commit();
  },
  'breakfast-save': () => {
    const rows = readRows();
    const found = bannedIn(rows);
    if (found.length && !confirm('⚠️ ' + bannedText(found) + '\n\nВсё равно сохранить?')) return;
    state.breakfast = rows; ensureIngredients(state, rows); commit();
    alert('Завтрак сохранён.');
  },
  export: exportData,
  import: () => $('#import-file').click(),
};

document.addEventListener('click', e => {
  if (e.target.id === 'overlay') { closeSheet(); return; }
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.buy) {
    if (t.checked) state.bought[t.dataset.buy] = true; else delete state.bought[t.dataset.buy];
    commit();
  } else if (t.id === 'f-split') {
    state.splitDay = +t.value; save(); render();
  } else if (t.id === 'import-file' && t.files[0]) {
    importData(t.files[0]); t.value = '';
  }
});
document.addEventListener('input', e => { if (e.target.closest('#ing-rows')) updateWarn(); });

render();

// Просим браузер не удалять данные при нехватке места
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

// Офлайн-режим. При выходе новой версии страница сама перезагрузится.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js');
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
}
