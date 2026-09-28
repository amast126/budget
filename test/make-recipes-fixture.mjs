// A made-up recipes.json for the tests: sample dishes in the same shape the weekly job writes (30 picks with
// ingredient lines, a pool with meal prep tags, the common-ingredient list). Nothing here comes from Budget Bytes.
const MAINS = [
  ['Sample Chicken and Rice Bowls', ['chicken breast', 'rice', 'garlic', 'soy sauce', 'broccoli', 'green onion'], ['chicken'], 2.1, 35, 520, 38],
  ['Sample Garlic Chicken Stir Fry', ['chicken breast', 'garlic', 'soy sauce', 'onion', 'bell pepper', 'rice'], [], 1.9, 30, 420, 31],
  ['Sample Lime Chicken Tacos', ['chicken thigh', 'lime', 'tortilla', 'cabbage', 'sour cream', 'cumin'], ['chicken'], 2.4, 30, 480, 33],
  ['Sample Beef and Broccoli', ['ground beef', 'broccoli', 'soy sauce', 'garlic', 'ginger', 'rice'], ['beef'], 2.6, 25, 560, 34],
  ['Sample Beef Chili', ['ground beef', 'kidney bean', 'diced tomato', 'onion', 'chili powder', 'cumin'], ['beef'], 1.8, 50, 470, 30],
  ['Sample Pork Carnitas Bowls', ['pork shoulder', 'orange', 'onion', 'rice', 'black bean', 'cumin'], ['pork'], 2.2, 180, 610, 36],
  ['Sample Sausage Pasta Bake', ['italian sausage', 'pasta', 'marinara', 'mozzarella', 'spinach', 'onion'], [], 2.0, 45, 640, 29],
  ['Sample Lentil Soup', ['lentil', 'carrot', 'celery', 'onion', 'vegetable broth', 'cumin'], ['veg'], 0.9, 50, 310, 17],
  ['Sample Black Bean Burritos', ['black bean', 'rice', 'tortilla', 'cheddar', 'salsa', 'onion'], ['veg', 'noreheat'], 1.3, 30, 540, 21],
  ['Sample Chickpea Curry', ['chickpea', 'coconut milk', 'onion', 'garlic', 'ginger', 'curry powder'], ['veg'], 1.4, 35, 450, 14],
  ['Sample Shrimp Fried Rice', ['shrimp', 'rice', 'egg', 'pea', 'soy sauce', 'green onion'], [], 2.9, 25, 430, 27],
  ['Sample Salmon and Potatoes', ['salmon', 'potato', 'lemon', 'garlic', 'dill', 'olive oil'], [], 4.1, 40, 520, 35],
  ['Sample Turkey Meatballs', ['ground turkey', 'breadcrumb', 'egg', 'parmesan', 'marinara', 'pasta'], ['chicken'], 2.3, 40, 590, 37],
  ['Sample Greek Chicken Salad', ['chicken breast', 'cucumber', 'tomato', 'feta', 'red onion', 'lemon'], ['chicken', 'noreheat'], 2.8, 30, 410, 34],
  ['Sample Peanut Noodles', ['spaghetti', 'peanut butter', 'soy sauce', 'carrot', 'cabbage', 'green onion'], ['veg', 'noreheat'], 1.2, 20, 490, 16],
  ['Sample Sweet Potato Chili', ['sweet potato', 'black bean', 'diced tomato', 'onion', 'chili powder', 'cumin'], ['veg'], 1.1, 45, 360, 13],
  ['Sample Teriyaki Chicken', ['chicken thigh', 'soy sauce', 'brown sugar', 'garlic', 'ginger', 'rice'], ['chicken'], 1.7, 30, 530, 32],
  ['Sample Pork Fried Rice', ['pork chop', 'rice', 'egg', 'pea', 'carrot', 'soy sauce'], ['pork'], 1.6, 30, 500, 26],
  ['Sample Spinach Pasta', ['pasta', 'spinach', 'cream cheese', 'garlic', 'parmesan', 'diced tomato'], [], 1.2, 25, 460, 15],
  ['Sample Beef Stew', ['beef chuck', 'potato', 'carrot', 'onion', 'beef broth', 'tomato paste'], [], 3.1, 120, 480, 33],
  ['Sample Egg Roll Bowls', ['ground pork', 'cabbage', 'carrot', 'soy sauce', 'ginger', 'garlic'], ['pork'], 1.5, 20, 380, 24],
  ['Sample Veggie Enchiladas', ['tortilla', 'black bean', 'zucchini', 'enchilada sauce', 'cheddar', 'corn'], ['veg'], 1.4, 45, 470, 18],
  ['Sample Chicken Noodle Soup', ['chicken breast', 'egg noodle', 'carrot', 'celery', 'onion', 'chicken broth'], [], 1.6, 40, 330, 26],
  ['Sample Tuna Pasta Salad', ['pasta', 'tuna', 'celery', 'mayonnaise', 'red onion', 'pea'], ['noreheat'], 1.3, 20, 420, 24],
];
const BREAKFASTS = [
  ['Sample Egg Muffins', ['egg', 'spinach', 'cheddar', 'bell pepper'], ['breakfast', 'noreheat'], 0.8, 30, 210, 15],
  ['Sample Overnight Oats', ['oat', 'milk', 'yogurt', 'banana', 'honey'], ['breakfast', 'noreheat'], 0.9, 10, 330, 14],
  ['Sample Breakfast Burritos', ['egg', 'tortilla', 'potato', 'cheddar', 'salsa'], ['breakfast'], 1.4, 40, 420, 20],
  ['Sample Banana Pancakes', ['flour', 'banana', 'egg', 'milk', 'baking powder'], [], 0.6, 25, 300, 9],
  ['Sample Yogurt Parfaits', ['yogurt', 'granola', 'blueberry', 'honey'], ['breakfast', 'noreheat'], 1.3, 5, 280, 13],
  ['Sample Sausage Egg Bake', ['breakfast sausage', 'egg', 'bread', 'milk', 'cheddar'], ['breakfast'], 1.2, 55, 390, 22],
  ['Sample Baked Oatmeal', ['oat', 'milk', 'egg', 'apple', 'cinnamon'], ['breakfast'], 0.7, 45, 290, 10],
  ['Sample Veggie Frittata', ['egg', 'zucchini', 'onion', 'feta', 'spinach'], [], 1.1, 35, 240, 16],
];
const SIDES = [
  ['Sample Roasted Broccoli', ['broccoli', 'olive oil', 'garlic', 'parmesan'], [], 0.7, 25, 110, 5],
  ['Sample Cilantro Lime Rice', ['rice', 'lime', 'cilantro', 'butter'], [], 0.4, 25, 190, 3],
  ['Sample Cucumber Salad', ['cucumber', 'red onion', 'rice vinegar', 'sesame oil'], [], 0.6, 10, 60, 1],
  ['Sample Roasted Potatoes', ['potato', 'olive oil', 'garlic', 'rosemary'], [], 0.5, 40, 170, 3],
  ['Sample Garlic Green Beans', ['green bean', 'garlic', 'butter', 'lemon'], [], 0.8, 15, 90, 2],
  ['Sample Black Bean Salad', ['black bean', 'corn', 'bell pepper', 'lime', 'cilantro'], ['veg', 'noreheat'], 0.9, 15, 200, 9],
  ['Sample Coleslaw', ['cabbage', 'carrot', 'mayonnaise', 'apple cider vinegar'], [], 0.5, 10, 140, 1],
  ['Sample Garlic Bread', ['bread', 'butter', 'garlic', 'parsley'], [], 0.4, 15, 180, 4],
];

