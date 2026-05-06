const state = {
  items: [],
  monsters: [],
  selected: new Map(),
  prices: new Map(),
  owned: new Map(),
  done: new Set()
};

const els = {
  searchInput: document.getElementById('searchInput'),
  searchResults: document.getElementById('searchResults'),
  selectedItems: document.getElementById('selectedItems'),
  recipeList: document.getElementById('recipeList'),
  totals: document.getElementById('totals')
};

const itemById = new Map();

async function fetchJsonFromCandidates(paths) {
  const attempts = [];
  for (const path of paths) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      attempts.push(`${path} -> ${res.status}`);
      if (!res.ok) continue;
      const json = await res.json();
      if (Array.isArray(json)) return { json, path };
      attempts.push(`${path} -> formato inválido`);
    } catch (err) {
      attempts.push(`${path} -> ${err?.message || 'erro desconhecido'}`);
    }
  }
  throw new Error(`Não foi possível carregar o cache JSON. Tentativas: ${attempts.join(' | ')}`);
}

async function loadCache() {
  if (window.location.protocol === 'file:') {
    throw new Error('Abra o app via servidor HTTP (ex.: npm start). O navegador bloqueia fetch de JSON no protocolo file://.');
  }

  const itemCandidates = ['./data/items.json', '/data/items.json', 'data/items.json'];
  const monsterCandidates = ['./data/monsters.json', '/data/monsters.json', 'data/monsters.json'];

  const [{ json: items, path: itemsPath }, { json: monsters, path: monstersPath }] = await Promise.all([
    fetchJsonFromCandidates(itemCandidates),
    fetchJsonFromCandidates(monsterCandidates)
  ]);

  state.items = items;
  state.monsters = monsters;
  itemById.clear();
  items.forEach(i => itemById.set(i.id, i));

  console.info(`Cache carregado com sucesso: ${itemsPath} (${items.length} itens), ${monstersPath} (${monsters.length} monstros).`);
  renderSearch();
}

function normalize(txt) { return String(txt ?? '').toLowerCase(); }

function renderSearch() {
  const q = normalize(els.searchInput.value);
  const filtered = state.items
    .filter(i => normalize(i.name).includes(q))
    .slice(0, 40);

  els.searchResults.innerHTML = filtered.map(i => `
    <div class="row">
      <div></div>
      <img src="${i.img || ''}" alt="${i.name}">
      <div class="meta"><strong>${i.name}</strong><small>Lvl.${i.level || '-'}</small></div>
      <button data-add="${i.id}">Adicionar</button>
    </div>`).join('');

  els.searchResults.querySelectorAll('button[data-add]').forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.add);
      state.selected.set(id, (state.selected.get(id) || 0) + 1);
      renderSelected();
      renderRecipe();
    };
  });
}

function renderSelected() {
  const rows = [...state.selected.entries()].map(([id, qty]) => {
    const item = itemById.get(id);
    return `<div class="row">
      <div></div><img src="${item?.img || ''}" alt="${item?.name || ''}">
      <div class="meta"><strong>${item?.name || '??'}</strong></div>
      <div class="controls">
        <label>Qtd <input type="number" min="1" data-q="${id}" value="${qty}"></label>
        <button data-rm="${id}">Remover</button>
      </div>
    </div>`;
  }).join('');
  els.selectedItems.innerHTML = rows || '<small>Nenhum item selecionado.</small>';

  els.selectedItems.querySelectorAll('[data-q]').forEach(inp => {
    inp.onchange = () => {
      const id = Number(inp.dataset.q);
      state.selected.set(id, Math.max(1, Number(inp.value) || 1));
      renderRecipe();
    };
  });
  els.selectedItems.querySelectorAll('[data-rm]').forEach(btn => {
    btn.onclick = () => {
      state.selected.delete(Number(btn.dataset.rm));
      renderSelected();
      renderRecipe();
    };
  });
}

function collectRecipe(itemId, mult, acc) {
  const item = itemById.get(itemId);
  const recipe = item?.recipe || [];
  if (!recipe.length) {
    acc.set(itemId, (acc.get(itemId) || 0) + mult);
    return;
  }
  recipe.forEach(part => {
    const partId = part.item_id || part.id;
    const count = part.quantity || part.qty || 1;
    collectRecipe(partId, mult * count, acc);
  });
}

function monstersForItem(itemId) {
  return state.monsters.filter(m =>
    Array.isArray(m.drops) && m.drops.some(d => (d.item_id || d.id) === itemId)
  ).map(m => m.name).slice(0, 4);
}

function renderRecipe() {
  const acc = new Map();
  for (const [id, qty] of state.selected.entries()) collectRecipe(id, qty, acc);

  let craftCost = 0;
  let buyAll = 0;

  const rows = [...acc.entries()].map(([id, needed]) => {
    const item = itemById.get(id);
    const price = state.prices.get(id) || 0;
    const owned = state.owned.get(id) || 0;
    const buyQty = Math.max(0, needed - owned);
    buyAll += needed * price;
    craftCost += buyQty * price;
    const isDone = state.done.has(id) || buyQty === 0;
    const drops = monstersForItem(id);
    return `<div class="row ${isDone ? 'done' : ''}">
      <input type="checkbox" data-done="${id}" ${isDone ? 'checked' : ''}>
      <img src="${item?.img || ''}" alt="${item?.name || ''}">
      <div class="meta">
        <strong>${item?.name || 'Desconhecido'} x${needed}</strong>
        <small>Drop: ${drops.length ? drops.join(', ') : 'não encontrado'}</small>
      </div>
      <div class="controls">
        <label>Preço <input type="number" min="0" data-price="${id}" value="${price}"></label>
        <label>Tenho <input type="number" min="0" data-owned="${id}" value="${owned}"></label>
      </div>
    </div>`;
  }).join('');

  els.recipeList.innerHTML = rows || '<small>Sem receita para exibir.</small>';
  const sale = [...state.selected.entries()].reduce((sum, [id, qty]) => sum + ((state.prices.get(id) || 0) * qty), 0);
  els.totals.textContent = `Custo fabricação: ${craftCost.toLocaleString()} kamas | Comprar tudo: ${buyAll.toLocaleString()} kamas | Lucro final estimado: ${(sale - craftCost).toLocaleString()} kamas`;

  bindRecipeInputs();
}

function bindRecipeInputs() {
  els.recipeList.querySelectorAll('[data-price]').forEach(inp => inp.onchange = () => {
    state.prices.set(Number(inp.dataset.price), Number(inp.value) || 0);
    renderRecipe();
  });
  els.recipeList.querySelectorAll('[data-owned]').forEach(inp => inp.onchange = () => {
    state.owned.set(Number(inp.dataset.owned), Number(inp.value) || 0);
    renderRecipe();
  });
  els.recipeList.querySelectorAll('[data-done]').forEach(chk => chk.onchange = () => {
    const id = Number(chk.dataset.done);
    if (chk.checked) state.done.add(id); else state.done.delete(id);
    renderRecipe();
  });
}

els.searchInput.addEventListener('input', renderSearch);

loadCache().catch((err) => {
  console.error(err);
  els.searchResults.innerHTML = `<small>${err.message}</small>`;
});
