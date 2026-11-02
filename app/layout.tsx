import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "London Court Finder",
  description: "Find nearby tennis and padel courts with free slots in London.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
