-- Seed: canonical ingredients + the starter recipe catalogue.
--
-- All recipe text is ORIGINAL work written for this app (CLAUDE.md §16). The
-- dishes are common high-protein meal concepts — a chicken rice bowl is not
-- copyrightable — but every description and instruction here was authored
-- fresh, and `source` says so.
--
-- Per-serving macros are authored estimates from standard ingredient data,
-- rounded to honest precision. They are starting points, not lab analyses.
--
-- Idempotency: seeded recipes are deleted (children cascade) and re-inserted;
-- ingredients upsert on slug. Users' logged history is unaffected — deleting a
-- recipe sets food_entries.recipe_id to null and the macro snapshot survives.
--
-- Run as the service role (supabase db reset / psql). RLS write policies
-- intentionally do not allow clients to touch this catalogue.

-- ---------------------------------------------------------------------------
-- Ingredients
-- ---------------------------------------------------------------------------

insert into public.ingredients (slug, name, category, default_unit, density_g_per_ml, package_sizes, allergens) values
  ('oats',               'Rolled oats',            'carbs',      'g',   null, '{500,1000}', '{}'),
  ('whey_protein',       'Whey protein powder',    'dairy',      'g',   null, '{1000}',     '{milk}'),
  ('vegan_protein',      'Vegan protein powder',   'other',      'g',   null, '{1000}',     '{soy}'),
  ('egg',                'Eggs',                   'eggs',       'piece', null, '{6,10,12}', '{eggs}'),
  ('banana',             'Banana',                 'fruit',      'piece', null, '{}',        '{}'),
  ('baking_powder',      'Baking powder',          'spices',     'tsp', null, '{}',         '{}'),
  ('skyr',               'Skyr',                   'dairy',      'g',   null, '{450,1000}', '{milk}'),
  ('quark',              'Quark',                  'dairy',      'g',   null, '{250,500}',  '{milk}'),
  ('greek_yogurt',       'Greek yogurt',           'dairy',      'g',   null, '{500,1000}', '{milk}'),
  ('cottage_cheese',     'Cottage cheese',         'dairy',      'g',   null, '{300}',      '{milk}'),
  ('milk',               'Milk',                   'dairy',      'ml',  1.03, '{1000}',     '{milk}'),
  ('soy_milk',           'Soy milk',               'other',      'ml',  1.03, '{1000}',     '{soy}'),
  ('cheddar',            'Cheddar',                'dairy',      'g',   null, '{200,400}',  '{milk}'),
  ('mixed_berries',      'Mixed berries (frozen)', 'frozen',     'g',   null, '{400,750}',  '{}'),
  ('pineapple',          'Pineapple chunks',       'fruit',      'g',   null, '{}',         '{}'),
  ('lemon',              'Lemon',                  'fruit',      'piece', null, '{}',       '{}'),
  ('lime',               'Lime',                   'fruit',      'piece', null, '{}',       '{}'),
  ('honey',              'Honey',                  'other',      'g',   1.42, '{}',         '{}'),
  ('flaked_almonds',     'Flaked almonds',         'other',      'g',   null, '{100,200}',  '{tree_nuts}'),
  ('walnuts',            'Walnuts',                'other',      'g',   null, '{100,200}',  '{tree_nuts}'),
  ('peanut_butter',      'Peanut butter',          'other',      'g',   null, '{350,500}',  '{peanuts}'),
  ('chia_seeds',         'Chia seeds',             'other',      'g',   null, '{250}',      '{}'),
  ('cocoa_powder',       'Cocoa powder',           'other',      'g',   null, '{125,250}',  '{}'),
  ('tortilla_wrap',      'Tortilla wraps',         'carbs',      'piece', null, '{6,8}',    '{wheat}'),
  ('burger_bun',         'Burger buns',            'carbs',      'piece', null, '{4}',      '{wheat}'),
  ('breadcrumbs',        'Breadcrumbs',            'carbs',      'g',   null, '{}',         '{wheat}'),
  ('pasta',              'Pasta',                  'carbs',      'g',   null, '{500,1000}', '{wheat}'),
  ('basmati_rice',       'Basmati rice',           'carbs',      'g',   null, '{500,1000}', '{}'),
  ('quinoa',             'Quinoa',                 'carbs',      'g',   null, '{500}',      '{}'),
  ('cornflour',          'Cornflour',              'carbs',      'g',   null, '{}',         '{}'),
  ('chicken_breast',     'Chicken breast',         'meat_fish',  'g',   null, '{300,500,1000}', '{}'),
  ('turkey_mince',       'Turkey mince',           'meat_fish',  'g',   null, '{500}',      '{}'),
  ('lean_beef_mince',    'Lean beef mince (5%)',   'meat_fish',  'g',   null, '{500}',      '{}'),
  ('sirloin_steak',      'Sirloin steak',          'meat_fish',  'g',   null, '{}',         '{}'),
  ('salmon_fillet',      'Salmon fillets',         'meat_fish',  'g',   null, '{240,480}',  '{fish}'),
  ('tinned_tuna',        'Tinned tuna (in water)', 'canned',     'g',   null, '{145,400}',  '{fish}'),
  ('tofu',               'Firm tofu',              'other',      'g',   null, '{280,400}',  '{soy}'),
  ('chickpeas',          'Chickpeas (tinned)',     'canned',     'g',   null, '{400}',      '{}'),
  ('black_beans',        'Black beans (tinned)',   'canned',     'g',   null, '{400}',      '{}'),
  ('sweetcorn',          'Sweetcorn (tinned)',     'canned',     'g',   null, '{198,340}',  '{}'),
  ('salsa',              'Tomato salsa',           'canned',     'g',   1.0,  '{300}',      '{}'),
  ('light_coconut_milk', 'Light coconut milk',     'canned',     'ml',  1.0,  '{400}',      '{}'),
  ('curry_paste',        'Curry paste',            'spices',     'g',   null, '{}',         '{}'),
  ('soy_sauce',          'Soy sauce',              'spices',     'ml',  1.15, '{}',         '{soy,wheat}'),
  ('tahini',             'Tahini',                 'other',      'g',   null, '{300}',      '{sesame}'),
  ('olive_oil',          'Olive oil',              'other',      'tbsp', 0.92, '{}',        '{}'),
  ('spinach',            'Spinach',                'vegetables', 'g',   null, '{}',         '{}'),
  ('broccoli',           'Broccoli',               'vegetables', 'g',   null, '{}',         '{}'),
  ('green_beans',        'Green beans',            'vegetables', 'g',   null, '{}',         '{}'),
  ('baby_potatoes',      'Baby potatoes',          'vegetables', 'g',   null, '{750,1000}', '{}'),
  ('bell_pepper',        'Bell pepper',            'vegetables', 'piece', null, '{3}',      '{}'),
  ('courgette',          'Courgette',              'vegetables', 'piece', null, '{}',       '{}'),
  ('cucumber',           'Cucumber',               'vegetables', 'piece', null, '{}',       '{}'),
  ('lettuce',            'Lettuce',                'vegetables', 'piece', null, '{}',       '{}'),
  ('tomato',             'Tomato',                 'vegetables', 'piece', null, '{}',       '{}'),
  ('red_onion',          'Red onion',              'vegetables', 'piece', null, '{}',       '{}'),
  ('onion',              'Onion',                  'vegetables', 'piece', null, '{}',       '{}'),
  ('garlic',             'Garlic',                 'vegetables', 'clove', null, '{}',       '{}'),
  ('salt',               'Salt',                   'spices',     'tsp', null, '{}',         '{}'),
  ('black_pepper',       'Black pepper',           'spices',     'tsp', null, '{}',         '{}'),
  ('paprika',            'Smoked paprika',         'spices',     'tsp', null, '{}',         '{}')
