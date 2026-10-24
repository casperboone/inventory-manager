import { PricingNav } from "./pricing-nav";

// Pricing works on the same assortment items as ordering, but on its own
// pages: what we charge changes far less often than what we order.
export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <PricingNav />
      {children}
    </div>
  );
}
