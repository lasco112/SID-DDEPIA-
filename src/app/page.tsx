'use client';

import React, { useState } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import OnlineIndicator from '@/components/OnlineIndicator';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('credentials', {
      redirect: false,
      username,
      password,
    });

    if (result?.error) {
      setError('Identifiants incorrects ou compte désactivé.');
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
    <div className="flex min-h-screen flex-col bg-brand-gradient-soft">
      <div className="flex justify-end p-5">
        <OnlineIndicator />
      </div>

      <div className="flex flex-1 items-center justify-center p-5">
        <div className="w-full max-w-[410px]">
          <div className="mb-[22px] text-center">
            <div className="mx-auto mb-3.5 flex h-16 w-16 items-center justify-center rounded-card bg-primary text-[15px] font-bold tracking-wide text-white shadow-[0_4px_14px_rgba(57,119,129,.28)]">
              DDEPIA
            </div>
            <div className="text-[13px] font-semibold uppercase tracking-[2px] text-ink-faint">
              République du Cameroun · MINEPIA
            </div>
          </div>

          <div className="rounded-card border border-line bg-surface p-[30px_30px_26px] shadow-card">
            <h1 className="mb-1 text-2xl font-bold text-primary">SID DDEPIA-Menoua</h1>
            <p className="mb-6 text-[13.5px] text-ink-muted">
              Système d'Information Décisionnel — Délégation Départementale de la Menoua
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

          <p className="mt-5 text-center text-xs leading-relaxed text-ink-faint">
            Ministère de l'Élevage, des Pêches et des Industries Animales
            <br />
            Usage réservé aux agents habilités · v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
