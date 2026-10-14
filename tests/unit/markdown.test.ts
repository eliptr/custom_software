import { describe, expect, it } from "vitest";
import { exportCollection, importCollection } from "../../src/lib/markdown";
import { greekRecipe } from "../fixtures";
describe("single Markdown collection", () => {
  it("round trips every field including Unicode, pipes, quotes, newlines, and null", () => {
    expect(importCollection(exportCollection([greekRecipe]))).toEqual([greekRecipe]);
  });
  it("is canonical and supports empty and multiple collections", () => {
    const another = { ...greekRecipe, id: "00000000-0000-4000-8000-000000000001", title: "English" };
    const file = exportCollection([greekRecipe, another]);
    expect(file).toBe(exportCollection([another, greekRecipe]));
    expect(exportCollection(importCollection(file))).toBe(file);
    expect(importCollection(exportCollection([]))).toEqual([]);
  });
  it("reads BOM and Windows line endings", () => {
    expect(importCollection("\uFEFF" + exportCollection([greekRecipe]).replace(/\n/g, "\r\n"))).toEqual([greekRecipe]);
  });
  it("supports human edits", () => {
    const edited = exportCollection([greekRecipe]).replace('"1 ½"', '"2"');
    expect(importCollection(edited)[0].ingredients[0].quantity).toBe("2");
  });
  it("rejects malformed, truncated, unsupported, trailing, and duplicate records", () => {
    const file = exportCollection([greekRecipe]);
    for (const bad of ["# random", file.replace("recipe-tracker/1", "recipe-tracker/2"), file.replace("<!-- recipe:end -->", ""), file.replace("2. ", "3. "), file + "garbage", file + file.slice(file.indexOf("<!-- recipe:start -->"))]) expect(() => importCollection(bad)).toThrow();
  });
});
