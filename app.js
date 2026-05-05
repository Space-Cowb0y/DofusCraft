const API = "https://api.dofusdb.fr";
const PAGE_LIMIT = 500;
const prices = {};
const recipeCache = new Map();
const monsterCache = new Map();
const itemCache = new Map();
let allItems = null;
let selectedItemId = null;

const itemSearchInput = document.getElementById("itemSearch");
const searchResults = document.getElementById("searchResults");
const quantityInput = document.getElementById("quantityInput");
const calculateBtn = document.getElementById("calculateBtn");
const summary = document.getElementById("summary");
const recipeTree = document.getElementById("recipeTree");
const dropsPanel = document.getElementById("dropsPanel");

async function fetchJson(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`Erro na API: ${path}`);
  return res.json();
}

function getName(obj) {
  return obj?.name?.pt || obj?.name?.en || obj?.resultName?.pt || obj?.resultName?.en || `ID ${obj.id ?? "?"}`;
}

async function loadAllItemsOnce() {
  if (allItems) return allItems;
  const items = [];
  let skip = 0;
  let total = Infinity;

  while (skip < total) {
    const payload = await fetchJson(`/items?$limit=${PAGE_LIMIT}&$skip=${skip}&$sort[level]=1`);
    total = payload.total;
    const page = payload.data || [];
    items.push(...page);
    skip += PAGE_LIMIT;
  }

  allItems = items.filter((i) => i.recipeSlots > 0);
  allItems.forEach((item) => itemCache.set(item.id, item));
  return allItems;
}

async function getItem(itemId) {
  if (itemCache.has(itemId)) return itemCache.get(itemId);
  const item = await fetchJson(`/items/${itemId}`);
  itemCache.set(itemId, item);
  return item;
}

async function getRecipeByResultId(resultId) {
  if (recipeCache.has(resultId)) return recipeCache.get(resultId);
  const payload = await fetchJson(`/recipes?resultId=${resultId}&$limit=1`);
  const recipe = payload?.data?.[0] || null;
  recipeCache.set(resultId, recipe);
  return recipe;
}

function renderSearchResults(results) {
  searchResults.innerHTML = "";
  results.slice(0, 20).forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "search-item";
    btn.textContent = `${getName(item)} (Lv.${item.level})`;
    btn.addEventListener("click", () => {
      selectedItemId = item.id;
      itemSearchInput.value = getName(item);
      searchResults.innerHTML = "";
      render();
    });
    searchResults.appendChild(btn);
  });
}

async function handleSearchInput() {
  const query = itemSearchInput.value.trim().toLowerCase();
  selectedItemId = null;

  if (!query) {
    searchResults.innerHTML = "";
    summary.innerHTML = '<div class="metric">Digite para buscar um item.</div>';
    recipeTree.innerHTML = "";
    dropsPanel.innerHTML = "";
    return;
  }

  const items = await loadAllItemsOnce();
  const matches = items.filter((item) => getName(item).toLowerCase().includes(query));
  renderSearchResults(matches);
}

async function buildRecipeNode(itemId, qty = 1, depth = 0) {
  const item = await getItem(itemId);
  const name = getName(item);
  if (depth > 5) return { id: itemId, name, qty, leaves: [{ id: itemId, name, qty, dropMonsterIds: item.dropMonsterIds || [] }] };

  const recipe = await getRecipeByResultId(itemId);
  if (!recipe) return { id: itemId, name, qty, dropMonsterIds: item.dropMonsterIds || [], leaves: [{ id: itemId, name, qty, dropMonsterIds: item.dropMonsterIds || [] }] };

  const children = [];
  for (let i = 0; i < recipe.ingredientIds.length; i += 1) {
    children.push(await buildRecipeNode(recipe.ingredientIds[i], recipe.quantities[i] * qty, depth + 1));
  }
  return { id: itemId, name, qty, children, leaves: children.flatMap((c) => c.leaves) };
}

function calculateTotals(leaves) {
  const grouped = {};
  leaves.forEach((leaf) => {
    if (!grouped[leaf.id]) grouped[leaf.id] = { ...leaf, qty: 0 };
    grouped[leaf.id].qty += leaf.qty;
  });
  let buy = 0;
  let craft = 0;
  Object.values(grouped).forEach((g) => {
    const p = prices[g.id] ?? 0;
    buy += p * g.qty;
    craft += p * g.qty * 0.85;
  });
  return { grouped: Object.values(grouped), buy, craft };
}

function renderTree(node) {
  const li = document.createElement("li");
  li.innerHTML = `<div class="line"><span>${node.qty}x ${node.name}</span><span class="badge">Preço unitário: <input type="number" data-price="${node.id}" value="${prices[node.id] ?? 0}" min="0" step="1" style="width:110px"></span></div>`;
  if (node.children?.length) {
    const ul = document.createElement("ul");
    node.children.forEach((child) => ul.appendChild(renderTree(child)));
    li.appendChild(ul);
  }
  return li;
}

async function getMonsterNames(ids) {
  const names = [];
  for (const id of ids) {
    if (!monsterCache.has(id)) {
      const mon = await fetchJson(`/monsters/${id}`);
      monsterCache.set(id, getName(mon));
    }
    names.push(monsterCache.get(id));
  }
  return names;
}

async function renderDrops(grouped) {
  dropsPanel.innerHTML = "";
  for (const res of grouped) {
    if (!res.dropMonsterIds?.length) continue;
    const card = document.createElement("div");
    card.className = "drop-card";
    const names = await getMonsterNames(res.dropMonsterIds.slice(0, 8));
    card.innerHTML = `<h3>${res.name} (${res.qty})</h3><div><b>Dropa de:</b> ${names.join(", ")}</div>`;
    dropsPanel.appendChild(card);
  }
}

async function render() {
  if (!selectedItemId) {
    summary.innerHTML = '<div class="metric">Selecione um item na busca para calcular.</div>';
    recipeTree.innerHTML = "";
    dropsPanel.innerHTML = "";
    return;
  }

  const qty = Number(quantityInput.value) || 1;
  const root = await buildRecipeNode(selectedItemId, qty);
  const { grouped, buy, craft } = calculateTotals(root.leaves);

  summary.innerHTML = `<div class="metric"><div class="label">Custo para comprar lote</div><div class="value">${buy.toLocaleString("pt-BR")} K</div></div>
  <div class="metric"><div class="label">Custo médio de fabricar</div><div class="value">${craft.toLocaleString("pt-BR")} K</div></div>
  <div class="metric"><div class="label">Economia estimada</div><div class="value">${(buy - craft).toLocaleString("pt-BR")} K</div></div>`;

  recipeTree.innerHTML = "";
  const ul = document.createElement("ul");
  ul.appendChild(renderTree(root));
  recipeTree.appendChild(ul);

  document.querySelectorAll("[data-price]").forEach((el) => {
    el.addEventListener("input", (e) => {
      prices[Number(e.target.dataset.price)] = Number(e.target.value) || 0;
      render();
    });
  });

  await renderDrops(grouped);
}

itemSearchInput.addEventListener("input", () => {
  handleSearchInput().catch((err) => {
    summary.innerHTML = `<div class="metric">Falha na busca: ${err.message}</div>`;
  });
});
calculateBtn.addEventListener("click", () => render());
render();
