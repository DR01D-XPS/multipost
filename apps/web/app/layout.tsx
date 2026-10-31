import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "../components/app-shell";
import { themeInitScript } from "../lib/theme";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk"
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"]
});

export const metadata: Metadata = {
  title: "Один пост на все соцсети",
  description: "Черновики, публикация и предпросмотр для Telegram, VK и MAX.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
