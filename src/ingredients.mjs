// Ingredient names → comparable keys, shared by the weekly recipe job (scripts/fetch-recipes.mjs)
// and the Cooking tab. "2 cloves garlic, minced", "Garlic" and "garlic cloves" all become "garlic",
// so what you type into the kitchen list lines up with what recipes ask for.
// Plain ES module with no imports: Node runs it directly and esbuild bundles it.

const UNICODE_FRAC = /[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g;

// Units and containers dropped from the front of a line ("2 Tbsp", "1 15oz. can", "a pinch of").
const UNITS = new Set(
  (
    'cup cups c tbsp tbs tablespoon tablespoons tsp teaspoon teaspoons oz ounce ounces lb lbs pound pounds g gram grams kg ml l liter liters ' +
    'quart quarts qt pint pints gallon can cans jar jars package packages pkg bag bags box boxes bunch bunches head heads stalk stalks ' +
    'sprig sprigs pinch pinches dash dashes slice slices stick sticks piece pieces handful handfuls container containers bottle block ' +
    'fillet fillets link links sheet sheets envelope packet packets loaf loaves ear ears scoop scoops drop drops splash cube cubes'
  ).split(' ')
);

// Words that describe preparation or size rather than what the thing is.
const SOFT = new Set(
  (
    'fresh freshly large medium small extra jumbo boneless skinless bone-in skin-on lean extra-lean organic raw cooked uncooked ripe ' +
    'frozen canned chopped minced sliced shredded grated crumbled cubed peeled softened melted packed heaping thinly finely roughly ' +
    'coarsely unsalted salted low-sodium reduced-sodium sodium low reduced plain kosher sea all-purpose all purpose dried dry ' +
    'warm cold boiling room temperature your choice cracked prepared homemade store-bought storebought optional divided halved quartered ' +
    'trimmed rinsed drained seeded stemmed pitted deveined thawed toasted roasted mild sharp good quality favorite any color ' +
    'bite-sized bite sized fat-free lowfat low-fat nonfat full-fat whole-milk unsweetened sweetened pure light heavy-duty ' +
    'diced crushed baby natural natural-style creamy smooth split firm extra-firm silken thick-cut thin-cut center-cut'
  ).split(' ')
);

// Whole-phrase rewrites, checked after cleanup (keys and values are singular).
const PHRASES = [
  [/^(green|spring) onion$|^scallion$/, 'green onion'],
  [/^(yellow|white|sweet|vidalia|spanish) onion$/, 'onion'],
  [/^(red|green|yellow|orange) bell pepper$|^bell pepper$/, 'bell pepper'],
  [/^(red|green|yellow|orange) pepper$/, 'bell pepper'],
  [/^(crushed red pepper|crushed red pepper flake|red pepper flake|chili flake|red chili flake|chile flake)$/, 'red pepper flake'],
  [/^(garlic clove|clove garlic|clove of garlic|garlic head|head garlic)$/, 'garlic'],
  [/^(black pepper|ground black pepper|pepper|salt and pepper|salt pepper|salt & pepper|black peppercorn|peppercorn)$/, 'black pepper'],
  [/^(table salt|sea salt|kosher salt|salt|coarse salt|flaky salt|flaky sea salt)$/, 'salt'],
  [/^(extra virgin olive oil|extra-virgin olive oil|virgin olive oil|olive oil)$/, 'olive oil'],
  [/^(high heat |neutral |mild )?(cooking|vegetable|canola|neutral|baking|frying|sunflower|grapeseed|avocado|peanut)? ?oil$/, 'cooking oil'],
  [/^(non-stick|nonstick|non stick)? ?(cooking )?spray$/, 'cooking spray'],
  [/^(white sugar|granulated sugar|cane sugar|sugar)$/, 'sugar'],
  [/^(light brown sugar|dark brown sugar|brown sugar)$/, 'brown sugar'],
  [/^(flour|white flour|plain flour|wheat flour|unbleached flour)$/, 'flour'],
  [/^(cornstarch|corn starch)$/, 'cornstarch'],
  [/^(long[- ]grain )?(white |jasmine |basmati )?rice$/, 'rice'],
  [/^(long[- ]grain )?brown rice$/, 'brown rice'],
  [/^(whole milk|2% milk|skim milk|milk of choice|milk)$/, 'milk'],
  [/^(heavy cream|heavy whipping cream|whipping cream)$/, 'heavy cream'],
  [/^(egg|egg yolk|egg white)$/, 'egg'],
  [/^(parmesan|parmesan cheese|parmigiano reggiano|parmigiano-reggiano|parmigiano)$/, 'parmesan'],
  [/^(cheddar|cheddar cheese|extra cheddar|cheddar jack)$/, 'cheddar'],
  [/^(mozzarella|mozzarella cheese|part-skim mozzarella|part skim mozzarella)$/, 'mozzarella'],
  [/^(feta|feta cheese)$/, 'feta'],
  [/^(whole milk )?ricotta( cheese)?$/, 'ricotta'],
  [/^(monterey jack|monterey jack cheese|jack cheese)$/, 'monterey jack'],
  [/^(pepper jack|pepper jack cheese)$/, 'pepper jack'],
  [/^(cream cheese|neufchatel)$/, 'cream cheese'],
  [/^(greek yogurt|yogurt)$/, 'greek yogurt'],
  [/^(lime|lime juice|lime zest|juice of lime|lime wedge)$/, 'lime'],
  [/^(lemon|lemon juice|lemon zest|juice of lemon|lemon wedge)$/, 'lemon'],
  [/^(cilantro|coriander leaf|cilantro leaf)$/, 'cilantro'],
  [/^(parsley|flat-leaf parsley|italian parsley|flat leaf parsley|italian flat leaf parsley)$/, 'parsley'],
  [/^(ginger|ginger root|grated ginger)$/, 'ginger'],
  [/^(garbanzo bean|chickpea)$/, 'chickpea'],
  [/^(black-eyed|black eyed) pea$/, 'black-eyed pea'],
  [/^(cremini|baby bella|bella|white|button|white button)? ?mushroom$/, 'mushroom'],
  [/^(chicken stock|chicken broth|chicken bone broth)$/, 'chicken broth'],
  [/^(vegetable stock|vegetable broth|veggie broth)$/, 'vegetable broth'],
  [/^(beef stock|beef broth)$/, 'beef broth'],
  [/^(soy sauce|tamari|shoyu)$/, 'soy sauce'],
  [/^sriracha( sauce| hot sauce)?$/, 'sriracha'],
  [/^(chipotle|chipotle pepper|chipotle in adobo|chipotle pepper in adobo|chipotle in adobo sauce|chipotle pepper in adobo sauce)$/, 'chipotle in adobo'],
  [/^(hass avocado|avocado)$/, 'avocado'],
  [/^(jalapeno|jalapeño|jalapeno pepper|jalapeño pepper)$/, 'jalapeño'],
  [/^italian (seasoning|herb)( blend)?$/, 'italian seasoning'],
  [/^cayenne( pepper)?$/, 'cayenne'],
  [/^bay lea(f|ve)$/, 'bay leaf'],
  [/^(tomato sauce|canned tomato sauce)$/, 'tomato sauce'],
  [/^(fire |fire-roasted )?(petite )?diced tomato$/, 'diced tomato'],
  [/^sun(-dried)? tomato$/, 'sun-dried tomato'],
  [/^(roma|plum|vine|vine-ripe|beefsteak|slicing) tomato$/, 'tomato'],
  [/^(grape|cherry) tomato$/, 'cherry tomato'],
  [/^(russet|yukon gold|gold|yellow|red|white|new|golden) potato$/, 'potato'],
  [/^(green )?cabbage$/, 'cabbage'],
  [/^(broccoli|broccoli floret|broccoli crown)$/, 'broccoli'],
  [/^(corn|corn kernel|sweet corn)$/, 'corn'],
  [/^(cut leaf |leaf |chopped )?spinach$/, 'spinach'],
  [/^(old[- ]fashioned )?(rolled |quick |quick-cooking )?oat$/, 'oat'],
  [/^(wide |extra wide )?egg noodle$/, 'egg noodle'],
  [/^(sweet |mild |hot )?italian sausage$/, 'italian sausage'],
  [/^(chunk |solid )?(light |white )?tuna$/, 'tuna'],
  [/^(full fat |lite )?coconut milk$/, 'coconut milk'],
  [/^pineapple( chunk| tidbit| ring)?$/, 'pineapple'],
  [/^(penne|rotini|rigatoni|farfalle|bow tie|bowtie|ziti|fusilli|shell|medium shell|elbow macaroni|elbow|macaroni|spaghetti|linguine|fettuccine|angel hair|campanelle|cavatappi|gemelli|orecchiette|bucatini|pasta|short pasta|long pasta)( pasta| noodle)?$/, 'pasta'],
  [/^(sirloin|sirloin tip|flank steak|flank|sirloin steak|skirt steak|steak)$/, 'steak'],
  [/^(chicken thigh|thigh)$/, 'chicken thigh'],
  [/^(chicken breast|breast)$/, 'chicken breast'],
  [/^(bread crumb|breadcrumb|panko|panko bread crumb|panko breadcrumb|plain bread crumb|italian bread crumb)$/, 'bread crumb'],
  [/^(tortilla|flour tortilla)$/, 'flour tortilla'],
  [/^(water|ice|ice water|hot water|boiling water|tap water)$/, 'water'],
];

// Always assumed to be in the kitchen; never counted as missing.
export const STAPLES = new Set(['salt', 'black pepper', 'water', 'cooking spray']);

const singular = (w) => {
  if (w.length <= 3) return w;
  if (/(ss|us|is|ous)$/.test(w)) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(leaves)$/.test(w)) return w.slice(0, -3) + 'f';
  if (/(tomatoes|potatoes|mangoes|avocadoes|jalapenoes)$/.test(w)) return w.slice(0, -2);
  if (/(ches|shes|xes|sses|zes)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
};

// Text cleanup that keeps the words: tags, footnote stars, parentheses, prices, notes after a comma.
export function cleanName(s) {
  return String(s || '')
    .replace(/\[\/?adjustable\]/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\*+/g, '')
    .replace(/\([^)]*\)?/g, ' ')
    .replace(/\$\d+(\.\d+)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalize(input) {
  let s = cleanName(input).toLowerCase();
  if (!s) return '';
  s = s.replace(UNICODE_FRAC, ' 1 ').replace(/[–—]/g, '-');
  // "juice of 2 limes" → "lime juice"; "zest of 1 lemon" → "lemon zest"
  s = s.replace(/^(?:the\s+)?(juice|zest)\s+(?:and\s+(?:juice|zest)\s+)?of\s+(?:\d[\d./\s-]*)?(?:a\s+|an\s+|one\s+|half\s+(?:a\s+)?)?(.+)$/, (_, what, rest) => `${rest} ${what}`);
  // Drop everything after a comma or " for " / " to taste" / " plus more" / " or ", except commas that only
  // follow describing words ("boneless, skinless chicken thighs").
  const parts = s.split(/[,;]/);
  let first = parts.shift();
  while (parts.length && first.trim().split(/\s+/).every((w) => SOFT.has(w) || /^[\d./-]*$/.test(w) || UNITS.has(w))) first += ' ' + parts.shift();
  s = first.split(/ for (?:serving|garnish|topping|dipping|the |frying|brushing)| to taste| plus more| or | \+ | \/ | in (?:water|oil|juice|syrup|brine)\b/)[0];
  s = s.replace(/[^a-z0-9%&'\-\s\u00c0-\u024f]/g, ' ');
  // Sizes like "8-inch", "15oz", "15.5 oz.", "1/2-inch".
  s = s.replace(/\b\d+(?:[./]\d+)?\s*-?\s*(?:inch|in|oz|ounce|lb|g|ml)\b\.?/g, ' ');
  let t = s.split(/\s+/).filter(Boolean);
  // Leading quantities and units: "1 1/2 cups", "2-3", "a", "an", "of".
  let changed = true;
  while (changed && t.length) {
    changed = false;
    const w = t[0];
    if (/^[\d./-]+$/.test(w) || /^\d+(?:\.\d+)?%?-?$/.test(w) || w === 'a' || w === 'an' || w === 'of' || w === 'about' || w === 'one' || w === 'two' || w === 'half' || w === 'few' || w === 'some' || w === 'x') {
      t.shift();
      changed = true;
    } else if (UNITS.has(w) && t.length > 1) {
      t.shift();
      changed = true;
    }
  }
  // "cloves" only means a unit next to garlic ("3 cloves garlic", "garlic cloves").
  if (t.includes('garlic')) t = t.filter((w) => w !== 'clove' && w !== 'cloves');
  // Keep "ground" for meats ("ground beef"), drop it for spices ("ground cumin" → "cumin").
  const MEATS = /^(beef|turkey|pork|chicken|lamb|sausage|bison|veal)s?$/;
  t = t.filter((w, i) => (w === 'ground' ? MEATS.test(t[i + 1] || '') : true));
  // "diced tomatoes" and "crushed tomatoes" are canned products; keep those words there.
  // "whole" matters for whole wheat and a whole chicken, not for "whole bay leaves".
  t = t.filter((w, i) => (w === 'whole' ? /^(wheat|grain|chicken|turkey|milk)$/.test(t[i + 1] || '') : true));
  const keepPrep = (w, i) => (w === 'diced' && /^tomato/.test(t[i + 1] || '')) || (w === 'crushed' && /^(tomato|red)/.test(t[i + 1] || ''));
  t = t.filter((w, i) => keepPrep(w, i) || !SOFT.has(w));
  t = t.filter((w) => !['and', 'of', 'the', 'in', 'with'].includes(w));
  t = t.map(singular);
  let key = t.join(' ').replace(/\s+/g, ' ').trim();
  // "adobo" lines ("chipotles in adobo") lost their "in" above; put it back for the phrase table.
  key = key.replace(/^chipotle(?: pepper)? adobo(?: sauce)?$/, 'chipotle in adobo');
  for (const [re, to] of PHRASES) {
    if (re.test(key)) {
      key = to;
      break;
    }
  }
  return key;
}

const head = (k) => k.split(' ').slice(-1)[0];
const CUTS = new Set(['thigh', 'breast', 'leg', 'drumstick', 'wing', 'tender', 'tenderloin', 'chop', 'loin', 'shoulder']);

// Does something in the kitchen (key a) cover what a recipe asks for (key b)?
export function covers(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const A = a.split(' ');
  const B = b.split(' ');
  // Recipe is less specific than what you have: recipe "onion", kitchen "red onion".
  if (head(a) === head(b) && B.every((w) => A.includes(w))) return true;
  // Kitchen says "chicken", recipe wants "chicken thigh".
  if (A.length === 1 && B.length === 2 && B[0] === A[0] && CUTS.has(B[1])) return true;
  return false;
}

// Split a recipe's ingredient keys into have / missing against the kitchen list.
export function matchRecipe(keys, kitchenKeys, staples = STAPLES) {
  const have = [];
  const missing = [];
  const seen = new Set();
  for (const k of keys) {
    if (!k || seen.has(k)) continue;
    seen.add(k);
    if (staples.has(k)) continue;
    if (kitchenKeys.some((a) => covers(a, k))) have.push(k);
    else missing.push(k);
  }
  const total = have.length + missing.length;
  return { have, missing, total, ratio: total ? have.length / total : 0 };
}

// Rough home for a new kitchen item, used when groceries are put away or common items are tapped.
const PANTRY = /(broth|stock|bouillon|sauce|paste|vinegar|oil|flour|sugar|rice|pasta|bean|lentil|noodle|cracker|chip|cereal|oat|bread crumb|peanut butter|almond butter|coconut milk|evaporated milk|condensed milk|honey|syrup|diced tomato|crushed tomato|canned|onion|red onion|garlic|potato|sweet potato|bread|tortilla chip|ketchup|mustard|cornstarch|baking powder|baking soda|yeast|vanilla|cocoa|chocolate chip|nut|raisin|quinoa|couscous|salsa verde)$/;
const SPICES = /(powder|paprika|cumin|oregano|thyme|basil|rosemary|cinnamon|nutmeg|cayenne|curry|seasoning|bay leaf|red pepper flake|allspice|clove|coriander|turmeric|garam masala|sage|dill|marjoram|seed|black pepper|salt|spice)$/;
const FRIDGE = /\b(milk|cream|butter|cheese|cheddar|mozzarella|parmesan|feta|jack|ricotta|yogurt|egg|bacon|ham|chicken|beef|pork|turkey|sausage|steak|shrimp|salmon|fish|tofu|lettuce|spinach|kale|cilantro|parsley|green onion|celery|carrot|cucumber|zucchini|broccoli|cauliflower|cabbage|mushroom|bell pepper|jalapeño|lime|lemon|berry|strawberry|grape|mayonnaise|mayo|salsa|hummus|pesto|tortilla|ginger|kimchi|bok choy|green bean|asparagus|chorizo|pepperoni|hot dog|deli)\b/;
export function guessWhere(name) {
  const raw = String(name || '').trim().toLowerCase();
  const k = normalize(name);
  if (/^frozen\b/.test(raw) || /\b(ice cream|frozen)\b/.test(raw)) return 'freezer';
  if (k === 'green onion' || k === 'avocado') return 'fridge';
  if (PANTRY.test(k)) return 'pantry';
  if (SPICES.test(k)) return 'spices';
  if (FRIDGE.test(k)) return 'fridge';
  return 'pantry';
}
