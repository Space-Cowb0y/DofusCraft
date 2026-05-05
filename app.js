const API = "https://api.dofusdb.fr";
const prices = {};
const recipeCache = new Map();
const monsterCache = new Map();

const itemSelect = document.getElementById("itemSelect");
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

async function loadItems() {
  const data = await fetchJson("/items?$limit=200&$sort[level]=1");
  const craftables = data.data.filter((i) => i.recipeSlots > 0);
  craftables.forEach((item) => {
    const option = document.createElement("option");
    option.value = String(item.id);
    option.textContent = `${getName(item)} (Lv.${item.level})`;
    option.dataset.name = getName(item);
    itemSelect.appendChild(option);
  });
}

async function getRecipeByResultId(resultId) {
  if (recipeCache.has(resultId)) return recipeCache.get(resultId);
  const payload = await fetchJson(`/recipes?resultId=${resultId}&$limit=1`);
  const recipe = payload?.data?.[0] || null;
  recipeCache.set(resultId, recipe);
  return recipe;
}

async function buildRecipeNode(itemId, qty = 1, depth = 0) {
  const item = await fetchJson(`/items/${itemId}`);
  const name = getName(item);
  if (depth > 5) return { id: itemId, name, qty, leaves: [{ id: itemId, name, qty, dropMonsterIds: item.dropMonsterIds || [] }] };

  const recipe = await getRecipeByResultId(itemId);
  if (!recipe) {
    return { id: itemId, name, qty, dropMonsterIds: item.dropMonsterIds || [], leaves: [{ id: itemId, name, qty, dropMonsterIds: item.dropMonsterIds || [] }] };
  }

  const children = [];
  for (let i = 0; i < recipe.ingredientIds.length; i += 1) {
    const child = await buildRecipeNode(recipe.ingredientIds[i], recipe.quantities[i] * qty, depth + 1);
    children.push(child);
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
  const input = `<input type="number" data-price="${node.id}" value="${prices[node.id] ?? 0}" min="0" step="1" style="width:110px">`;
  li.innerHTML = `<div class="line"><span>${node.qty}x ${node.name}</span><span class="badge">Preço unitário: ${input}</span></div>`;
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
    const monsterNames = await getMonsterNames(res.dropMonsterIds.slice(0, 8));
    const card = document.createElement("div");
    card.className = "drop-card";
    card.innerHTML = `<h3>${res.name} (${res.qty})</h3><div><b>Dropa de:</b> ${monsterNames.join(", ")}</div>`;
    dropsPanel.appendChild(card);
  }
}

async function render() {
  try {
    const itemId = Number(itemSelect.value);
    const qty = Number(quantityInput.value) || 1;
    const root = await buildRecipeNode(itemId, qty);
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
  } catch (err) {
    summary.innerHTML = `<div class="metric">Falha ao consultar API do DofusDB: ${err.message}</div>`;
  }
}

calculateBtn.addEventListener("click", render);
loadItems().then(render);
