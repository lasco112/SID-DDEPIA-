import './globals.css';
import { ReactNode } from 'react';
import { Manrope } from 'next/font/google';
import Providers from '@/components/Providers';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import SplashScreen from '@/components/SplashScreen';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });

export const metadata = {
  title: "SID DDEPIA-Menoua",
  description: "Système d'Information Décisionnel de reporting mensuel",
};

export const viewport = {
  themeColor: "#397781",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={manrope.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="font-sans text-[15px] leading-[1.45] text-ink antialiased">
        <ServiceWorkerRegister />
        <SplashScreen />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