on conflict (slug) do update
  set name = excluded.name,
      category = excluded.category,
      default_unit = excluded.default_unit,
      allergens = excluded.allergens;

-- ---------------------------------------------------------------------------
-- Recipes: delete-and-reseed for idempotency
-- ---------------------------------------------------------------------------

delete from public.recipes where slug in (
  'protein_pancakes', 'skyr_berry_bowl', 'overnight_protein_oats',
  'egg_breakfast_wrap', 'vegan_smoothie_bowl',
  'chicken_rice_bowl', 'beef_burrito_bowl', 'quick_chicken_curry',
  'chickpea_quinoa_bowl', 'tuna_pasta_salad',
  'salmon_roast_potatoes', 'turkey_burgers', 'steak_veg_bowl',
  'creamy_protein_pasta', 'tofu_stir_fry',
  'banana_protein_shake', 'chocolate_protein_pudding',
  'cottage_cheese_pineapple', 'protein_mug_cake', 'greek_yogurt_walnut_bowl'
);

insert into public.recipes
  (slug, title, description, meal_type, prep_minutes, cook_minutes, difficulty, servings,
   calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving, fiber_per_serving,
   dietary_tags, allergens, meal_prep_rating, cost_band, source, is_public)
values
  -- Breakfast ---------------------------------------------------------------
  ('protein_pancakes', 'Protein Pancakes',
   'Oat-and-whey pancakes with a whole banana in the batter — a full breakfast that eats like a treat.',
   'breakfast', 10, 10, 'easy', 1, 480, 40, 55, 10, 6,
   '{high_protein,vegetarian}', '{milk,eggs}', 1, 1, 'original', true),

  ('skyr_berry_bowl', 'Skyr Berry Bowl',
   'A big bowl of skyr with warm berries and toasted almonds. Five minutes, a third of a day''s protein.',
   'breakfast', 5, 0, 'easy', 1, 330, 34, 38, 5, 5,
   '{high_protein,vegetarian,under_15_min,cut_friendly,low_calorie}', '{milk,tree_nuts}', 0, 1, 'original', true),

  ('overnight_protein_oats', 'Overnight Protein Oats',
   'Mix tonight, eat tomorrow. Oats, whey and chia set into a pudding in the fridge — the meal-prep breakfast.',
   'breakfast', 10, 0, 'easy', 1, 450, 36, 48, 12, 9,
   '{high_protein,vegetarian,meal_prep}', '{milk}', 3, 1, 'original', true),

  ('egg_breakfast_wrap', 'Egg & Spinach Breakfast Wrap',
   'Soft scrambled eggs, wilted spinach and melted cheddar rolled into a warm tortilla.',
   'breakfast', 5, 8, 'easy', 1, 460, 29, 32, 23, 4,
   '{high_protein,vegetarian,under_15_min}', '{eggs,milk,wheat}', 1, 1, 'original', true),

  ('vegan_smoothie_bowl', 'Vegan Protein Smoothie Bowl',
   'Frozen berries, banana and pea protein blended thick, topped with oats and peanut butter.',
   'breakfast', 8, 0, 'easy', 1, 470, 31, 56, 13, 9,
   '{high_protein,vegan,vegetarian,under_15_min}', '{soy,peanuts}', 0, 2, 'original', true),

  -- Lunch -------------------------------------------------------------------
  ('chicken_rice_bowl', 'Chicken Rice Bowl',
   'The meal-prep classic: seasoned chicken, fluffy rice and charred broccoli. Cooks in bulk without complaint.',
   'lunch', 10, 25, 'easy', 2, 560, 49, 62, 9, 5,
   '{high_protein,meal_prep,bulk_friendly,budget}', '{soy}', 3, 1, 'original', true),

  ('beef_burrito_bowl', 'Beef Burrito Bowl',
   'Lean beef with smoky paprika, black beans, corn and salsa over rice. Burrito flavour, fork format.',
   'lunch', 10, 20, 'easy', 2, 590, 44, 58, 17, 11,
   '{high_protein,meal_prep,bulk_friendly}', '{}', 3, 2, 'original', true),

  ('quick_chicken_curry', 'Quick Chicken Curry',
   'Chicken simmered in curry paste and light coconut milk. One pan, twenty-five minutes, keeps for days.',
   'lunch', 10, 25, 'easy', 2, 540, 42, 55, 14, 4,
   '{high_protein,meal_prep}', '{}', 3, 2, 'original', true),

  ('chickpea_quinoa_bowl', 'Roasted Chickpea & Quinoa Bowl',
   'Crispy spiced chickpeas over quinoa with cucumber and a lemon-tahini dressing. Plant-based and filling.',
   'lunch', 10, 30, 'easy', 2, 520, 22, 68, 16, 13,
   '{vegan,vegetarian,budget,cut_friendly}', '{sesame}', 2, 1, 'original', true),

  ('tuna_pasta_salad', 'Tuna Pasta Salad',
   'Pasta, tuna and crunchy vegetables in a lemony yogurt dressing. Cold lunch that actually holds protein.',
   'lunch', 15, 10, 'easy', 2, 480, 38, 52, 12, 5,
   '{high_protein,pescatarian,cut_friendly,budget}', '{fish,wheat,milk}', 2, 1, 'original', true),

  -- Dinner ------------------------------------------------------------------
  ('salmon_roast_potatoes', 'Salmon with Roast Potatoes & Greens',
   'Roasted salmon fillet with crispy baby potatoes and green beans. A proper dinner with no fuss.',
   'dinner', 10, 30, 'easy', 2, 570, 39, 45, 24, 7,
   '{high_protein,pescatarian}', '{fish}', 1, 3, 'original', true),

  ('turkey_burgers', 'Turkey Burgers',
   'Juicy turkey patties seasoned with paprika and garlic, stacked with lettuce and tomato in a toasted bun.',
   'dinner', 15, 12, 'medium', 2, 520, 41, 40, 20, 3,
   '{high_protein}', '{wheat,eggs}', 1, 2, 'original', true),

  ('steak_veg_bowl', 'Steak & Charred Veg Bowl',
   'Sliced sirloin over rice with charred peppers and courgette. Weeknight-fast, weekend-good.',
   'dinner', 10, 15, 'medium', 2, 560, 46, 48, 19, 6,
   '{high_protein,bulk_friendly}', '{}', 1, 3, 'original', true),

  ('creamy_protein_pasta', 'Creamy Chicken Protein Pasta',
   'Pasta in a silky quark sauce with seared chicken — the texture of a cream sauce at a fraction of the fat.',
   'dinner', 10, 20, 'easy', 2, 610, 52, 68, 12, 5,
   '{high_protein,protein_50,bulk_friendly}', '{wheat,milk}', 2, 2, 'original', true),

  ('tofu_stir_fry', 'Crispy Tofu Stir-Fry',
   'Cornflour-crisped tofu tossed with vegetables and a garlic-soy glaze over rice.',
   'dinner', 15, 12, 'easy', 2, 480, 28, 52, 16, 8,
   '{vegan,vegetarian,cut_friendly}', '{soy}', 2, 1, 'original', true),

  -- Snacks ------------------------------------------------------------------
  ('banana_protein_shake', 'Banana Protein Shake',
   'Whey, milk and a banana. The fastest 33 grams of protein you will drink today.',
   'snack', 5, 0, 'easy', 1, 320, 33, 34, 6, 2,
   '{high_protein,vegetarian,under_15_min}', '{milk}', 0, 1, 'original', true),

  ('chocolate_protein_pudding', 'Chocolate Protein Pudding',
   'Quark whipped with whey and cocoa into a thick chocolate pudding. Dessert that counts as protein.',
   'snack', 5, 0, 'easy', 1, 250, 32, 17, 5, 3,
   '{high_protein,vegetarian,under_15_min,cut_friendly,low_calorie}', '{milk}', 2, 1, 'original', true),

  ('cottage_cheese_pineapple', 'Cottage Cheese & Pineapple',
   'Sweet, salty, done in three minutes. An old-school bodybuilding snack that never stopped working.',
   'snack', 3, 0, 'easy', 1, 210, 25, 17, 5, 1,
   '{high_protein,vegetarian,under_15_min,cut_friendly,low_calorie}', '{milk}', 0, 1, 'original', true),

  ('protein_mug_cake', 'Protein Mug Cake',
   'Whey, oats, cocoa and an egg, microwaved into a warm chocolate cake in two minutes.',
   'snack', 3, 2, 'easy', 1, 280, 26, 28, 8, 4,
   '{high_protein,vegetarian,under_15_min}', '{milk,eggs}', 0, 1, 'original', true),

  ('greek_yogurt_walnut_bowl', 'Greek Yogurt & Walnut Bowl',
   'Thick Greek yogurt with honey and toasted walnuts. Simple, satisfying, and quietly high in protein.',
   'snack', 3, 0, 'easy', 1, 300, 22, 20, 14, 3,
   '{high_protein,vegetarian,under_15_min}', '{milk,tree_nuts}', 0, 1, 'original', true);

