import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PaisaPilot | Your money, in focus',
  description: 'A calm personal money OS for seeing, understanding, planning, and acting.',
  metadataBase: new URL('https://paisapilot.app')
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN"><body>{children}</body></html>;
}