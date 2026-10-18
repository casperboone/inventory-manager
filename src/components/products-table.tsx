import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { DiscountBadge } from "@/components/discount-badge";
import { ProductImage } from "@/components/product-image";
import { QuickAddToCart } from "@/components/quick-add-to-cart";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SupplierProduct } from "@/db/schema";
import { formatPrice } from "@/lib/format";
import { NO_IMAGE_TTL_MS } from "@/lib/supplier/image-service";
import type { DiscountStatus } from "@/lib/products/discount-types";
import type { ProductSort } from "@/lib/products/queries";
import { cn } from "@/lib/utils";

type Sorting = {
  sort: ProductSort;
  dir: "asc" | "desc";
  // Builds the URL for a given sort, keeping the other filters.
  href: (sort: ProductSort, dir: "asc" | "desc") => string;
};

type Column = {
  label: string;
  sort?: ProductSort;
  className?: string;
};

const COLUMNS: Column[] = [
  { label: "", className: "w-14" },
  { label: "Item no.", sort: "itemNo", className: "w-32" },
  { label: "Description", sort: "description" },
  { label: "Unit", sort: "unit", className: "w-24" },
  { label: "Price", sort: "price", className: "w-28 text-right" },
  { label: "Discount", className: "w-28" },
  { label: "", className: "w-12" },
];

export function ProductsTable({
  products,
  sorting,
  newImportId,
  renderPrice,
  discounts,
  emptyMessage = "No products found.",
}: {
  products: SupplierProduct[];
  sorting?: Sorting;
  // Products first seen in this import get a "New" badge.
  newImportId?: number;
  renderPrice?: (product: SupplierProduct) => React.ReactNode;
  // Line discount per item number, as last invoiced.
  discounts?: Map<string, DiscountStatus>;
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {COLUMNS.map((column, index) => (
              <TableHead
                key={column.label || `spacer-${index}`}
                className={column.className}
              >
                {sorting && column.sort ? (
                  <SortLink column={column} sorting={sorting} />
                ) : (
                  column.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={COLUMNS.length}
                className="h-24 text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
          {products.map((product) => (
            <TableRow
              key={product.id}
              className={cn(product.removedAt && "text-muted-foreground")}
            >
              <TableCell className="py-1">
                <ProductImage
                  itemNo={product.itemNo}
                  alt={product.description}
                  hasImage={!knownWithoutImage(product)}
                  className={cn(product.removedAt && "opacity-50")}
                />
              </TableCell>
              <TableCell className="font-mono text-xs">
                {product.itemNo}
              </TableCell>
              <TableCell className="whitespace-normal">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      product.removedAt && "line-through",
                      !product.description && "text-muted-foreground italic"
                    )}
                  >
                    {product.description || "No description"}
                  </span>
                  {newImportId && product.firstImportId === newImportId && (
                    <Badge>New</Badge>
                  )}
                  {product.inSupplierAssortment && (
                    <Badge variant="secondary">Assortment</Badge>
                  )}
                  {product.removedAt && (
                    <Badge variant="outline">Removed</Badge>
                  )}
                </div>
                {product.description2 && (
                  <div className="text-xs text-muted-foreground">
                    {product.description2}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {product.unitOfMeasure ?? "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {renderPrice
                  ? renderPrice(product)
                  : formatPrice(product.unitPrice)}
              </TableCell>
              <TableCell>
                <DiscountBadge
                  status={discounts?.get(product.itemNo)}
                  unitPrice={product.unitPrice}
                />
              </TableCell>
              <TableCell className="py-1 pr-1 text-right">
                <QuickAddToCart
                  itemNo={product.itemNo}
                  description={product.description || product.itemNo}
                  unitOfMeasure={product.unitOfMeasure}
                  disabled={product.removedAt !== null}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Products checked recently without an image don't need another request.
function knownWithoutImage(product: SupplierProduct) {
  return (
    product.imageStatus === "none" &&
    !!product.imageCheckedAt &&
    Date.now() - product.imageCheckedAt.getTime() < NO_IMAGE_TTL_MS
  );
}

function SortLink({ column, sorting }: { column: Column; sorting: Sorting }) {
  const active = sorting.sort === column.sort;
  const nextDir = active && sorting.dir === "asc" ? "desc" : "asc";
  const Icon = sorting.dir === "asc" ? ArrowUpIcon : ArrowDownIcon;

  return (
    <Link
      href={sorting.href(column.sort!, nextDir)}
      scroll={false}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground",
        column.className?.includes("text-right") && "flex-row-reverse",
        active ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {column.label}
      {active && <Icon className="size-3.5" />}
    </Link>
  );
}
