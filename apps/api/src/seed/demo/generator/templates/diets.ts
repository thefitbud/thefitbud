/* Generated from the approved SEED_DESIGN.md catalogue (docs/seed/SEED_DESIGN.md §5). Edit there, keep slugs in library v2. */
export type DietTemplateItem = { slug: string; grams: number; label: string };
export type DietTemplateMeal = {
  name: string;
  localTime: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  photoRequired: boolean;
  items: DietTemplateItem[];
};
export type DietTemplate = { code: string; title: string; forWhom: string; meals: DietTemplateMeal[] };

export const DIET_TEMPLATES: DietTemplate[] = [
  {
    "code": "N01",
    "title": "North Indian Veg · Fat Loss",
    "forWhom": "veg fat loss (Neha, Pooja, Anita)",
    "meals": [
      {
        "name": "Breakfast",
        "localTime": "08:00",
        "mealType": "breakfast" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "besan-chilla",
            "grams": 156,
            "label": "3 chillas"
          },
          {
            "slug": "curd-dahi-low-fat",
            "grams": 150,
            "label": "1 katori dahi"
          }
        ]
      },
      {
        "name": "Lunch",
        "localTime": "13:30",
        "mealType": "lunch" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "chapati-roti",
            "grams": 72,
            "label": "2 roti"
          },
          {
            "slug": "moong-dal-dhuli",
            "grams": 200,
            "label": "1 katori dal"
          },
          {
            "slug": "bhindi-sabzi-dry",
            "grams": 100,
            "label": "1 katori sabzi"
          },
          {
            "slug": "tossed-salad",
            "grams": 100,
            "label": "1 katori salad"
          }
        ]
      },
      {
        "name": "Evening snack",
        "localTime": "17:00",
        "mealType": "snack" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "buttermilk-low-fat",
            "grams": 250,
            "label": "1 glass chaas"
          },
          {
            "slug": "apple-with-skin-seb",
            "grams": 150,
            "label": "1 apple"
          },
          {
            "slug": "peanuts-dry-roasted",
            "grams": 20,
            "label": "1 small handful"
          }
        ]
      },
      {
        "name": "Dinner",
        "localTime": "20:30",
        "mealType": "dinner" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "palak-paneer",
            "grams": 300,
            "label": "1 bowl"
          },
          {
            "slug": "chapati-roti",
            "grams": 72,
            "label": "2 roti"
          },
          {
            "slug": "cucumber-raita",
            "grams": 100,
            "label": "½ bowl"
          }
        ]
      }
    ]
  },
  {
    "code": "N02",
    "title": "South Indian Veg · PCOS-friendly",
    "forWhom": "PCOS / insulin-sensitive (Meera, Lakshmi)",
    "meals": [
      {
        "name": "Breakfast",
        "localTime": "07:45",
        "mealType": "breakfast" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "moong-bean-dosa",
            "grams": 120,
            "label": "2 pesarattu"
          },
          {
            "slug": "coconut-chutney",
            "grams": 30,
            "label": "2 tbsp"
          },
          {
            "slug": "sambar",
            "grams": 150,
            "label": "1 small bowl"
          }
        ]
      },
      {
        "name": "Mid-morning",
        "localTime": "11:00",
        "mealType": "snack" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "buttermilk-low-fat",
            "grams": 250,
            "label": "1 glass"
          },
          {
            "slug": "guava-amrood",
            "grams": 100,
            "label": "1 guava"
          }
        ]
      },
      {
        "name": "Lunch",
        "localTime": "13:00",
        "mealType": "lunch" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "rice-brown-cooked",
            "grams": 120,
            "label": "¾ katori"
          },
          {
            "slug": "sambar",
            "grams": 200,
            "label": "1 bowl"
          },
          {
            "slug": "beans-thoran",
            "grams": 100,
            "label": "1 katori"
          },
          {
            "slug": "curd-dahi-low-fat",
            "grams": 100,
            "label": "½ katori"
          }
        ]
      },
      {
        "name": "Dinner",
        "localTime": "20:00",
        "mealType": "dinner" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "plain-dosa",
            "grams": 70,
            "label": "2 dosa"
          },
          {
            "slug": "avial",
            "grams": 150,
            "label": "1 katori"
          },
          {
            "slug": "paneer-tikka",
            "grams": 100,
            "label": "4 pieces"
          }
        ]
      }
    ]
  },
  {
    "code": "N03",
    "title": "Jain Veg · Metabolic Health",
    "forWhom": "prediabetes / Jain (Siddharth, Priya S.)",
    "meals": [
      {
        "name": "Breakfast",
        "localTime": "08:00",
        "mealType": "breakfast" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "moong-dal-stuffed-chilla",
            "grams": 200,
            "label": "2 chilla"
          },
          {
            "slug": "milk-2-fat-close-to-toned-milk-3",
            "grams": 200,
            "label": "1 cup milk, no sugar"
          }
        ]
      },
      {
        "name": "Lunch",
        "localTime": "13:00",
        "mealType": "lunch" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "chapati-roti",
            "grams": 72,
            "label": "2 roti"
          },
          {
            "slug": "moong-dal-dhuli",
            "grams": 250,
            "label": "1 bowl"
          },
          {
            "slug": "vegetable-curry",
            "grams": 100,
            "label": "1 katori"
          },
          {
            "slug": "cucumber-raita",
            "grams": 120,
            "label": "1 bowl"
          }
        ]
      },
      {
        "name": "Snack",
        "localTime": "17:00",
        "mealType": "snack" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "peanuts-dry-roasted",
            "grams": 25,
            "label": "1 handful"
          },
          {
            "slug": "chai-with-milk-and-sugar",
            "grams": 150,
            "label": "1 cup chai"
          }
        ]
      },
      {
        "name": "Dinner (before sunset on chauvihar days)",
        "localTime": "19:00",
        "mealType": "dinner" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "lentil-curry",
            "grams": 200,
            "label": "1 bowl"
          },
          {
            "slug": "plain-dosa",
            "grams": 70,
            "label": "2"
          },
          {
            "slug": "tossed-salad",
            "grams": 100,
            "label": "1 katori"
          }
        ]
      }
    ]
  },
  {
    "code": "N04",
    "title": "Eggetarian · High Protein",
    "forWhom": "fat loss women eggetarian (Divya, Ananya)",
    "meals": [
      {
        "name": "Breakfast",
        "localTime": "08:00",
        "mealType": "breakfast" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "egg-omelette-plain",
            "grams": 165,
            "label": "3-egg omelette"
          },
          {
            "slug": "bread-whole-wheat-brown-bread",
            "grams": 56,
            "label": "2 slices"
          },
          {
            "slug": "orange-santra-narangi",
            "grams": 130,
            "label": "1 orange"
          }
        ]
      },
      {
        "name": "Lunch",
        "localTime": "13:30",
        "mealType": "lunch" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "chapati-roti",
            "grams": 72,
            "label": "2 roti"
          },
          {
            "slug": "rajma-curry",
            "grams": 180,
            "label": "1½ bowl"
          },
          {
            "slug": "tossed-salad",
            "grams": 100,
            "label": "1 katori"
          }
        ]
      },
      {
        "name": "Post-workout",
        "localTime": "18:00",
        "mealType": "snack" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "whey-protein-powder-isolate",
            "grams": 32,
            "label": "1 scoop in water"
          },
          {
            "slug": "banana-ripe-kela",
            "grams": 115,
            "label": "1 banana"
          }
        ]
      },
      {
        "name": "Dinner",
        "localTime": "20:30",
        "mealType": "dinner" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "scrambled-egg",
            "grams": 200,
            "label": "1 bowl"
          },
          {
            "slug": "chapati-roti",
            "grams": 36,
            "label": "1 roti"
          },
          {
            "slug": "curd-dahi-low-fat",
            "grams": 150,
            "label": "1 katori"
          }
        ]
      }
    ]
  },
  {
    "code": "N05",
    "title": "Eggetarian Gujarati · Lean Bulk",
    "forWhom": "gain phase (Aarav)",
    "meals": [
      {
        "name": "Breakfast",
        "localTime": "07:30",
        "mealType": "breakfast" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "oats-rolled",
            "grams": 60,
            "label": "60 g oats"
          },
          {
            "slug": "milk-2-fat-close-to-toned-milk-3",
            "grams": 300,
            "label": "300 ml milk"
          },
          {
            "slug": "banana-ripe-kela",
            "grams": 115,
            "label": "1 banana"
          },
          {
            "slug": "egg-whole-hard-boiled",
            "grams": 150,
            "label": "3 boiled eggs"
          }
        ]
      },
      {
        "name": "Lunch",
        "localTime": "13:00",
        "mealType": "lunch" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "chapati-roti",
            "grams": 108,
            "label": "3 roti"
          },
          {
            "slug": "chana-dal",
            "grams": 250,
            "label": "1 bowl"
          },
          {
            "slug": "aloo-ki-sabzi",
            "grams": 120,
            "label": "1 katori"
          },
          {
            "slug": "curd-dahi-plain-yogurt-whole-milk",
            "grams": 150,
            "label": "1 katori"
          }
        ]
      },
      {
        "name": "Pre-workout",
        "localTime": "17:30",
        "mealType": "snack" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "dhokla",
            "grams": 120,
            "label": "4 pieces"
          },
          {
            "slug": "peanut-butter-creamy",
            "grams": 25,
            "label": "1 tbsp on 1 slice"
          },
          {
            "slug": "bread-whole-wheat-brown-bread",
            "grams": 28,
            "label": "1 slice"
          }
        ]
      },
      {
        "name": "Post-workout",
        "localTime": "19:30",
        "mealType": "snack" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "whey-protein-powder-isolate",
            "grams": 32,
            "label": "1 scoop"
          },
          {
            "slug": "milk-2-fat-close-to-toned-milk-3",
            "grams": 250,
            "label": "250 ml"
          }
        ]
      },
      {
        "name": "Dinner",
        "localTime": "21:00",
        "mealType": "dinner" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "methi-thepla",
            "grams": 73,
            "label": "2 thepla"
          },
          {
            "slug": "vegetable-khichdi",
            "grams": 300,
            "label": "1½ bowl"
          },
          {
            "slug": "egg-omelette-plain",
            "grams": 110,
            "label": "2-egg omelette"
          },
          {
            "slug": "cucumber-raita",
            "grams": 150,
            "label": "1 bowl"
          }
        ]
      }
    ]
  },
  {
    "code": "N06",
    "title": "North Indian Non-veg · Fat Loss",
    "forWhom": "men fat loss (Rohan, Vikram, Imran)",
    "meals": [
      {
        "name": "Breakfast",
        "localTime": "08:30",
        "mealType": "breakfast" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "vegetable-poha",
            "grams": 250,
            "label": "1 plate"
          },
          {
            "slug": "egg-whole-hard-boiled",
            "grams": 100,
            "label": "2 boiled eggs"
          }
        ]
      },
      {
        "name": "Lunch",
        "localTime": "13:30",
        "mealType": "lunch" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "rice-white-cooked-long-grain",
            "grams": 150,
            "label": "1 katori rice"
          },
          {
            "slug": "chicken-curry",
            "grams": 250,
            "label": "1 bowl"
          },
          {
            "slug": "tossed-salad",
            "grams": 100,
            "label": "1 katori"
          }
        ]
      },
      {
        "name": "Snack",
        "localTime": "17:30",
        "mealType": "snack" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "sprouted-moong-chaat",
            "grams": 100,
            "label": "100 g"
          },
          {
            "slug": "chai-with-milk-and-sugar",
            "grams": 150,
            "label": "1 cup"
          }
        ]
      },
      {
        "name": "Dinner",
        "localTime": "21:00",
        "mealType": "dinner" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "chicken-grilled-without-sauce-skin-not-eaten",
            "grams": 150,
            "label": "3 pieces"
          },
          {
            "slug": "chapati-roti",
            "grams": 72,
            "label": "2 roti"
          },
          {
            "slug": "aloo-matar",
            "grams": 100,
            "label": "1 katori"
          },
          {
            "slug": "cucumber-raita",
            "grams": 100,
            "label": "½ bowl"
          }
        ]
      }
    ]
  },
  {
    "code": "N07",
    "title": "Kerala Non-veg · Fish & Rice",
    "forWhom": "Malayali clients (Deepak, Rajesh, Kavya)",
    "meals": [
      {
        "name": "Breakfast",
        "localTime": "07:30",
        "mealType": "breakfast" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "appam",
            "grams": 120,
            "label": "2 appam"
          },
          {
            "slug": "egg-whole-hard-boiled",
            "grams": 100,
            "label": "2 eggs"
          },
          {
            "slug": "tea-black-brewed",
            "grams": 100,
            "label": "100 ml"
          }
        ]
      },
      {
        "name": "Lunch",
        "localTime": "13:00",
        "mealType": "lunch" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "rice-red-raw",
            "grams": 60,
            "label": "red rice (60 g raw)"
          },
          {
            "slug": "fish-curry",
            "grams": 250,
            "label": "1 bowl meen curry"
          },
          {
            "slug": "avial",
            "grams": 100,
            "label": "1 katori"
          },
          {
            "slug": "buttermilk-low-fat",
            "grams": 250,
            "label": "1 glass moru"
          }
        ]
      },
      {
        "name": "Snack",
        "localTime": "16:30",
        "mealType": "snack" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "banana-ripe-kela",
            "grams": 115,
            "label": "1 nendran-size banana"
          },
          {
            "slug": "peanuts-dry-roasted",
            "grams": 25,
            "label": "1 handful"
          }
        ]
      },
      {
        "name": "Dinner",
        "localTime": "20:00",
        "mealType": "dinner" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "chapati-roti",
            "grams": 72,
            "label": "2 chapati"
          },
          {
            "slug": "chicken-curry",
            "grams": 250,
            "label": "1 bowl"
          },
          {
            "slug": "beans-thoran",
            "grams": 100,
            "label": "1 katori"
          }
        ]
      }
    ]
  },
  {
    "code": "N08",
    "title": "Veg (no eggs) · High Protein Bulk",
    "forWhom": "veg strength (Harpreet)",
    "meals": [
      {
        "name": "Breakfast",
        "localTime": "07:00",
        "mealType": "breakfast" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "paneer-paratha",
            "grams": 170,
            "label": "2 paratha"
          },
          {
            "slug": "curd-dahi-plain-yogurt-whole-milk",
            "grams": 200,
            "label": "1 bowl"
          },
          {
            "slug": "milk-2-fat-close-to-toned-milk-3",
            "grams": 250,
            "label": "1 glass"
          }
        ]
      },
      {
        "name": "Lunch",
        "localTime": "13:00",
        "mealType": "lunch" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "chapati-roti",
            "grams": 144,
            "label": "4 roti"
          },
          {
            "slug": "rajma-curry",
            "grams": 240,
            "label": "2 bowls"
          },
          {
            "slug": "rice-white-cooked-long-grain",
            "grams": 150,
            "label": "1 katori"
          },
          {
            "slug": "tossed-salad",
            "grams": 100,
            "label": "1 katori"
          }
        ]
      },
      {
        "name": "Post-run",
        "localTime": "17:30",
        "mealType": "snack" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "whey-protein-powder-isolate",
            "grams": 32,
            "label": "1 scoop"
          },
          {
            "slug": "banana-ripe-kela",
            "grams": 230,
            "label": "2 bananas"
          },
          {
            "slug": "peanuts-dry-roasted",
            "grams": 25,
            "label": "1 handful"
          }
        ]
      },
      {
        "name": "Dinner",
        "localTime": "20:30",
        "mealType": "dinner" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "matar-paneer",
            "grams": 280,
            "label": "1 bowl"
          },
          {
            "slug": "chapati-roti",
            "grams": 108,
            "label": "3 roti"
          },
          {
            "slug": "soybeans-boiled",
            "grams": 120,
            "label": "1 bowl"
          }
        ]
      }
    ]
  },
  {
    "code": "N09",
    "title": "Travel & Eating-out · Non-veg",
    "forWhom": "consultants/NRIs (Farhan, Fatima)",
    "meals": [
      {
        "name": "Hotel breakfast",
        "localTime": "07:30",
        "mealType": "breakfast" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "egg-omelette-plain",
            "grams": 165,
            "label": "3-egg omelette"
          },
          {
            "slug": "bread-whole-wheat-brown-bread",
            "grams": 56,
            "label": "2 toast"
          },
          {
            "slug": "fruit-salad",
            "grams": 150,
            "label": "1 bowl fruit"
          }
        ]
      },
      {
        "name": "Client lunch",
        "localTime": "13:30",
        "mealType": "lunch" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "chicken-grilled-without-sauce-skin-not-eaten",
            "grams": 200,
            "label": "grilled chicken"
          },
          {
            "slug": "naan",
            "grams": 53,
            "label": "1 naan"
          },
          {
            "slug": "tossed-salad",
            "grams": 150,
            "label": "salad"
          },
          {
            "slug": "rice-white-cooked-long-grain",
            "grams": 150,
            "label": "1 katori"
          }
        ]
      },
      {
        "name": "Snack",
        "localTime": "17:00",
        "mealType": "snack" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "yogurt-greek-plain-nonfat",
            "grams": 170,
            "label": "1 cup Greek yogurt"
          },
          {
            "slug": "almonds-badam-raw",
            "grams": 25,
            "label": "1 handful"
          }
        ]
      },
      {
        "name": "Dinner",
        "localTime": "21:00",
        "mealType": "dinner" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "chicken-breast-skinless-cooked",
            "grams": 150,
            "label": "grilled chicken breast"
          },
          {
            "slug": "rice-brown-cooked",
            "grams": 150,
            "label": "1 katori"
          },
          {
            "slug": "mixed-vegetables-frozen-boiled",
            "grams": 150,
            "label": "sautéed veg"
          }
        ]
      }
    ]
  },
  {
    "code": "N10",
    "title": "Bengali Fish · Balanced",
    "forWhom": "Bengali (Ishita)",
    "meals": [
      {
        "name": "Breakfast",
        "localTime": "09:00",
        "mealType": "breakfast" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "oats-rolled",
            "grams": 50,
            "label": "oats"
          },
          {
            "slug": "milk-2-fat-close-to-toned-milk-3",
            "grams": 200,
            "label": "milk"
          },
          {
            "slug": "banana-ripe-kela",
            "grams": 115,
            "label": "1 banana"
          }
        ]
      },
      {
        "name": "Lunch",
        "localTime": "14:00",
        "mealType": "lunch" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "rice-white-cooked-long-grain",
            "grams": 150,
            "label": "1 katori"
          },
          {
            "slug": "moong-dal-dhuli",
            "grams": 200,
            "label": "1 katori dal"
          },
          {
            "slug": "fish-curry",
            "grams": 200,
            "label": "1 piece macher jhol"
          }
        ]
      },
      {
        "name": "Snack",
        "localTime": "17:30",
        "mealType": "snack" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "rice-puffed-murmura",
            "grams": 28,
            "label": "jhal muri (2 cups)"
          },
          {
            "slug": "peanuts-dry-roasted",
            "grams": 25,
            "label": "peanuts"
          },
          {
            "slug": "chai-with-milk-and-sugar",
            "grams": 150,
            "label": "1 cup"
          }
        ]
      },
      {
        "name": "Dinner",
        "localTime": "21:00",
        "mealType": "dinner" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "chapati-roti",
            "grams": 72,
            "label": "2 roti"
          },
          {
            "slug": "chicken-curry",
            "grams": 200,
            "label": "1 bowl"
          },
          {
            "slug": "tossed-salad",
            "grams": 100,
            "label": "salad"
          }
        ]
      }
    ]
  },
  {
    "code": "N11",
    "title": "Navratri / Vrat Day",
    "forWhom": "festival fasting days (Divya, Siddharth, Neha)",
    "meals": [
      {
        "name": "Breakfast",
        "localTime": "08:00",
        "mealType": "breakfast" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "milk-2-fat-close-to-toned-milk-3",
            "grams": 250,
            "label": "1 glass milk"
          },
          {
            "slug": "banana-ripe-kela",
            "grams": 115,
            "label": "1 banana"
          },
          {
            "slug": "almonds-badam-raw",
            "grams": 25,
            "label": "10 almonds"
          }
        ]
      },
      {
        "name": "Lunch",
        "localTime": "13:00",
        "mealType": "lunch" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "sabudana-khichdi",
            "grams": 200,
            "label": "1 plate"
          },
          {
            "slug": "curd-dahi-low-fat",
            "grams": 150,
            "label": "1 katori"
          }
        ]
      },
      {
        "name": "Snack",
        "localTime": "17:00",
        "mealType": "snack" as const,
        "photoRequired": false,
        "items": [
          {
            "slug": "fruit-salad",
            "grams": 200,
            "label": "1 bowl"
          },
          {
            "slug": "peanuts-dry-roasted",
            "grams": 25,
            "label": "1 handful"
          }
        ]
      },
      {
        "name": "Dinner",
        "localTime": "20:00",
        "mealType": "dinner" as const,
        "photoRequired": true,
        "items": [
          {
            "slug": "paneer-tikka",
            "grams": 150,
            "label": "paneer tikka (sendha namak)"
          },
          {
            "slug": "cucumber-raita",
            "grams": 150,
            "label": "1 bowl"
          }
        ]
      }
    ]
  }
];

export function dietTemplate(code: string): DietTemplate {
  const found = DIET_TEMPLATES.find((t) => t.code === code);
  if (!found) throw new Error(`Unknown diet template ${code}`);
  return found;
}

export const DIET_TEMPLATE_SLUGS: string[] = [
  ...new Set(DIET_TEMPLATES.flatMap((t) => t.meals.flatMap((m) => m.items.map((i) => i.slug)))),
];