export function makeRecipes() {
  let id = 900001;
  const toRecipe = (course) => ([title, keys, prep, perServing, minutes, cal, prot], i) => {
    const r = {
      id: id++,
      title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      course,
      perServing,
      total: Math.round(perServing * 4 * 100) / 100,
      stars: 4.5 + (i % 5) / 10,
      ratings: 40 + i * 13,
      minutes,
      servings: 4,
      thumb: `sample-${i}-160x160.jpg`,
      image: `sample-${i}-400x300.jpg`,
      keys,
      nutrition: [cal, prot, 40, 14],
    };
    if (prep.length) {
      r.mp = 1;
      r.prep = prep.filter((t) => t !== 'mp');
    }
    return r;
  };
  const pool = [...MAINS.map(toRecipe('main')), ...BREAKFASTS.map(toRecipe('breakfast')), ...SIDES.map(toRecipe('side'))];
  // this week: 18 mains, 6 breakfasts, 6 sides; the second pick is the 420-calorie stir fry
  const mains = pool.filter((r) => r.course === 'main');
  const picks = [mains[0], mains[1], ...mains.slice(2, 18), ...pool.filter((r) => r.course === 'breakfast').slice(0, 6), ...pool.filter((r) => r.course === 'side').slice(0, 6)].map((r) => ({
    ...r,
    servingsUnit: 'servings',
    lines: r.keys.map((k, j) => ({ t: `${j + 1} cup ${k}`, k })),
  }));
  const freq = new Map();
  pool.forEach((r) => r.keys.forEach((k) => freq.set(k, (freq.get(k) || 0) + 1)));
  return {
    generated: new Date().toISOString(),
    week: '2026-W40',
    site: 'https://recipes.test',
    uploads: 'https://img.test/r/',
    source: { name: 'Budget Bytes', ok: true, recipes: 500, popular: pool.length, mealPrep: pool.filter((r) => r.mp).length },
    picks,
    pool,
    common: [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
    history: [{ week: '2026-W40', ids: picks.map((r) => r.id) }],
  };
}
