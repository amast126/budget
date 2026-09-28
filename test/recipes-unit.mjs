// Node checks for the weekly recipes job (scripts/fetch-recipes.mjs) against a stand-in site with made-up recipes.
import * as R from '../scripts/fetch-recipes.mjs';

const SITE = 'https://www.budgetbytes.com';
const recipe = (i) => ({
  id: 1000 + i,
  link: `${SITE}/sample-recipe-${i}/`,
  recipe: {
    name: `Sample Recipe ${i}`,
    rating: { count: i % 5 === 0 ? 4 : 30, average: 4.6 },
    tags: { course: [{ name: i % 7 === 0 ? 'Breakfast' : i % 11 === 0 ? 'Side Dish' : 'Main Course' }], recipe_cost: [{ name: `$${(8 + (i % 5)).toFixed(2)} recipe / $${(1 + (i % 4) * 0.5).toFixed(2)} serving` }] },
    image_id: 5000 + i,
    servings: '4',
    total_time: String(20 + (i % 6) * 10),
    nutrition: { calories: 400 + i, protein: 10 + (i % 30), carbohydrates: 40, fat: 12 },
    ingredients_flat: ['chicken breast', 'garlic', 'rice', 'onion', 'soy sauce', 'broccoli'].map((name) => ({ type: 'ingredient', name, amount: '1', unit: 'cup', notes: '' })),
  },
});

export async function recipesUnit(check) {
  R.noWaits();
  const items = Array.from({ length: 240 }, (_, i) => recipe(i + 1));
  const headers = (h) => ({ get: (k) => h[k.toLowerCase()] ?? null });
  R.useFetch(async (url) => {
    const u = new URL(url);
    const ok = (json, h = {}) => ({ ok: true, status: 200, json: async () => json, headers: headers(h) });
    if (u.pathname.endsWith('/categories') && u.searchParams.get('slug')) return ok([{ id: 5632, slug: 'budget-friendly-meal-prep' }]);
    if (u.pathname.endsWith('/categories') && u.searchParams.get('parent')) return ok([{ id: 10200, slug: 'chicken-meal-prep' }, { id: 10204, slug: 'no-re-heat' }, { id: 10203, slug: 'breakfast-meal-prep' }]);
    if (u.pathname.endsWith('/posts')) {
      const all = [5, 10, 15, 20, 25, 30, 35, 40, 7, 14].map((i, n) => ({ link: `${SITE}/sample-recipe-${i}/`, categories: n % 3 === 0 ? [5632, 10200] : n % 3 === 1 ? [5632, 10204] : [5632] }));
      return ok(u.searchParams.get('page') === '1' ? all.slice(0, 6) : all.slice(6), { 'x-wp-totalpages': '2' });
    }
    return { ok: false, status: 404, json: async () => ({}), headers: headers({}) };
  });
  const mp = await R.fetchMealPrep();
  check(mp.size === 10 && [...mp.get('sample-recipe-5')].join() === 'chicken' && [...mp.get('sample-recipe-10')].join() === 'noreheat', 'recipes job: reads the meal prep collection (both pages) and its tags');
  const w1 = R.build({ items, total: items.length, mealPrep: mp, week: '2026-W40' });
  const courses = w1.picks.reduce((a, r) => ((a[r.course] = (a[r.course] || 0) + 1), a), {});
  check(w1.picks.length === 30 && courses.main === 18 && courses.breakfast === 6 && courses.side === 6 && w1.picks.every((r) => r.lines && r.lines.length), `recipes job: 30 picks a week (${JSON.stringify(courses)}) with their ingredient lines`);
  const five = w1.pool.find((r) => r.slug === 'sample-recipe-5');
  check(five && five.mp === 1 && five.prep.join() === 'chicken' && !w1.pool.some((r) => r.slug === 'sample-recipe-45') && w1.source.mealPrep === 10, 'recipes job: meal prep recipes get in with fewer ratings; others need 10');
  const w2 = R.build({ items, total: items.length, mealPrep: mp, week: '2026-W41', prev: w1 });
  const repeats = w2.picks.filter((r) => w1.picks.some((x) => x.id === r.id)).length;
  check(w2.history.length === 2 && repeats <= 2, `recipes job: next week’s picks are new ones (${repeats} repeats, only where a course ran out)`);
}