-- ---------------------------------------------------------------------------
-- Recipe ingredients
-- ---------------------------------------------------------------------------
-- Helper pattern: subselects on slugs. `is_scalable=false` marks per-batch
-- constants (oil for one pan, seasoning) that must not multiply with servings.

insert into public.recipe_ingredients (recipe_id, ingredient_id, quantity, unit, preparation_note, is_scalable, is_optional, sort_order)
select r.id, i.id, x.quantity, x.unit, x.note, x.scalable, x.optional, x.ord
from (values
  -- protein_pancakes (1 serving)
  ('protein_pancakes', 'oats',            60,  'g',     'blitzed to flour',      true,  false, 0),
  ('protein_pancakes', 'whey_protein',    30,  'g',     null,                    true,  false, 1),
  ('protein_pancakes', 'egg',             1,   'piece', null,                    true,  false, 2),
  ('protein_pancakes', 'banana',          1,   'piece', 'mashed',                true,  false, 3),
  ('protein_pancakes', 'milk',            60,  'ml',    null,                    true,  false, 4),
  ('protein_pancakes', 'baking_powder',   1,   'tsp',   null,                    false, false, 5),
  ('protein_pancakes', 'honey',           10,  'g',     'to serve',              true,  true,  6),

  -- skyr_berry_bowl (1)
  ('skyr_berry_bowl', 'skyr',            300, 'g',     null,                    true,  false, 0),
  ('skyr_berry_bowl', 'mixed_berries',   100, 'g',     'warmed briefly',        true,  false, 1),
  ('skyr_berry_bowl', 'flaked_almonds',  10,  'g',     'toasted',               true,  false, 2),
  ('skyr_berry_bowl', 'honey',           10,  'g',     null,                    true,  true,  3),

  -- overnight_protein_oats (1)
  ('overnight_protein_oats', 'oats',         50,  'g',   null,                  true,  false, 0),
  ('overnight_protein_oats', 'whey_protein', 30,  'g',   null,                  true,  false, 1),
  ('overnight_protein_oats', 'chia_seeds',   10,  'g',   null,                  true,  false, 2),
  ('overnight_protein_oats', 'milk',         200, 'ml',  null,                  true,  false, 3),
  ('overnight_protein_oats', 'mixed_berries', 80, 'g',   'for the morning',     true,  true,  4),

  -- egg_breakfast_wrap (1)
  ('egg_breakfast_wrap', 'egg',           2,  'piece', null,                    true,  false, 0),
  ('egg_breakfast_wrap', 'tortilla_wrap', 1,  'piece', null,                    true,  false, 1),
  ('egg_breakfast_wrap', 'spinach',       40, 'g',     null,                    true,  false, 2),
  ('egg_breakfast_wrap', 'cheddar',       25, 'g',     'grated',                true,  false, 3),
  ('egg_breakfast_wrap', 'olive_oil',     0.5,'tbsp',  'for the pan',           false, false, 4),
  ('egg_breakfast_wrap', 'salt',          0.25,'tsp',  null,                    false, false, 5),

  -- vegan_smoothie_bowl (1)
  ('vegan_smoothie_bowl', 'vegan_protein', 30,  'g',    null,                   true,  false, 0),
  ('vegan_smoothie_bowl', 'banana',        1,   'piece','frozen if possible',   true,  false, 1),
  ('vegan_smoothie_bowl', 'mixed_berries', 150, 'g',    'frozen',               true,  false, 2),
  ('vegan_smoothie_bowl', 'soy_milk',      150, 'ml',   null,                   true,  false, 3),
  ('vegan_smoothie_bowl', 'oats',          20,  'g',    'to top',               true,  false, 4),
  ('vegan_smoothie_bowl', 'peanut_butter', 15,  'g',    'to top',               true,  false, 5),

  -- chicken_rice_bowl (2 servings)
  ('chicken_rice_bowl', 'chicken_breast', 360, 'g',     'diced',                true,  false, 0),
  ('chicken_rice_bowl', 'basmati_rice',   150, 'g',     'dry weight',           true,  false, 1),
  ('chicken_rice_bowl', 'broccoli',       300, 'g',     'in florets',           true,  false, 2),
  ('chicken_rice_bowl', 'soy_sauce',      30,  'ml',    null,                   true,  false, 3),
  ('chicken_rice_bowl', 'garlic',         2,   'clove', 'minced',               true,  false, 4),
  ('chicken_rice_bowl', 'olive_oil',      1,   'tbsp',  'for the pan',          false, false, 5),
  ('chicken_rice_bowl', 'paprika',        1,   'tsp',   null,                   false, false, 6),

  -- beef_burrito_bowl (2)
  ('beef_burrito_bowl', 'lean_beef_mince', 300, 'g',    null,                   true,  false, 0),
  ('beef_burrito_bowl', 'basmati_rice',    120, 'g',    'dry weight',           true,  false, 1),
  ('beef_burrito_bowl', 'black_beans',     240, 'g',    'drained',              true,  false, 2),
  ('beef_burrito_bowl', 'sweetcorn',       150, 'g',    'drained',              true,  false, 3),
  ('beef_burrito_bowl', 'salsa',           150, 'g',    null,                   true,  false, 4),
  ('beef_burrito_bowl', 'lime',            1,   'piece','juiced',               true,  false, 5),
  ('beef_burrito_bowl', 'paprika',         2,   'tsp',  null,                   false, false, 6),

  -- quick_chicken_curry (2)
  ('quick_chicken_curry', 'chicken_breast',     320, 'g',  'diced',             true,  false, 0),
  ('quick_chicken_curry', 'curry_paste',        50,  'g',  null,                true,  false, 1),
  ('quick_chicken_curry', 'light_coconut_milk', 250, 'ml', null,                true,  false, 2),
  ('quick_chicken_curry', 'onion',              1,   'piece','sliced',          true,  false, 3),
  ('quick_chicken_curry', 'basmati_rice',       140, 'g',  'dry weight',        true,  false, 4),
  ('quick_chicken_curry', 'olive_oil',          1,   'tbsp','for the pan',      false, false, 5),

  -- chickpea_quinoa_bowl (2)
  ('chickpea_quinoa_bowl', 'chickpeas', 480, 'g',   'drained (two tins)',       true,  false, 0),
  ('chickpea_quinoa_bowl', 'quinoa',    120, 'g',   'dry weight',               true,  false, 1),
  ('chickpea_quinoa_bowl', 'cucumber',  1,   'piece','diced',                   true,  false, 2),
  ('chickpea_quinoa_bowl', 'tahini',    30,  'g',   null,                       true,  false, 3),
  ('chickpea_quinoa_bowl', 'lemon',     1,   'piece','juiced',                  true,  false, 4),
  ('chickpea_quinoa_bowl', 'olive_oil', 1,   'tbsp', null,                      false, false, 5),
  ('chickpea_quinoa_bowl', 'paprika',   2,   'tsp',  null,                      false, false, 6),

  -- tuna_pasta_salad (2)
  ('tuna_pasta_salad', 'pasta',        140, 'g',    'dry weight',               true,  false, 0),
  ('tuna_pasta_salad', 'tinned_tuna',  220, 'g',    'drained',                  true,  false, 1),
  ('tuna_pasta_salad', 'greek_yogurt', 100, 'g',    null,                       true,  false, 2),
  ('tuna_pasta_salad', 'cucumber',     0.5, 'piece','diced',                    true,  false, 3),
  ('tuna_pasta_salad', 'red_onion',    0.5, 'piece','finely sliced',            true,  false, 4),
  ('tuna_pasta_salad', 'sweetcorn',    100, 'g',    'drained',                  true,  false, 5),
  ('tuna_pasta_salad', 'lemon',        0.5, 'piece','juiced',                   true,  false, 6),

  -- salmon_roast_potatoes (2)
  ('salmon_roast_potatoes', 'salmon_fillet', 280, 'g',  'two fillets',          true,  false, 0),
  ('salmon_roast_potatoes', 'baby_potatoes', 500, 'g',  'halved',               true,  false, 1),
  ('salmon_roast_potatoes', 'green_beans',   200, 'g',  'trimmed',              true,  false, 2),
  ('salmon_roast_potatoes', 'lemon',         1,   'piece','in wedges',          true,  false, 3),
  ('salmon_roast_potatoes', 'olive_oil',     1.5, 'tbsp', null,                 false, false, 4),
  ('salmon_roast_potatoes', 'salt',          0.5, 'tsp',  null,                 false, false, 5),

  -- turkey_burgers (2)
  ('turkey_burgers', 'turkey_mince', 400, 'g',    null,                         true,  false, 0),
  ('turkey_burgers', 'burger_bun',   2,   'piece', null,                        true,  false, 1),
  ('turkey_burgers', 'egg',          1,   'piece', 'to bind',                   true,  false, 2),
  ('turkey_burgers', 'breadcrumbs',  30,  'g',    null,                         true,  false, 3),
  ('turkey_burgers', 'lettuce',      0.25,'piece', 'leaves separated',          true,  false, 4),
  ('turkey_burgers', 'tomato',       1,   'piece', 'sliced',                    true,  false, 5),
  ('turkey_burgers', 'garlic',       1,   'clove', 'minced',                    false, false, 6),
  ('turkey_burgers', 'paprika',      1,   'tsp',   null,                        false, false, 7),

  -- steak_veg_bowl (2)
  ('steak_veg_bowl', 'sirloin_steak', 320, 'g',    null,                        true,  false, 0),
  ('steak_veg_bowl', 'basmati_rice',  130, 'g',    'dry weight',                true,  false, 1),
  ('steak_veg_bowl', 'bell_pepper',   2,   'piece','in strips',                 true,  false, 2),
  ('steak_veg_bowl', 'courgette',     1,   'piece','in half-moons',             true,  false, 3),
  ('steak_veg_bowl', 'olive_oil',     1,   'tbsp', 'for the pan',               false, false, 4),
  ('steak_veg_bowl', 'salt',          0.5, 'tsp',  null,                        false, false, 5),

  -- creamy_protein_pasta (2)
  ('creamy_protein_pasta', 'pasta',          160, 'g',   'dry weight',          true,  false, 0),
  ('creamy_protein_pasta', 'chicken_breast', 300, 'g',   'sliced',              true,  false, 1),
  ('creamy_protein_pasta', 'quark',          200, 'g',   null,                  true,  false, 2),
  ('creamy_protein_pasta', 'spinach',        100, 'g',   null,                  true,  false, 3),
  ('creamy_protein_pasta', 'garlic',         2,   'clove','minced',             true,  false, 4),
  ('creamy_protein_pasta', 'olive_oil',      1,   'tbsp', 'for the pan',        false, false, 5),

  -- tofu_stir_fry (2)
  ('tofu_stir_fry', 'tofu',         400, 'g',    'pressed and cubed',           true,  false, 0),
  ('tofu_stir_fry', 'cornflour',    20,  'g',    'to coat',                     true,  false, 1),
  ('tofu_stir_fry', 'basmati_rice', 130, 'g',    'dry weight',                  true,  false, 2),
  ('tofu_stir_fry', 'broccoli',     200, 'g',    'small florets',               true,  false, 3),
  ('tofu_stir_fry', 'bell_pepper',  1,   'piece','in strips',                   true,  false, 4),
  ('tofu_stir_fry', 'soy_sauce',    40,  'ml',   null,                          true,  false, 5),
  ('tofu_stir_fry', 'garlic',       2,   'clove','minced',                      false, false, 6),
  ('tofu_stir_fry', 'olive_oil',    1,   'tbsp', 'for the wok',                 false, false, 7),

  -- banana_protein_shake (1)
  ('banana_protein_shake', 'whey_protein', 30,  'g',    null,                   true,  false, 0),
  ('banana_protein_shake', 'milk',         300, 'ml',   null,                   true,  false, 1),
  ('banana_protein_shake', 'banana',       1,   'piece', null,                  true,  false, 2),

  -- chocolate_protein_pudding (1)
  ('chocolate_protein_pudding', 'quark',        250, 'g', null,                 true,  false, 0),
  ('chocolate_protein_pudding', 'whey_protein', 15,  'g', 'chocolate works best', true, false, 1),
  ('chocolate_protein_pudding', 'cocoa_powder', 10,  'g', null,                 true,  false, 2),
  ('chocolate_protein_pudding', 'honey',        10,  'g', null,                 true,  true,  3),

  -- cottage_cheese_pineapple (1)
  ('cottage_cheese_pineapple', 'cottage_cheese', 250, 'g', null,                true,  false, 0),
  ('cottage_cheese_pineapple', 'pineapple',      100, 'g', null,                true,  false, 1),

  -- protein_mug_cake (1)
  ('protein_mug_cake', 'whey_protein',  25,  'g',    null,                      true,  false, 0),
  ('protein_mug_cake', 'oats',          20,  'g',    'blitzed to flour',        true,  false, 1),
  ('protein_mug_cake', 'cocoa_powder',  8,   'g',    null,                      true,  false, 2),
  ('protein_mug_cake', 'egg',           1,   'piece', null,                     true,  false, 3),
  ('protein_mug_cake', 'milk',          40,  'ml',   null,                      true,  false, 4),
  ('protein_mug_cake', 'baking_powder', 0.5, 'tsp',  null,                      false, false, 5),

  -- greek_yogurt_walnut_bowl (1)
  ('greek_yogurt_walnut_bowl', 'greek_yogurt', 250, 'g', null,                  true,  false, 0),
  ('greek_yogurt_walnut_bowl', 'walnuts',      15,  'g', 'roughly chopped',     true,  false, 1),
  ('greek_yogurt_walnut_bowl', 'honey',        15,  'g', null,                  true,  false, 2)
) as x(recipe_slug, ingredient_slug, quantity, unit, note, scalable, optional, ord)
join public.recipes r on r.slug = x.recipe_slug
join public.ingredients i on i.slug = x.ingredient_slug;

