import { metadadosPwaR4 } from '@/lib/pwa-r4';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ProvedorCoresR4 } from '@/components/CoresInterfaceR4';
import { ProvedorTextosR4 } from '@/components/TextosInterfaceR4';

const inter = Inter({ subsets: ['latin'], variable: '--r4-fonte-painel' });

export const metadata: Metadata = {
  ...metadadosPwaR4('portal'),
  description: 'Agendamento online de aulas de reforço da R4 Ensina.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#020617',
};

export default function RootLayout({
                                     children,
                                   }: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <html lang="pt-BR">
      <body className={`${inter.className} ${inter.variable} bg-slate-950 text-slate-100 antialiased`}>
      <ProvedorCoresR4><ProvedorTextosR4>{children}</ProvedorTextosR4></ProvedorCoresR4>
      </body>
      </html>
  );
}