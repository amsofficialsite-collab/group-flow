import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GROUP FLOW",
  description: "Facebook Group content and posting management",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
