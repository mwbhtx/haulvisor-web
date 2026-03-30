import type { Metadata } from "next";
import localFont from "next/font/local";
import { Archivo } from "next/font/google";
import { Providers } from "@/platform/web/components/providers";
import "./globals.css";

const interstate = localFont({
  src: [
    { path: "../../public/fonts/Interstate Regular/Interstate Regular.otf", weight: "400" },
    { path: "../../public/fonts/Interstate Bold/Interstate Bold.otf", weight: "700" },
  ],
  variable: "--font-interstate",
});

const gapSans = localFont({
  src: [
    { path: "../../public/fonts/GapSans-master/fonts/GapSans.ttf", weight: "400" },
    { path: "../../public/fonts/GapSans-master/fonts/GapSansBold.ttf", weight: "700" },
    { path: "../../public/fonts/GapSans-master/fonts/GapSansBlack.ttf", weight: "900" },
  ],
  variable: "--font-gap-sans",
});

const interstateMono = localFont({
  src: "../../public/fonts/Interstate Mono Regular/Interstate Mono Regular.otf",
  variable: "--font-interstate-mono",
});

const malloy = localFont({
  src: "../../public/fonts/Malloy Regular/Malloy Regular.ttf",
  variable: "--font-malloy",
});

const sohneMono = localFont({
  src: [
    { path: "../../public/fonts/SohneMono-font/SohneMono-Leicht.ttf", weight: "300" },
    { path: "../../public/fonts/SohneMono-font/SohneMono-Buch.ttf", weight: "400" },
    { path: "../../public/fonts/SohneMono-font/SohneMono-Kraftig.ttf", weight: "500" },
    { path: "../../public/fonts/SohneMono-font/SohneMono-Halbfett.ttf", weight: "600" },
    { path: "../../public/fonts/SohneMono-font/SohneMono-Fett.ttf", weight: "700" },
  ],
  variable: "--font-sohne-mono",
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export const metadata: Metadata = {
  title: "haulvisor",
  description: "Stop guessing. Start hauling.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${interstate.variable} ${malloy.variable} ${interstateMono.variable} ${sohneMono.variable} ${archivo.variable} ${gapSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
