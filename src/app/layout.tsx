import type { Metadata } from "next";
import { Libre_Franklin, Montserrat } from "next/font/google";
import { getLang } from "@/lib/i18n";
import "./globals.css";

const display = Libre_Franklin({ subsets: ["latin", "latin-ext"], weight: ["200", "300", "400"], variable: "--font-franklin" });
const sans = Montserrat({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-montserrat" });

export const metadata: Metadata = {
  title: { default: "Dent Flex — Dental clinic in Istanbul", template: "%s · Dent Flex" },
  description: "Request a consultation with Dent Flex. Clear explanations, published prices and a calm clinic experience.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        {/* Marks JS as available so scroll-reveal content starts hidden only when it can be revealed. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        {children}
      </body>
    </html>
  );
}
