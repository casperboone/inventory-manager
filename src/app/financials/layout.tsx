import { FinancialsNav } from "./financials-nav";

// Everything that comes from Rust Food's own bookkeeping sits behind one nav
// entry, since it is a secondary feature next to ordering.
export default function FinancialsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <FinancialsNav />
      {children}
    </div>
  );
}
