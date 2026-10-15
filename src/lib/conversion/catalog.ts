import { US_CUP_ML } from "./units";
export const CATALOG_VERSION = "2026-10-15.1";
const SOURCE = "https://www.kingarthurbaking.com/learn/ingredient-weight-chart";
export type IngredientProfile = { id: string; label: string; aliases: readonly string[]; referenceMassGrams: number; referenceVolumeMl: number; liquid: boolean; assumptions: string; source: string; requiresPacked?: boolean };
const profile = (id: string, label: string, grams: number, aliases: string[], assumptions: string, liquid = false, cupFraction = 1): IngredientProfile => ({ id, label, aliases, referenceMassGrams: grams, referenceVolumeMl: US_CUP_ML * cupFraction, liquid, assumptions, source: SOURCE });
export const INGREDIENT_PROFILES: readonly IngredientProfile[] = [
  profile("all-purpose-flour", "All-purpose flour", 120, ["flour", "all-purpose flour", "all purpose flour", "plain flour", "αλεύρι", "αλεύρι για όλες τις χρήσεις"], "Un-sifted, gently filled level measure; no compression."),
  profile("coconut-flour", "Coconut flour", 128, ["coconut flour", "αλεύρι καρύδας"], "Level, un-sifted measure."),
  profile("cornstarch", "Cornstarch", 28, ["cornstarch", "corn starch", "cornflour", "κορν φλάουρ", "νισεστές", "άμυλο καλαμποκιού"], "Level, un-sifted measure.", false, 0.25),
  profile("granulated-sugar", "Granulated white sugar", 198, ["sugar", "white sugar", "granulated sugar", "granulated white sugar", "ζάχαρη", "λευκή ζάχαρη"], "Granulated white sugar, level measure."),
  { ...profile("packed-brown-sugar", "Brown sugar (packed)", 213, ["brown sugar", "light brown sugar", "dark brown sugar", "καστανή ζάχαρη"], "Firmly packed brown sugar; packing must be explicit or confirmed."), requiresPacked: true },
  profile("unsifted-powdered-sugar", "Powdered sugar (un-sifted)", 113, ["powdered sugar", "confectioners sugar", "confectioners' sugar", "icing sugar", "ζάχαρη άχνη", "άχνη ζάχαρη"], "Un-sifted, level measure."),
  profile("butter-solid", "Butter (solid)", 113, ["butter", "unsalted butter", "salted butter", "βούτυρο"], "Solid butter; not whipped or melted.", false, 0.5),
  profile("honey", "Honey", 21, ["honey", "μέλι"], "Liquid honey at room temperature.", true, 1 / 16),
  profile("unsweetened-cocoa", "Unsweetened cocoa powder", 42, ["cocoa powder", "unsweetened cocoa powder", "κακάο", "κακάο σκόνη"], "Un-sifted, level powder.", false, 0.5),
  profile("rolled-oats", "Old-fashioned rolled oats", 89, ["rolled oats", "old-fashioned oats", "old fashioned oats", "νιφάδες βρώμης"], "Ordinary old-fashioned rolled oats; not instant, ground, or steel-cut."),
  { ...profile("water", "Water", 100, ["water", "νερό"], "Liquid water near room temperature; approximate density.", true), referenceVolumeMl: 100, source: "https://www.nist.gov/pml/owm/metric-si/metric-kitchen/metric-kitchen-culinary-measurement-tips" },
  { ...profile("whole-milk", "Whole milk", 103, ["whole milk", "πλήρες γάλα"], "Whole liquid milk near room temperature; approximate density.", true), referenceVolumeMl: 100, source: "https://www.fao.org/4/y3548e/y3548e06.htm" },
  profile("vegetable-oil", "Vegetable oil", 198, ["vegetable oil", "φυτικό λάδι"], "Liquid vegetable oil at room temperature.", true),
  profile("olive-oil", "Olive oil", 50, ["olive oil", "extra virgin olive oil", "ελαιόλαδο", "έξτρα παρθένο ελαιόλαδο"], "Liquid olive oil at room temperature.", true, 0.25),
];
export const getProfile = (id: string) => INGREDIENT_PROFILES.find(profile => profile.id === id) ?? null;
export const LEGACY_PROFILE_IDS: Record<string, string> = { flour: "all-purpose-flour", sugar: "granulated-sugar", "brown-sugar": "packed-brown-sugar", "powdered-sugar": "unsifted-powdered-sugar", butter: "butter-solid", honey: "honey", cocoa: "unsweetened-cocoa", oats: "rolled-oats", water: "water", milk: "whole-milk", oil: "vegetable-oil" };
