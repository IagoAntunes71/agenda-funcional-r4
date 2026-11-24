import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ProvedorCoresR4 } from '@/components/CoresInterfaceR4';
import { ProvedorTextosR4 } from '@/components/TextosInterfaceR4';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Agenda de Reforço Escolar',
  description: 'Agendamento online de aulas de reforço para fins de semana e feriados.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Agenda Reforço',
  },
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
      <body className={`${inter.className} bg-slate-950 text-slate-100 antialiased`}>
      <ProvedorCoresR4><ProvedorTextosR4>{children}</ProvedorTextosR4></ProvedorCoresR4>
      </body>
      </html>
  );
}