// Node checks for the recipe box (src/recipebox-logic.js) on made-up recipes: reading ingredient lines, scaling to
// any number of servings, step amounts and timers, search, importing a recipe file, moving the old "My recipes" in,
// and the add/edit form round trip.
import * as B from '../src/recipebox-logic.js';

const card = () => ({
  title: 'Sample Firecracker Meatballs',
  subtitle: 'with Sesame Green Beans & Jasmine Rice',
  source: 'Meal kit',
  servings: 2,
  minutes: 35,
  calories: 740,
  tags: ['Spicy'],
  ingredients: [
    { item: 'Ground beef*', amount: '10 oz', per: { 4: '20 oz' } },
    { item: 'Jasmine rice', amount: '¾ cup', per: { 4: '1½ cups' } },
    { item: 'Green beans', amount: '6 oz', per: { 4: '12 oz' } },
    { item: 'Sriracha', amount: '1 TBSP', per: { 4: '2 TBSP' } },
    { item: 'Scallions', amount: '2', per: { 4: '4' } },
    { item: 'Kosher salt', pantry: true },
    { item: 'Butter', amount: '1 TBSP', per: { 4: '2 TBSP' }, pantry: true, note: 'Contains: Milk' },
  ],
  tools: ['Small pot', 'Baking sheet'],
  steps: [
    { title: 'Rice', text: 'Bring [[1¼ cups]] water to a boil, add the rice and simmer 15–18 minutes.' },
    { title: 'Meatballs', text: 'Roll into 8 balls and roast 12 minutes.' },
  ],
  photo: { card: 'data:image/jpeg;base64,' + 'A'.repeat(400), full: 'data:image/jpeg;base64,' + 'B'.repeat(400) },
});

