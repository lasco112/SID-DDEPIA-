'use client';

import React, { useEffect, useState } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import OnlineIndicator from '@/components/OnlineIndicator';
import FondPhoto from '@/components/FondPhoto';
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

  return (
    <FondPhoto>
      <div className="flex justify-end p-5">
        <OnlineIndicator />
      </div>

      <div className="flex flex-1 items-center justify-center p-5">
        <div className="w-full max-w-[410px]">
          <div className="mb-[22px] text-center">
            <img
              src="/icon-512.png?v=2"
              alt="SID EPIA-O"
              className="mx-auto mb-3.5 h-16 w-16 rounded-card shadow-[0_4px_14px_rgba(0,0,0,.35)]"
            />
            <div className="text-[13px] font-semibold uppercase tracking-[2px] text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">
              République du Cameroun · MINEPIA
            </div>
          </div>

          <div className="rounded-card border border-line bg-surface p-[30px_30px_26px] shadow-card">
            <h1 className="mb-1 text-2xl font-bold text-primary">SID EPIA-O</h1>
            <p className="mb-6 text-[13.5px] text-ink-muted">
              Système d'Information Décisionnel de l'Élevage, des Pêches et des Industries Animales — Ouest
            </p>

            {error && <div className="mb-4 rounded-input bg-statut-rejeteBg p-3 text-sm text-statut-rejeteText">{error}</div>}

            <form onSubmit={handleSubmit}>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink">Identifiant</label>
              <input
                type="text"
                name="username"
                placeholder="ex : da.dschang"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mb-4 min-h-[48px] w-full rounded-input border border-line px-[14px] py-[11px] text-[15px] text-ink focus:border-aqua focus:shadow-focus focus:outline-none"
              />

              <label className="mb-1.5 block text-[13px] font-semibold text-ink">Mot de passe</label>
              <input
                type="password"
                name="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mb-[22px] min-h-[48px] w-full rounded-input border border-line px-[14px] py-[11px] text-[15px] text-ink focus:border-aqua focus:shadow-focus focus:outline-none"
              />

              <button
                type="submit"
                disabled={loading}
                className="min-h-[46px] w-full rounded-btn bg-primary py-3 text-[15.5px] font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Connexion…' : 'Se connecter'}
              </button>
            </form>

            <div className="mt-4 text-center text-[13px] text-ink-faint">
              Mot de passe oublié ? Contactez le Délégué Départemental.
            </div>
          </div>

          <div className="mt-4 text-center">
            <a
              href="/demo"
              className="inline-block rounded-btn bg-black/25 px-3 py-1.5 text-[13.5px] font-semibold text-white backdrop-blur-sm hover:bg-black/35"
            >
              Accéder à la démonstration →
            </a>
          </div>

          <p className="mt-5 text-center text-xs leading-relaxed text-white/85 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">
            Ministère de l'Élevage, des Pêches et des Industries Animales
            <br />
            Usage réservé aux agents habilités · v1.0
          </p>
        </div>
      </div>
    </FondPhoto>
  );
}
