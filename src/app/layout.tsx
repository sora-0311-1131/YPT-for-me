import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YPT for me",
  description: "NFC物理トリガー × iOSショートカット × Supabase 個人用学習・作業トラッカー",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
