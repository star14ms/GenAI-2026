import type { Metadata } from "next";
import { getCompanyName } from "@/lib/stocks";

type Props = { params: Promise<{ symbol: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const companyName = getCompanyName(symbol?.toUpperCase() || "");
  const title = companyName ? `${companyName} (${symbol})` : symbol || "Stock";
  return { title };
}

export default function SearchLayout({ children }: Props) {
  return <>{children}</>;
}
