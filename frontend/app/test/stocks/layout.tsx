import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock History",
};

export default function TestStocksLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