export async function recipeboxUnit(check) {
  // ---- reading lines
  const L = (t) => B.parseLine(t);
  const a = L('10 oz Ground beef*');
  const b = L('2 cloves garlic, minced');
  const c = L('boneless, skinless chicken thighs');
  const d = L('2 (15 oz) cans chickpeas, drained');
  const e = L('1½–2 cups water');
  const f = L('4 oz Sour Cream (optional)');
  check(
    a.amt === 10 && a.unit === 'oz' && a.item === 'Ground beef' && b.amt === 2 && b.unit === 'clove' && b.item === 'Garlic' && b.note === 'minced' && c.item === 'Boneless, skinless chicken thighs' && !c.note && d.amt === 2 && d.unit === 'can' && /15 oz/.test(d.note) && /drained/.test(d.note) && e.amt === 1.5 && e.amt2 === 2 && e.unit === 'cup' && f.o === 1 && f.item === 'Sour Cream',
    'recipe box: reads amounts, units and notes from ingredient lines (and leaves “boneless, skinless” alone)'
  );
  // ---- scaling
  const rice = { ...L('¾ cup Jasmine rice'), by: { 4: { amt: 1.5, unit: 'cup' } } };
  const sr = L('1 TBSP Sriracha');
  const amt = (i, s) => B.fmtAmount(B.amountFor(i, s, 2));
  check(amt(rice, 2) === '¾ cup' && amt(rice, 4) === '1½ cups' && amt(rice, 1) === '6 tbsp' && amt(rice, 3) === '1 cup + 2 tbsp' && amt(rice, 8) === '3 cups', `recipe box: rice scales (${[1, 2, 3, 4, 8].map((s) => amt(rice, s)).join(', ')})`);
  check(amt(sr, 1) === '1½ tsp' && amt(sr, 6) === '3 tbsp' && amt(sr, 8) === '¼ cup' && amt(L('1½ tbsp sour cream'), 3) === '2¼ tbsp' && amt(L('8 tbsp crema'), 2.5) === '10 tbsp', `recipe box: spoons tidy up as they scale (${[1, 6, 8].map((s) => amt(sr, s)).join(', ')})`);
  const beef = L('10 oz ground beef');
  const shallot = L('1 unit Shallot');
  check(amt(beef, 3) === '15 oz' && amt(beef, 8) === '2½ lb' && amt(shallot, 1) === '½' && amt(shallot, 5) === '2½', 'recipe box: ounces become pounds past 2 lb; counts go by halves');
  // the card's own 4-serving amount is used as printed, and is the starting point for 8
  const oil = { ...L('1 tbsp oil'), by: { 4: { amt: 1.5, unit: 'tbsp' } } };
  check(amt(oil, 4) === '1½ tbsp' && amt(oil, 8) === '3 tbsp', 'recipe box: uses the card’s amount for the nearest serving count it printed');
  check(B.stepText('Melt [[1 tbsp]] butter with [[½ cup]] water.', 2) === 'Melt 2 tbsp butter with 1 cup water.' && B.stepText('Add [[2]] eggs.', 1.5) === 'Add 3 eggs.', 'recipe box: [[amounts]] in steps scale too');
  const t = B.timersIn('Roast 20–25 minutes, broil 2 min, rest 1 hour, toast 30 seconds.');
  check(t.length === 4 && t[0].secs === 1200 && t[0].label === '20–25 min' && t[2].secs === 3600 && t[3].secs === 30, 'recipe box: finds times in steps for cook mode’s timers');

  // ---- import
  const box = B.defaultBox();
  const file = { recipes: [card(), { title: 'Sample Plain Toast', steps: ['Toast the bread.'] }, { nope: true }] };
  const plan = B.planImport(box, file);
  check(!plan.error && plan.items.length === 2 && plan.add === 2 && plan.photos === 1 && plan.skipped.length === 1, 'recipe box: an import file is read (2 recipes, 1 photo, 1 entry without a name skipped)');
  B.applyImport(box, plan.items, { [plan.items[0].r.id]: 'stamp1' });
  const mb = box.recipes.find((r) => r.title === 'Sample Firecracker Meatballs');
  check(mb && mb.photo === 'stamp1' && mb.servings === 2 && mb.nutrition[0] === 740 && B.itemsOf(mb).length === 5 && B.pantryOf(mb).length === 2 && mb.ingredients[0].by[4].amt === 20 && mb.steps.length === 2, 'recipe box: imported recipe keeps its amounts for 4, pantry items, steps and photo');
  mb.fav = 1;
  mb.made = 3;
  const again = B.planImport(box, { recipes: [{ ...card(), minutes: 30, photo: null }] });
  B.applyImport(box, again.items, {});
  const mb2 = box.recipes.find((r) => r.title === 'Sample Firecracker Meatballs');
  check(again.update === 1 && again.add === 0 && box.recipes.length === 2 && mb2.minutes === 30 && mb2.fav === 1 && mb2.made === 3 && mb2.photo === 'stamp1', 'recipe box: importing it again updates it in place (keeps favorite, times made and photo)');
  const toast = box.recipes.find((r) => r.title === 'Sample Plain Toast');
  const counted = B.planImport(box, { recipes: [{ title: 'Sample Plain Toast', steps: ['Toast the bread.'], made: 4 }, { ...card(), made: 9 }] });
  B.applyImport(box, counted.items, {});
  check(!toast.made && box.recipes.find((r) => r.title === 'Sample Plain Toast').made === 4 && box.recipes.find((r) => r.title === 'Sample Firecracker Meatballs').made === 3, 'recipe box: an import fills in times made when the box has none, but keeps yours');
  const resend = B.planImport(box, { recipes: [card(), { title: 'Sample Plain Toast', steps: ['Toast the bread.'], photo: card().photo }] });
  check(resend.update === 2 && resend.photos === 1 && !resend.items[0].photo && !!resend.items[1].photo, 'recipe box: importing again doesn’t resend a photo the box already has (a recipe without one still gets it)');
  check(B.planImport(box, { hello: 1 }).error && B.planImport(box, []).error, 'recipe box: a file without recipes is refused');

  // ---- search
  const own = [
    mb2,
    B.normalizeRecipe({ id: 'r-guac', title: 'Sample Guacamole', ingredients: ['4 avocados', '1 lime', '¼ cup red onion'], tags: ['Snack'] }),
    B.normalizeRecipe({ id: 'r-soup', title: 'Sample Chicken Soup', subtitle: 'with egg noodles', ingredients: ['1 lb chicken breast', '2 carrots'] }),
  ];
  const s = (q) => B.searchRecipes(own, q).map((x) => x.r.id);
  check(s('meatbal')[0] === mb2.id && s('meatballs')[0] === mb2.id && s('meatbals')[0] === mb2.id, 'recipe box: search finds by title, as you type and with a typo');
  const byIng = B.searchRecipes(own, 'avocado');
  check(byIng.length === 1 && byIng[0].r.id === 'r-guac' && /avocados/i.test(byIng[0].via), 'recipe box: search finds by ingredient and says which one');
  check(s('noodle').join() === 'r-soup' && s('snack').join() === 'r-guac' && s('beef rice').join() === mb2.id && s('zzz').length === 0, 'recipe box: search covers subtitles and tags, and every word has to match');
  const hl = B.highlight('with Sesame Green Beans & Jasmine Rice', 'bean jasm');
  check(hl.filter((p) => p.hit).map((p) => p.t).join('|') === 'Bean|Jasm', 'recipe box: highlights the matching parts');

  // ---- the old "My recipes"
  const mine = [
    { id: 'mine-a', title: 'Sample Steak', ingredients: ['2 lb flank steak', 'juice of 2 limes'], notes: 'Grill 4 minutes a side.', made: 2 },
    { id: 'bb-77', webId: 77, title: 'Sample Saved Soup', ingredients: ['1 onion'], url: 'https://example.com/soup/' },
  ];
  const nb = B.defaultBox();
  const moved = B.moveMine(nb, mine);
  const st = B.findRecipe(nb, 'mine-a');
  check(moved.join() === 'mine-a,bb-77' && nb.recipes.length === 2 && st.steps[0].text === 'Grill 4 minutes a side.' && st.made === 2 && st.source === 'Mine' && B.findRecipe(nb, 'bb-77').source === 'Budget Bytes', 'recipe box: old “My recipes” move in (notes become the steps)');
  B.removeRecipe(nb, 'mine-a');
  const again2 = B.moveMine(nb, [...mine, { title: 'Sample No Id', ingredients: 'rice\nbeans' }, { title: 'Sample Bad', ingredients: 42 }]);
  const noId = nb.recipes.find((r) => r.title === 'Sample No Id');
  check(!B.findRecipe(nb, 'mine-a') && again2.length === 4 && noId && /^mine-/.test(noId.id) && noId.ingredients.length === 2 && nb.recipes.some((r) => r.title === 'Sample Bad'), 'recipe box: moving again never brings back a deleted recipe; odd old entries still move');
  const n3 = nb.recipes.length;
  B.moveMine(nb, [{ title: 'Sample No Id', ingredients: ['rice'] }]);
  check(nb.recipes.length === n3, 'recipe box: an old entry without an id moves only once');
  check(B.boxKeys(mb2).join() === 'ground beef,rice,green bean,sriracha,green onion' && B.asCookable(mb2).keys.length === 5, `recipe box: kitchen matching uses the ingredients, not the pantry (${B.boxKeys(mb2).join(', ')})`);

  // ---- compound amounts, ranges, plurals
  const cf = L('1 cup + 2 tbsp flour');
  check(amt(cf, 2) === '1 cup + 2 tbsp' && amt(cf, 4) === '2¼ cups' && B.stepText('Add [[1 cup + 2 tbsp]] flour.', 2) === 'Add 2¼ cups flour.' && B.fmtAmount(B.amountFor(L('1 lb 8 oz beef'), 4, 2)) === '3 lb', 'recipe box: “1 cup + 2 tbsp” and “1 lb 8 oz” scale as one amount');
  check(amt(L('¾–1 cup broth'), 3) === '1–1½ cups' && B.fmtAmount({ amt: 1.05, unit: 'cup' }) === '1 cup' && B.fmtAmount({ amt: 0.02, unit: 'g' }) === '0.1 g' && !L('0 tsp salt').amt, 'recipe box: ranges stay in one unit; “1 cup”, not “1 cups”; no zero amounts');
  // ---- import: ids that can't clash, other shapes
  const longA = { title: 'Sample One-Pan Chicken Sausage Penne', subtitle: 'with Zucchini, Tomatoes & Parmesan Cheese Sauce', source: 'Meal kit' };
  const longB = { ...longA, subtitle: 'with Zucchini, Tomatoes & Parmesan Cream and Basil' };
  const cb = B.defaultBox();
  B.applyImport(cb, B.planImport(cb, { recipes: [longA, longB] }).items, {});
  const clash = B.planImport(cb, { recipes: [{ ...longA, id: cb.recipes[1].id }] });
  check(cb.recipes.length === 2 && cb.recipes[0].id !== cb.recipes[1].id && clash.items[0].r.id === cb.recipes[0].id && clash.update === 1, 'recipe box: two long names that start the same get their own ids; a clashing id goes to the right recipe');
  const dupe = B.planImport(cb, { recipes: [longA, { ...longA }] });
  check(dupe.items.length === 1 && dupe.dupes.length === 1 && dupe.skipped.length === 0, 'recipe box: a recipe twice in one file is imported once (and counted as a repeat)');
  const shapes = B.normalizeRecipe({ title: 'Sample Shapes', nutrition: { calories: '740', protein: '38g' }, ingredients: '10 oz beef\n1 cup rice', steps: '1. Brown the beef.\n\n2. Add the rice.', minutes: '35 min', servings: '4 servings' });
  const cal2 = B.normalizeRecipe({ title: 'x', calories: 500, nutrition: { protein: 20 } });
  check(shapes.nutrition[0] === 740 && shapes.nutrition[1] === 38 && shapes.ingredients.length === 2 && shapes.steps.length === 2 && shapes.steps[0].text === 'Brown the beef.' && shapes.minutes === 35 && shapes.servings === 4 && cal2.nutrition[0] === 500 && cal2.nutrition[1] === 20, 'recipe box: imports nutrition by name, lists as text, “35 min”');
  const pb = B.defaultBox();
  B.applyImport(pb, B.planImport(pb, { recipes: [{ id: 'p1', title: 'Sample P' }] }).items, { p1: 'old1' });
  const swap = B.applyImport(pb, B.planImport(pb, { recipes: [{ id: 'p1', title: 'Sample P' }] }).items, { p1: 'new1' });
  const keepPhoto = B.applyImport(pb, B.planImport(pb, { recipes: [{ id: 'p1', title: 'Sample P', minutes: 5 }] }).items, {});
  check(swap.length === 1 && swap[0].join() === 'p1,old1' && keepPhoto.length === 0 && B.findRecipe(pb, 'p1').photo === 'new1', 'recipe box: a re-import with a new photo says which old photo to remove; without one it keeps the current photo');
  check(B.planImport(pb, { recipes: [{ title: 'Sample Tiny', photo: { card: 'data:image/jpeg;base64,====' } }] }).photos === 0, 'recipe box: a photo that isn’t really one is left out');
  // ---- saved Budget Bytes recipes line up with the weekly file
  const wb = B.defaultBox();
  B.saveWebRecipe(wb, { id: 900001, title: 'Sample Soup', keys: ['onion', 'carrot', 'celery'] }, null);
  const wc = B.asCookable(wb.recipes[0]);
  check(wb.recipes[0].id === 'bb-900001' && wc.id === '900001' && wc.box === false && !B.saveWebRecipe(wb, { id: '900001', title: 'Sample Soup' }, null), 'recipe box: a saved Budget Bytes recipe keeps its Budget Bytes id for matching and planning');

  // ---- the form, both ways
  const form = B.toForm(mb2);
  const back = B.fromForm(form, mb2);
  const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
  check(canon(back.ingredients) === canon(mb2.ingredients) && canon(back.steps) === canon(mb2.steps) && back.id === mb2.id, 'recipe box: editing a recipe without changes keeps it exactly (4-serving amounts too)');
  const odd = B.normalizeRecipe({ id: 'odd', title: 'Sample Odd', ingredients: [{ item: 'Beef', amount: '15.25 oz', per: { 4: '30.5 oz' } }, { item: 'Garlic', amount: '2 cloves', note: 'minced', per: { 4: '4 cloves' } }, '12.5 g yeast'], steps: [{ text: 'Note: this one has a colon.' }] });
  const of = B.toForm(odd);
  const oddBack = B.fromForm({ ...of, title: 'Sample Odd 2', ingredients: of.ingredients + '\n1 cup rice' }, odd);
  check(/15¼ oz Beef/.test(of.ingredients) && oddBack.ingredients[0].amt === 15.25 && oddBack.ingredients[0].by[4].amt === 30.5 && oddBack.ingredients[1].by[4].amt === 4 && oddBack.ingredients[2].amt === 12.5 && oddBack.ingredients.length === 4 && canon(B.fromForm(of, odd).steps) === canon(odd.steps), 'recipe box: the form keeps exact amounts and each unchanged line’s card amounts, even when other lines change');
  const edited = B.fromForm({ ...form, title: 'sample edited', steps: 'Prep: Chop.\n\nCook for 10 minutes.', calories: '' }, mb2);
  check(edited.title === 'Sample edited' && edited.steps.length === 2 && edited.steps[0].title === 'Prep' && !edited.nutrition, 'recipe box: the form’s steps split on blank lines, “Title:” names a step');
  const fresh = B.fromForm({ ...B.toForm(null), title: 'Sample new', ingredients: '1 cup rice\n## Sauce\n2 tbsp soy sauce', servings: '4' }, null);
  check(/^mine-/.test(fresh.id) && fresh.ingredients[1].h === 'Sauce' && fresh.servings === 4, 'recipe box: a new recipe from the form, with an ingredient group');

  // ---- box changes
  const bx = B.defaultBox();
  B.addRecipe(bx, fresh);
  B.addRecipe(bx, { ...fresh });
  const ids = bx.recipes.map((r) => r.id);
  check(ids.length === 2 && ids[0] !== ids[1], 'recipe box: adding a recipe with an id already in the box gives it a new one');
  check(B.toggleFav(bx, ids[0]) === true && B.toggleFav(bx, ids[0]) === false, 'recipe box: favorites toggle');
  const rm = B.removeRecipe(bx, ids[0]);
  B.restoreRecipe(bx, rm.item, rm.index);
  check(bx.recipes[0].id === ids[0], 'recipe box: a deleted recipe comes back in its place with Undo');
  const big = B.defaultBox();
  let full = null;
  try {
    for (let i = 0; i < 400; i++) B.addRecipe(big, B.normalizeRecipe({ id: `r${i}`, title: `Sample ${i}`, steps: [{ text: 'x'.repeat(1990) }], notes: 'y'.repeat(900) }));
  } catch (x) {
    full = x;
  }
  check(full && /full/.test(full.message) && B.boxBytes(big) > B.MAX_BOX_BYTES, 'recipe box: refuses to grow past what one document can hold');
  const norm = B.normalizeBox({ recipes: [{ id: 'x', title: 'A' }, { id: 'x', title: 'B' }, { title: '' }, null] });
  check(norm.recipes.length === 1 && norm.recipes[0].title === 'A', 'recipe box: drops duplicates and blanks when loading');
}
