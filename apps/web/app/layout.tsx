import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Job Finder", template: "%s · Job Finder" },
  description: "Freelance job matching dashboard",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-zinc-50 text-zinc-900">{children}</body>
    </html>
  );
}
