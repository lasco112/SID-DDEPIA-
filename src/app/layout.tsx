import './globals.css';
import { ReactNode } from 'react';
import { Manrope } from 'next/font/google';
import Providers from '@/components/Providers';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import NavigationHorsLigne from '@/components/NavigationHorsLigne';
import SplashScreen from '@/components/SplashScreen';
import DemoBanner from '@/components/DemoBanner';

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
        <link rel="manifest" href="/manifest.json?v=2" />
        {/* ?v=2 : le nom de fichier du logo n'ayant pas change lors de sa
            refonte, les navigateurs (surtout la base de favicons de Chrome,
            que ni le cache HTTP ni le service worker ne controlent) servaient
            l'ancienne image indefiniment. Changer l'URL est le seul moyen sur
            de forcer le retelechargement sur les appareils deja installes ;
            incrementer ce numero a chaque futur changement de logo. */}
        <link rel="icon" href="/icon-192.png?v=2" />
        <link rel="apple-touch-icon" href="/icon-192.png?v=2" />
      </head>
      <body className="font-sans text-[15px] leading-[1.45] text-ink antialiased">
        <ServiceWorkerRegister />
        <NavigationHorsLigne />
        <SplashScreen />
        <Providers>
          <DemoBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
