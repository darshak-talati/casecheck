import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Using Inter for a clean, premium look
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CaseCheck - Immigration QA",
  description: "AI-powered immigration document verification.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className + " min-h-screen bg-background font-sans antialiased text-slate-900"}>
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
