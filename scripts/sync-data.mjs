import { writeFile, mkdir } from 'node:fs/promises';

const BASE = 'https://api.dofusdb.fr';
const LIMIT = 50;

async function fetchAll(endpoint) {
  let page = 0;
  const results = [];

  while (true) {
    const url = `${BASE}/${endpoint}?$limit=${LIMIT}&$skip=${page * LIMIT}&$sort[level]=1`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Erro ao buscar ${url}: ${res.status}`);
    }

    const json = await res.json();
    const pageData = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);

    if (pageData.length === 0) break;

    results.push(...pageData);

    if (pageData.length < LIMIT) break;
    page += 1;
  }

  return results;
}

function extractItemsFromRecipes(recipes) {
  const unique = new Map();

  recipes.forEach((recipe) => {
    const resultItem = recipe?.result || recipe?.item || recipe?.output;
    if (!resultItem || !resultItem.id) return;

    if (!unique.has(resultItem.id)) {
      unique.set(resultItem.id, {
        ...resultItem,
        recipe: recipe?.ingredients || recipe?.recipe || []
      });
    }
  });

  return [...unique.values()];
}

async function run() {
  await mkdir('data', { recursive: true });
  const [recipes, monsters] = await Promise.all([
    fetchAll('recipes'),
    fetchAll('monsters')
  ]);

  const items = extractItemsFromRecipes(recipes);

  await writeFile('data/recipes.json', JSON.stringify(recipes, null, 2), 'utf8');
  await writeFile('data/items.json', JSON.stringify(items, null, 2), 'utf8');
  await writeFile('data/monsters.json', JSON.stringify(monsters, null, 2), 'utf8');

  console.log(`recipes: ${recipes.length}`);
  console.log(`items extraídos de recipes: ${items.length}`);
  console.log(`monsters: ${monsters.length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
