import { type Recipe, type RecipeContent } from "../src/lib/recipe";

// Representative facts from the reported orange-chicken screenshot, which has no method.
export const ingredientsOnlyRecipe: RecipeContent = {
  title: "Homemade orange chicken",
  description: "Takes about 35 minutes to make using a quick crispy coating and a sweet-and-tangy orange sauce.",
  ingredients: [
    { name: "Chicken", quantity: "1.5", unit: "lbs", notes: "Boneless skinless thighs or breasts, cubed" },
    { name: "Cornstarch", quantity: "1/3", unit: "cup", notes: "For breading" },
    { name: "Cornstarch", quantity: "1", unit: "tbsp", notes: "Mixed with a splash of water for a slurry" },
    { name: "Salt", quantity: null, unit: null, notes: null },
    { name: "Vegetable oil", quantity: null, unit: null, notes: "For frying" },
  ],
  instructions: [], prepTime: null, cookTime: null, servings: null, category: null, tags: [],
};

export const greekRecipe: Recipe = {
  id: "a96718b9-cb74-4573-9b7e-c2d2c0e6bbad",
  title: "Κέικ λεμονιού 🍋", description: "Με γιαούρτι\nκαι μέλι | δοκιμή",
  ingredients: [
    { name: "Αλεύρι", quantity: "1 ½", unit: "φλιτζάνι", notes: "κοσκινισμένο" },
    { name: 'Αλάτι | "θαλασσινό"', quantity: null, unit: null, notes: "" },
  ],
  instructions: ["Ανακατέψτε τα υλικά.", "Ψήστε στους 180°C για 35′.\nΑφήστε να κρυώσει."],
  prepTime: 10, cookTime: 35, servings: 4, category: "Γλυκά", tags: ["λεμόνι", "εύκολο"],
  createdAt: "2026-10-14T12:00:00.000Z", updatedAt: "2026-10-14T12:01:00.000Z",
};
