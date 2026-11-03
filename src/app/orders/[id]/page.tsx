import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOrderDetail } from "@/lib/orders/queries";
import { orderLabel } from "@/lib/orders/reference";
import { OrderView } from "./order-view";

// Always read the database at request time instead of prerendering at build.
export const dynamic = "force-dynamic";

// The document import runs as a server action from this page.
export const maxDuration = 60;

function parseId(id: string) {
  return /^\d+$/.test(id) ? Number(id) : null;
}

export async function generateMetadata(props: PageProps<"/orders/[id]">) {
  const { id } = await props.params;
  const orderId = parseId(id);
  const detail = orderId ? await getOrderDetail(orderId) : null;
  return {
    title: `${detail ? orderLabel(detail.order) : "Order"} · Inventory Manager`,
  };
}

export default async function OrderPage(props: PageProps<"/orders/[id]">) {
  const { id } = await props.params;
  const orderId = parseId(id);
  const detail = orderId ? await getOrderDetail(orderId) : null;
  if (!detail) notFound();

  return (
    <div className="space-y-4 pb-12">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground"
        nativeButton={false}
        render={<Link href="/orders" />}
      >
        <ArrowLeftIcon />
        All orders
      </Button>
      <OrderView detail={detail} />
    </div>
  );
}
