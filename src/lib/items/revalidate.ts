import { revalidatePath } from "next/cache";

// Every screen that shows what an item's dialog edits.
export function revalidateItemScreens() {
  revalidatePath("/order-list");
  revalidatePath("/order-list/review");
  revalidatePath("/pricing");
  revalidatePath("/pricing/categories");
  revalidatePath("/items/[id]", "page");
}
