import { Clock3, Thermometer, Users } from "lucide-react";
import { type RecipeContent } from "@/lib/recipe";
import { cardMetadata } from "@/lib/metadata";
export function RecipeMetadata({ recipe }: { recipe: RecipeContent }) {
  return <div className="card-metadata">{cardMetadata(recipe).map((item, index) => {
    const Icon = item.kind === "time" ? Clock3 : item.kind === "temperature" ? Thermometer : Users;
    return <span key={index}><Icon size={15} aria-hidden="true" />{item.text}</span>;
  })}</div>;
}
