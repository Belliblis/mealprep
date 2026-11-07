// Чистая логика без интерфейса: данные, подсчёт покупок, проверки.
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const SLOTS = [['lunch', 'Обед'], ['dinner', 'Ужин'], ['dessert', 'Десерт']];
const TYPE_TITLES = { lunch: 'Обеды', dinner: 'Ужины', dessert: 'Десерты' };
const DEPTS = [['dairy', 'Молочное'], ['meat', 'Мясо и рыба'], ['veg', 'Овощи'], ['fruit', 'Фрукты и ягоды'], ['other', 'Хлеб и прочее']];
const UNITS = ['г', 'мл', 'шт.'];

function normName(s) {
  return String(s).trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

// Продукты кладовой — для новых ингредиентов, которых нет в справочнике
const PANTRY_RE = /(^|[^а-я])(круп|рис|гречк|булгур|чечевиц|макарон|спагетти|лапш|мук|масл|специ|карри|соевый соус|соль)/;
function guessPantry(name) { return PANTRY_RE.test(normName(name)); }

// Мои ограничения: лук, сельдерей
const BANNED = [
  { label: 'лук', test: n => /(^|[^а-я])лук/.test(n) },
  { label: 'сельдерей', test: n => /сельдер/.test(n) },
];
function bannedIn(ingredients) {
  const found = [];
  for (const ing of ingredients) {
    const n = normName(ing.name);
    for (const b of BANNED) if (b.test(n)) found.push({ name: ing.name, label: b.label });
  }
  return found;
}

function emptyPlan() { return Array.from({ length: 7 }, () => ({ lunch: null, dinner: null, dessert: null })); }

function seedState() {
  const s = { version: 1, dishes: [], ingredients: {}, breakfast: [], plan: emptyPlan(), splitDay: 2, bought: {} };
  s.breakfast = SEED.breakfast.map(([name, qty, unit]) => ({ name, qty, unit }));
  SEED.dishes.forEach(([name, type, ings], i) => s.dishes.push({
    id: 'd' + (i + 1), name, type,
    ingredients: ings.map(([n, qty, unit]) => ({ name: n, qty, unit })),
  }));
  for (const [name, dept, pantry] of SEED.ingredients) s.ingredients[normName(name)] = { name, dept, pantry: !!pantry };
  return s;
}

function isValidState(s) {
  return !!s && Array.isArray(s.dishes) && Array.isArray(s.breakfast) && Array.isArray(s.plan)
    && s.plan.length === 7 && !!s.ingredients && typeof s.ingredients === 'object';
}

function findDish(state, id) { return id ? state.dishes.find(d => d.id === id) : null; }

function ingInfo(state, name) {
  return state.ingredients[normName(name)] || { name, dept: 'other', pantry: guessPantry(name) };
}

// Добавляет в справочник ингредиенты, которых там ещё нет
function ensureIngredients(state, ingredients) {
  for (const ing of ingredients) {
    const key = normName(ing.name);
    if (!state.ingredients[key]) state.ingredients[key] = { name: ing.name, dept: 'other', pantry: guessPantry(ing.name) };
  }
}

// Дни закупки: 1 — с Пн по день разделения, 2 — остальные
function shopDays(state, n) {
  const days = [];
  for (let d = 0; d < 7; d++) if ((n === 1) === (d <= state.splitDay)) days.push(d);
  return days;
}

function dayRange(days) {
  if (!days.length) return '—';
  return days.length === 1 ? DAYS[days[0]] : DAYS[days[0]] + '–' + DAYS[days[days.length - 1]];
}

// Список покупок за выбранные дни: завтрак + блюда из слотов, одинаковое суммируется, кладовая пропускается
function shoppingList(state, days) {
  const map = new Map();
  const add = ing => {
    const info = ingInfo(state, ing.name);
    if (info.pantry) return;
    const key = normName(ing.name) + '|' + ing.unit;
    let item = map.get(key);
    if (!item) {
      item = { key, name: info.name, unit: ing.unit, qty: 0, dept: info.dept };
      map.set(key, item);
    }
    item.qty += Number(ing.qty) || 0;
  };
  for (const d of days) {
    state.breakfast.forEach(add);
    for (const [slot] of SLOTS) {
      const dish = findDish(state, state.plan[d][slot]);
      if (dish) dish.ingredients.forEach(add);
    }
  }
  return [...map.values()];
}

function fmtNum(x) { return String(Math.round(x * 100) / 100).replace('.', ','); }

function formatQty(qty, unit) {
  if (!qty) return 'по вкусу';
  if (unit === 'г' && qty > 1000) return fmtNum(qty / 1000) + ' кг';
  return fmtNum(qty) + ' ' + unit;
}
