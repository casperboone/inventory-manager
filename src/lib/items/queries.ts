import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  assortmentCategories,
  assortmentItemImages,
  assortmentItems,
  supplierProducts,
} from "@/db/schema";
import { getCategories } from "@/lib/assortment/queries";
import { getDiscountStatuses } from "@/lib/products/discounts";
import {
  getProductPurchaseHistory,
  lastPaidLine,
} from "@/lib/products/purchases";
import { getProductPriceChanges } from "@/lib/products/queries";
import {
  getPricingCategories,
  getPricingItem,
  getPricingSettings,
  getSalePriceHistory,
} from "@/lib/pricing/queries";

// Where a supplier product leads to in our own assortment. Usually one item,
// but the same product can be sold as several, like the tap and the OWEE beer.
export type ItemLink = {
  id: number;
  // Tells items apart when they share a name, which those two do.
  label: string;
  archived: boolean;
};

function selectLinkedItems() {
  return db
    .select({
      id: assortmentItems.id,
      name: assortmentItems.name,
      categoryName: assortmentCategories.name,
      archivedAt: assortmentItems.archivedAt,
      itemNo: supplierProducts.itemNo,
    })
    .from(assortmentItems)
    .innerJoin(
      assortmentCategories,
      eq(assortmentItems.categoryId, assortmentCategories.id)
    )
    .innerJoin(
      supplierProducts,
      eq(assortmentItems.supplierProductId, supplierProducts.id)
    );
}

type LinkedItem = Awaited<ReturnType<typeof selectLinkedItems>>[number];

// The items of one product.
function toLinks(items: LinkedItem[]): ItemLink[] {
  const active = items.filter((item) => item.archivedAt === null);
  return items.map((item) => {
    const archived = item.archivedAt !== null;
    const namesake = active.some(
      (other) => other.id !== item.id && other.name === item.name
    );
    return {
      id: item.id,
      label: archived
        ? `${item.name} (archived)`
        : namesake
          ? `${item.name} (${item.categoryName})`
          : item.name,
      archived,
    };
  });
}

// Per item number, for the screens that list supplier products. The assortment
// is small, so this is simply all of it. An archived item only shows when
// nothing has replaced it.
export async function getItemLinksByItemNo() {
  const items = await selectLinkedItems()
    .where(eq(assortmentItems.kind, "product"))
    .orderBy(asc(assortmentCategories.position), asc(assortmentItems.position));

  const grouped = new Map<string, LinkedItem[]>();
  for (const item of items) {
    grouped.set(item.itemNo, [...(grouped.get(item.itemNo) ?? []), item]);
  }

  const links = new Map<string, ItemLink[]>();
  for (const [itemNo, group] of grouped) {
    const all = toLinks(group);
    const active = all.filter((link) => !link.archived);
    links.set(itemNo, active.length > 0 ? active : all);
  }
  return links;
}

export async function getItemName(itemId: number) {
  const item = await db.query.assortmentItems.findFirst({
    where: and(
      eq(assortmentItems.id, itemId),
      eq(assortmentItems.kind, "product")
    ),
    columns: { name: true },
  });
  return item?.name ?? null;
}

// What the item dialog edits, plus what it shows of the linked product. It finds
// archived items too; notes have no dialog.
async function getEditableItem(itemId: number) {
  const [row] = await db
    .select({
      item: assortmentItems,
      itemNo: supplierProducts.itemNo,
      supplierDescription: supplierProducts.description,
      unitOfMeasure: supplierProducts.unitOfMeasure,
      unitPrice: supplierProducts.unitPrice,
      imageStatus: supplierProducts.imageStatus,
      ownImageId: assortmentItemImages.itemId,
    })
    .from(assortmentItems)
    .leftJoin(
      supplierProducts,
      eq(assortmentItems.supplierProductId, supplierProducts.id)
    )
    .leftJoin(
      assortmentItemImages,
      eq(assortmentItemImages.itemId, assortmentItems.id)
    )
    .where(
      and(eq(assortmentItems.id, itemId), eq(assortmentItems.kind, "product"))
    )
    .limit(1);
  if (!row) return null;

  const { item, ownImageId, ...product } = row;
  return { ...item, ...product, hasOwnImage: ownImageId !== null };
}

export type EditableItem = NonNullable<
  Awaited<ReturnType<typeof getEditableItem>>
>;

export async function getItemDialogData(itemId?: number) {
  const [item, salePriceHistory, orderCategories, pricingCategories, settings] =
    await Promise.all([
      itemId != null ? getEditableItem(itemId) : null,
      itemId != null ? getSalePriceHistory(itemId) : [],
      getCategories(),
      getPricingCategories(),
      getPricingSettings(),
    ]);
  return {
    item,
    salePriceHistory,
    orderCategories,
    pricingCategories,
    priceRounding: settings.priceRounding,
  };
}

export type ItemDialogData = Awaited<ReturnType<typeof getItemDialogData>>;

// Everything we know about one item: what the order page, the pricing screen,
// the invoices and the catalog each say about it.
export async function getItemDetail(itemId: number) {
  const [[base], pricing, salePriceHistory] = await Promise.all([
    db
      .select({
        item: assortmentItems,
        orderCategory: assortmentCategories.name,
        product: supplierProducts,
      })
      .from(assortmentItems)
      .innerJoin(
        assortmentCategories,
        eq(assortmentItems.categoryId, assortmentCategories.id)
      )
      .leftJoin(
        supplierProducts,
        eq(assortmentItems.supplierProductId, supplierProducts.id)
      )
      .where(eq(assortmentItems.id, itemId))
      .limit(1),
    getPricingItem(itemId),
    getSalePriceHistory(itemId),
  ]);
  if (!base || !pricing) return null;

  const { item, orderCategory, product } = base;
  const [purchases, priceChanges, discounts, siblings] = product
    ? await Promise.all([
        getProductPurchaseHistory(product.itemNo),
        getProductPriceChanges(product.id),
        getDiscountStatuses([product.itemNo]),
        selectLinkedItems()
          .where(
            and(
              eq(assortmentItems.supplierProductId, product.id),
              eq(assortmentItems.kind, "product")
            )
          )
          .orderBy(
            asc(assortmentCategories.position),
            asc(assortmentItems.position)
          ),
      ])
    : [[], [], null, []];

  return {
    item,
    orderCategory,
    product,
    pricing,
    salePriceHistory,
    purchases,
    lastPaid: lastPaidLine(purchases),
    priceChanges,
    // Line discount as last invoiced; never invoiced is unknown, not none.
    discount: product
      ? (discounts?.get(product.itemNo) ?? { kind: "unknown" as const })
      : null,
    // Other items on the same supplier product.
    sharedWith: toLinks(siblings).filter((link) => link.id !== item.id),
  };
}