-- ---------------------------------------------------------------------------
-- Instructions
-- ---------------------------------------------------------------------------

insert into public.recipe_instructions (recipe_id, step_number, instruction)
select r.id, x.step, x.text
from (values
  ('protein_pancakes', 1, 'Blitz the oats to a rough flour, then blend with the whey, egg, mashed banana, milk and baking powder into a thick batter.'),
  ('protein_pancakes', 2, 'Cook small pancakes in a non-stick pan over medium heat, about two minutes per side, until golden.'),
  ('protein_pancakes', 3, 'Stack and finish with honey if you like.'),

  ('skyr_berry_bowl', 1, 'Warm the berries briefly in the microwave until they start to release juice.'),
  ('skyr_berry_bowl', 2, 'Spoon the skyr into a bowl, pour over the berries, and top with the toasted almonds and honey.'),

  ('overnight_protein_oats', 1, 'Stir the oats, whey and chia together in a jar, then whisk in the milk until no dry pockets remain.'),
  ('overnight_protein_oats', 2, 'Refrigerate overnight, or at least four hours.'),
  ('overnight_protein_oats', 3, 'Loosen with a splash of milk in the morning and top with berries.'),

  ('egg_breakfast_wrap', 1, 'Wilt the spinach in a lightly oiled pan, then pour in the beaten, seasoned eggs and scramble softly.'),
  ('egg_breakfast_wrap', 2, 'Warm the tortilla, pile in the eggs, scatter over the cheddar, and roll tightly.'),
  ('egg_breakfast_wrap', 3, 'Return the wrap to the pan seam-side down for a minute to seal and crisp.'),

  ('vegan_smoothie_bowl', 1, 'Blend the protein, banana, berries and soy milk until thick — it should hold a spoon upright.'),
  ('vegan_smoothie_bowl', 2, 'Scrape into a bowl and top with the oats and peanut butter.'),

  ('chicken_rice_bowl', 1, 'Cook the rice according to the packet.'),
  ('chicken_rice_bowl', 2, 'Toss the diced chicken with paprika, then sear in an oiled pan until cooked through; add the garlic and soy sauce for the final minute.'),
  ('chicken_rice_bowl', 3, 'Steam or pan-char the broccoli until just tender.'),
  ('chicken_rice_bowl', 4, 'Divide the rice between bowls or containers and top with chicken and broccoli.'),

  ('beef_burrito_bowl', 1, 'Cook the rice according to the packet.'),
  ('beef_burrito_bowl', 2, 'Brown the mince with the paprika, breaking it up as it cooks; stir in the beans and corn to heat through.'),
  ('beef_burrito_bowl', 3, 'Serve over the rice with salsa and a squeeze of lime.'),

  ('quick_chicken_curry', 1, 'Cook the rice according to the packet.'),
  ('quick_chicken_curry', 2, 'Soften the onion in an oiled pan, add the curry paste and fry for a minute until fragrant.'),
  ('quick_chicken_curry', 3, 'Add the chicken, coat well, then pour in the coconut milk and simmer 15 minutes until cooked through and thickened.'),
  ('quick_chicken_curry', 4, 'Serve over the rice.'),

  ('chickpea_quinoa_bowl', 1, 'Roast the drained chickpeas with the oil and paprika at 200°C for 25–30 minutes until crisp.'),
  ('chickpea_quinoa_bowl', 2, 'Meanwhile cook the quinoa according to the packet and whisk the tahini with the lemon juice and a little water into a pourable dressing.'),
  ('chickpea_quinoa_bowl', 3, 'Assemble bowls of quinoa, chickpeas and cucumber, and pour over the dressing.'),

  ('tuna_pasta_salad', 1, 'Cook the pasta, then rinse under cold water and drain well.'),
  ('tuna_pasta_salad', 2, 'Stir the yogurt with the lemon juice, then fold through the pasta, tuna, corn, cucumber and onion.'),
  ('tuna_pasta_salad', 3, 'Season to taste and chill until needed — it keeps two days.'),

  ('salmon_roast_potatoes', 1, 'Toss the potatoes in most of the oil and roast at 200°C for 20 minutes.'),
  ('salmon_roast_potatoes', 2, 'Add the salmon and green beans to the tray, season, and roast a further 12 minutes until the fish flakes.'),
  ('salmon_roast_potatoes', 3, 'Serve with lemon wedges.'),

  ('turkey_burgers', 1, 'Mix the turkey with the egg, breadcrumbs, garlic and paprika, and shape into two patties.'),
  ('turkey_burgers', 2, 'Cook over medium heat about five minutes per side until cooked through.'),
  ('turkey_burgers', 3, 'Toast the buns and build with lettuce and tomato.'),

  ('steak_veg_bowl', 1, 'Cook the rice according to the packet.'),
  ('steak_veg_bowl', 2, 'Sear the steak in a very hot oiled pan to your liking, then rest it while you char the peppers and courgette in the same pan.'),
  ('steak_veg_bowl', 3, 'Slice the steak against the grain and serve over the rice and vegetables.'),

  ('creamy_protein_pasta', 1, 'Cook the pasta, reserving a cup of the water.'),
  ('creamy_protein_pasta', 2, 'Sear the chicken in an oiled pan, adding the garlic near the end.'),
  ('creamy_protein_pasta', 3, 'Off the heat, stir the quark into the pan with a splash of pasta water to make a silky sauce — high heat will split it.'),
  ('creamy_protein_pasta', 4, 'Fold through the pasta and spinach until the leaves wilt.'),

  ('tofu_stir_fry', 1, 'Cook the rice according to the packet.'),
  ('tofu_stir_fry', 2, 'Toss the tofu cubes in cornflour and fry in the oil until golden on all sides; set aside.'),
  ('tofu_stir_fry', 3, 'Stir-fry the broccoli and pepper hard for three minutes, add the garlic and soy sauce, then return the tofu to coat.'),
  ('tofu_stir_fry', 4, 'Serve over the rice.'),

  ('banana_protein_shake', 1, 'Blend everything until smooth. Add ice for a thicker shake.'),

  ('chocolate_protein_pudding', 1, 'Whisk the quark, whey and cocoa together until completely smooth — a minute longer than you think.'),
  ('chocolate_protein_pudding', 2, 'Sweeten with honey to taste and chill; it thickens as it sits.'),

  ('cottage_cheese_pineapple', 1, 'Spoon the cottage cheese into a bowl and top with the pineapple.'),

  ('protein_mug_cake', 1, 'Stir all the ingredients together in a large mug until smooth.'),
  ('protein_mug_cake', 2, 'Microwave 60–90 seconds until just set in the middle — overcooking makes it rubbery.'),

  ('greek_yogurt_walnut_bowl', 1, 'Spoon the yogurt into a bowl and top with the walnuts and honey.')
) as x(recipe_slug, step, text)
join public.recipes r on r.slug = x.recipe_slug;
