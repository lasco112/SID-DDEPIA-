"use client";

/**
 * Connexion à l'environnement de démonstration (correction n°10, §10.1).
 * Authentifie exclusivement contre la base DEMO_DATABASE_URL (provider NextAuth
 * "demo", jamais "credentials") — un compte réel ne peut jamais se connecter
 * ici, et un compte démo ne peut jamais se connecter sur la page réelle.
 */

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const COMPTES_DEMO = [
  { username: "demo.dd", role: "Délégué Départemental", acces: "Données consolidées des 6 arrondissements et des 4 sections", actions: "Superviser, générer le rapport départemental, valider ou retourner" },
  { username: "demo.chef.ssv", role: "Chef — Services Vétérinaires", acces: "Tableaux 3.1 à 3.5 (+ 2.1 en lecture) sur les 6 arrondissements", actions: "Contrôler, corriger, valider sa section" },
  { username: "demo.chef.psa", role: "Chef — Productions Animales", acces: "Tableaux des sections 1, 2, 4, 5 sur les 6 arrondissements", actions: "Contrôler, corriger, valider sa section" },
  { username: "demo.chef.spaih", role: "Chef — Pêches et Aquaculture", acces: "Tableaux 1.6 et 1.7 sur les 6 arrondissements", actions: "Contrôler, corriger, valider sa section" },
  { username: "demo.chef.bac", role: "Chef — Affaires Communes", acces: "Aucun tableau propre (comme en production)", actions: "Consultation générale" },
  { username: "demo.da.dschang", role: "Délégué d'Arrondissement — Dschang", acces: "Uniquement les données de Dschang", actions: "Saisir, envoyer, générer son rapport" },
  { username: "demo.da.fongotongo", role: "Délégué d'Arrondissement — Fongo-Tongo", acces: "Uniquement Fongo-Tongo (plusieurs acteurs et foyers ce mois-ci)", actions: "Saisir, envoyer, générer son rapport" },
  { username: "demo.admin", role: "Administrateur", acces: "Ensemble du système de démonstration", actions: "Tout consulter, réinitialiser la démonstration" },
];

export default function DemoLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("Demo!2026");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("demo", { redirect: false, username, password });
    if (result?.error) {
      setError("Identifiant ou mot de passe de démonstration incorrect.");
      setLoading(false);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-brand-gradient-soft">
      <div className="sticky top-0 z-50 bg-alerte py-2 text-center text-sm font-bold uppercase tracking-wide text-white">
        Mode démonstration — Données fictives
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-5 lg:flex-row lg:items-start lg:justify-center lg:gap-12 lg:pt-16">
        <div className="w-full max-w-[410px]">
          <div className="mb-[22px] text-center">
            <div className="mx-auto mb-3.5 flex h-16 w-16 items-center justify-center rounded-card bg-primary text-[15px] font-bold tracking-wide text-white shadow-[0_4px_14px_rgba(57,119,129,.28)]">
              DDEPIA
            </div>
            <div className="text-[13px] font-semibold uppercase tracking-[2px] text-ink-faint">
              Environnement de démonstration
            </div>
          </div>

          <div className="rounded-card border border-line bg-surface p-[30px_30px_26px] shadow-card">
            <h1 className="mb-1 text-2xl font-bold text-primary">SID DDEPIA-Menoua — Démo</h1>
            <p className="mb-6 text-[13.5px] text-ink-muted">
              Données entièrement fictives, isolées de la production. Choisissez un identifiant ci-contre ou saisissez-le directement.
            </p>

            {error && <div className="mb-4 rounded-input bg-statut-rejeteBg p-3 text-sm text-statut-rejeteText">{error}</div>}

            <form onSubmit={handleSubmit}>
              <label className="mb-1.5 block text-[13px] font-semibold text-ink">Identifiant démo</label>
              <input
                type="text"
                placeholder="ex : demo.da.dschang"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mb-4 min-h-[48px] w-full rounded-input border border-line px-[14px] py-[11px] text-[15px] text-ink focus:border-aqua focus:shadow-focus focus:outline-none"
              />

              <label className="mb-1.5 block text-[13px] font-semibold text-ink">Mot de passe démo</label>
              <input
                type="password"
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
                {loading ? "Connexion…" : "Entrer dans la démonstration"}
              </button>
            </form>

            <div className="mt-4 text-center text-[13px] text-ink-faint">
              <a href="/" className="hover:underline">← Retour à la connexion réelle</a>
            </div>
          </div>
        </div>

        <div className="w-full max-w-[520px]">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">Comptes de démonstration</h2>
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-primary-light text-left">
                  <th className="px-3 py-2">Identifiant</th>
                  <th className="px-3 py-2">Rôle</th>
                  <th className="px-3 py-2">Accès</th>
                </tr>
              </thead>
              <tbody>
                {COMPTES_DEMO.map((c) => (
                  <tr key={c.username} className="border-t border-line">
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setUsername(c.username)} className="font-mono text-primary hover:underline">
                        {c.username}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-ink">{c.role}</td>
                    <td className="px-3 py-2 text-ink-muted">{c.acces}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-faint">Mot de passe pour tous les comptes démo : <span className="font-mono">Demo!2026</span></p>
        </div>
      </div>
    </div>
  );
}
