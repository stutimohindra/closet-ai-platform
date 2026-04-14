import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Closet AI",
  description:
    "Upload clothing images to S3, browse your saved closet, and generate outfit ideas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
