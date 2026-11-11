import type { Metadata } from "next";
import { Cormorant_Garamond, Outfit } from "next/font/google";

import { Providers } from "@/components/providers";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-outfit",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Allure Bloom",
    template: "%s · Allure Bloom",
  },
  description:
    "Allure Bloom is a lash studio. Published treatments are listed without confirmed prices, durations, or studio assignments.",
  icons: {
    icon: "/brand/allure-bloom-symbol.png",
  },
  openGraph: {
    title: "Allure Bloom",
    description:
      "Allure Bloom is a lash studio. Published treatments are listed without confirmed prices, durations, or studio assignments.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${cormorant.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <Providers>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          {children}
        </Providers>
      </body>
    </html>
  );
}
