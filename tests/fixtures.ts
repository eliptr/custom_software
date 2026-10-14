import { type Recipe } from "../src/lib/recipe";
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
