import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Display: Bricolage Grotesque (opsz + wdth axes, set heavy and slightly condensed).
const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});
// Body and UI: Instrument Sans.
const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"], axes: ["wdth"] });

export const metadata: Metadata = {
  title: { default: "Artisan Market", template: "%s | Artisan Market" },
  description: "Handmade goods and live auctions, straight from independent makers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
