import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'm2rd',
  description: 'Mermaid to React Diagrams — a local-first Mermaid diagram editor.',
  alternates: { canonical: 'https://jeffry.in/m2rd/' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
