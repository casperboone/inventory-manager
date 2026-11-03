import { SectionBar } from "@/components/section-tabs";

const SECTIONS = [
  { href: "/pricing", label: "Prices" },
  { href: "/pricing/calculator", label: "Calculator" },
  { href: "/pricing/categories", label: "Categories & settings" },
];

// Pricing works on the same assortment items as ordering, but on its own
// pages: what we charge changes far less often than what we order.
export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SectionBar label="Pricing" sections={SECTIONS} />
      {children}
    </>
  );
}
