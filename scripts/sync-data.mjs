import { writeFile, mkdir } from 'node:fs/promises';

const BASE = 'https://api.dofusdb.fr';
const LIMIT = 50;

async function fetchAll(endpoint) {
  let page = 1;
  const results = [];

  while (true) {
    const url = `${BASE}/${endpoint}?page=${page}&limit=${LIMIT}`;
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

async function run() {
  await mkdir('data', { recursive: true });
  const [items, monsters] = await Promise.all([
    fetchAll('items'),
    fetchAll('monsters')
  ]);

  await writeFile('data/items.json', JSON.stringify(items, null, 2), 'utf8');
  await writeFile('data/monsters.json', JSON.stringify(monsters, null, 2), 'utf8');

  console.log(`items: ${items.length}`);
  console.log(`monsters: ${monsters.length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
