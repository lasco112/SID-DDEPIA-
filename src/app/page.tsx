'use client';

import React, { useEffect, useState } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import OnlineIndicator from '@/components/OnlineIndicator';
import FriseNdop from '@/components/FriseNdop';
import { FOND_REGION } from '@/lib/fondsDepartement';
import { MESSAGE_DEPARTEMENT_ETEINT } from '@/lib/messagesConnexion';

const MESSAGE_IDENTIFIANTS = 'Identifiants incorrects ou compte désactivé. Vérifiez chaque caractère du mot de passe, majuscules comprises.';
const MESSAGE_RESEAU = "La connexion n'a pas abouti : le réseau a sans doute coupé. Vérifiez votre connexion internet, puis réessayez.";

/** Le message français d'une erreur de connexion, quelle qu'en soit l'origine. */
function messageErreur(code: string | null | undefined): string {
  if (!code) return MESSAGE_RESEAU;
  if (code === MESSAGE_DEPARTEMENT_ETEINT) return MESSAGE_DEPARTEMENT_ETEINT;
  if (code === 'CredentialsSignin') return MESSAGE_IDENTIFIANTS;
  return MESSAGE_RESEAU;
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Une erreur de connexion qui a fait quitter la page (réseau coupé au milieu
  // de la connexion) y revient avec « ?error=… » : on la dit en français, puis
  // on nettoie l'adresse.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error');
    if (code) {
      setError(messageErreur(code));
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    let result: Awaited<ReturnType<typeof signIn>>;
    try {
      result = await signIn('credentials', {
        redirect: false,
        username: username.trim(),
        password,
      });
    } catch {
      // Le serveur n'a pas répondu : réseau coupé ou trop faible.
      setError(MESSAGE_RESEAU);
      setLoading(false);
      return;
    }

    if (!result || result.error) {
      setError(messageErreur(result?.error));
      setLoading(false);
      return;
    }

    const session = await getSession();
    if ((session?.user as any)?.mustChangePassword) {
      router.push('/mon-compte/premiere-connexion');
    } else {
      router.push('/dashboard');
    }
  };

  // Mise en page « Indigo des Hautes Terres » (15 octobre 2026) : la photo de
  // la région à gauche — la même qu'avant —, le panneau ivoire à droite ; sur
  // téléphone, la photo devient un bandeau au-dessus du formulaire. Le
  // formulaire, ses champs et sa logique sont inchangés.
  return (
    <div className="grid min-h-screen bg-appbg md:grid-cols-[1.15fr_minmax(420px,0.85fr)]">
      <div className="relative h-[180px] overflow-hidden bg-nuit md:h-auto">
        <img src={FOND_REGION.src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,37,63,.15)_0%,transparent_45%,rgba(16,37,63,.85)_100%)]" />
        <div className="absolute inset-x-5 bottom-4 md:inset-x-12 md:bottom-12">
          <p className="text-[11px] font-bold uppercase tracking-[2.2px] text-or md:text-[13px] md:tracking-[2.4px]">
            Hautes terres de l&apos;Ouest-Cameroun
          </p>
          <p className="mt-1 hidden max-w-[560px] font-titre text-[42px] font-semibold leading-[1.08] text-[#F7F5F0] md:block">
            Les données de l&apos;élevage de l&apos;Ouest, au service du territoire.
          </p>
          <p className="mt-1 text-[11px] text-white/70 md:mt-3 md:text-[12px]">{FOND_REGION.legende}</p>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-180px)] flex-col md:min-h-screen">
        <div className="flex justify-end px-5 pt-5">
          <OnlineIndicator />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-6">
          <div className="w-full max-w-[380px]">
            <img src="/icon-512.png?v=2" alt="SID EPIA-O" className="mb-1 h-[54px] w-[54px] rounded-[10px] shadow-[0_4px_14px_rgba(16,37,63,.18)]" />
            <div aria-hidden="true" className="mb-5 h-[3px] w-[30px] rounded-full bg-or" />
            <p className="text-[13px] font-bold uppercase tracking-[1.4px] text-cuivre">République du Cameroun · MINEPIA</p>
            <h1 className="mt-1 font-titre text-[46px] font-semibold leading-none text-nuit">SID EPIA-O</h1>
            <p className="mb-7 mt-2 text-[15px] leading-snug text-ink-muted">
              Système d'Information Décisionnel de l'Élevage, des Pêches et des Industries Animales — Ouest
            </p>

            {error && (
              <div role="alert" className="mb-4 rounded-input border border-statut-rejeteBorder bg-statut-rejeteBg p-3 text-sm text-statut-rejeteText">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <label htmlFor="connexion-identifiant" className="mb-1.5 block text-[14px] font-bold text-ink">
                Identifiant
              </label>
              <input
                id="connexion-identifiant"
                type="text"
                name="username"
                placeholder="ex : da.dschang"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mb-4 min-h-[46px] w-full rounded-input border border-gray-300 bg-white px-[14px] py-[10px] text-[15px] text-ink placeholder:text-gray-400 focus:border-primary focus:shadow-focus focus:outline-none"
              />

              <label htmlFor="connexion-mot-de-passe" className="mb-1.5 block text-[14px] font-bold text-ink">
                Mot de passe
              </label>
              <input
                id="connexion-mot-de-passe"
                type="password"
                name="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mb-[22px] min-h-[46px] w-full rounded-input border border-gray-300 bg-white px-[14px] py-[10px] text-[15px] text-ink focus:border-primary focus:shadow-focus focus:outline-none"
              />

              <button
                type="submit"
                disabled={loading}
                className="min-h-[48px] w-full rounded-btn bg-primary py-3 text-[15.5px] font-bold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-[#A9B6C6]"
              >
                {loading ? 'Connexion…' : 'Se connecter'}
              </button>
            </form>

            <p className="mt-4 text-[13px] text-ink-faint">Mot de passe oublié ? Contactez le Délégué Départemental.</p>

            <a
              href="/demo"
              className="mt-5 flex min-h-[44px] items-center justify-center rounded-btn border border-gray-300 bg-white text-[14px] font-bold text-primary hover:bg-gray-100"
            >
              Accéder à la démonstration →
            </a>
          </div>
        </div>

        <div>
          <FriseNdop variante="large" />
          <p className="px-5 py-3 text-center text-xs leading-relaxed text-ink-faint">
            Ministère de l'Élevage, des Pêches et des Industries Animales
            <br />
            Usage réservé aux agents habilités · v1.0
          </p>
        </div>
      </div>
    </div>
  );
}