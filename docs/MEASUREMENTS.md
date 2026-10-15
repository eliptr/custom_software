# Local ingredient conversions

`src/lib/measurements.ts` contains the conversion rules; `ingredient-types.ts` contains the allowed canonical types. Conversion is deterministic and never calls AI. Original quantity/unit strings are retained in the recipe and every revision/backup. The Metric / Cups / Spoons preference is stored locally under versioned key `recipe-measurements-v1`; blocked storage still permits toggling within the current view.

## Volume and mass

One US customary cup is 236.5882365 ml, one tablespoon is 1/16 cup, and one teaspoon is 1/48 cup. Plain cups/spoons, including supported Greek aliases, use this US convention as labelled in the interface. Metric/Imperial cups and Australian tablespoons are not equivalent: explicitly ambiguous/unsupported units remain unchanged. See [NIST conversion factors](https://nvlpubs.nist.gov/nistpubs/Legacy/LC/nbslettercircular1098.pdf) and [NIST culinary measurement guidance](https://www.nist.gov/pml/owm/metric-si/metric-kitchen/metric-kitchen-culinary-measurement-tips).

Grams/kilograms convert directly; ml/liters use volume only. Common lb/oz mass aliases also convert directly. A known dry ingredient's cup/spoon volume can convert to grams using its specific rule. Liquids normally display ml/L in Metric; their mass-to-volume conversions require a known density. Unknown ingredients can still convert volume to volume; their weights are never treated as water.

## Approximate ingredient weights

The reusable table uses these approximate grams per level US cup. Different ingredients deliberately have different factors. Baking references are from [King Arthur's ingredient weight chart](https://www.kingarthurbaking.com/learn/ingredient-weight-chart), checked 2026-10-15. Scaled entries: butter 113 g per half cup →226 g; honey 21 g per tablespoon →336 g; cocoa 42 g per half cup →84 g. Other table entries: all-purpose flour 120 g, granulated sugar 198 g, packed brown sugar 213 g, unsifted powdered sugar 113 g, ordinary old-fashioned oats 89 g, vegetable oil 198 g. Olive/canola/sunflower oil use the vegetable-oil approximation. Brand/packing differences remain possible.

Water uses approximately 1 g/ml. Milk uses approximately 1.03 g/ml, within the [FAO's normal milk density range](https://www.fao.org/4/y3548e/y3548e06.htm). These are kitchen approximations, not universal physical constants. The UI marks density conversions as approximate and recommends a scale for precision.

Name matching uses exact, normalized aliases (case, accents, Greek final sigma, repeated whitespace). It does not blindly strip words: coconut flour does not match all-purpose flour; unspecified brown sugar does not assume packed sugar. A user can explicitly choose the canonical ingredient in the editor's Measurement conversion disclosure. Changing the name clears any previous canonical override. AI can suggest an allowed canonical type but cannot add conversion rules.

Ranges, missing amounts, vague measures, unrecognized units, uncertain packing/sifting, and unknown densities retain the original measurement with a short explanation. No count-to-weight conversion is attempted for eggs, cloves, pieces, etc. Fractions include common Unicode, ASCII, and mixed forms. Display quantities round to three significant figures in Metric; cup/spoon fractions use familiar denominators only within 1% of the underlying result, otherwise two decimals. Quantities too tiny for useful spoon formatting stay original. Every toggle starts from original strings, so rounding never accumulates in saved data.
