"use client";

/**
 * Accueil de la démonstration (correction n°10, §10.1 ; refait à la demande du
 * Délégué, 14 octobre 2026) : la personne choisit SA FONCTION, et entre dans le
 * compte de démonstration qui lui correspond — sans identifiant ni mot de
 * passe à taper. Pensé pour les formations des départements qui rejoignent le
 * SID, d'abord sur téléphone.
 *
 * Authentifie exclusivement contre la base DEMO_DATABASE_URL (fournisseur
 * NextAuth « demo », jamais « credentials ») : un compte réel ne peut jamais
 * se connecter ici, et un compte démo jamais sur la page réelle. Le mot de
 * passe de démonstration, commun et public, n'ouvre que cette base fictive.
 */

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Building2, ClipboardList, FileSpreadsheet, Fish, Landmark, Stethoscope, Wheat, type LucideIcon } from "lucide-react";

const MOT_DE_PASSE_DEMO = "Demo!2026";

interface Variante {
  username: string;
  libelle: string;
}

interface Fonction {
  titre: string;
  description: string;
  Icone: LucideIcon;
  username: string;
  /** Pour le DA : d'autres situations du mois en cours, à essayer. */
  variantes?: Variante[];
}

const FONCTIONS: Fonction[] = [
  {
    titre: "Délégué départemental",
    description: "Suivre les arrondissements, relire, produire les rapports du département et la note de situation.",
    Icone: Landmark,
    username: "demo.dd",
  },
  {
    titre: "Délégué d'arrondissement",
    description: "Remplir et transmettre les tableaux, produire le rapport de son arrondissement.",
    Icone: Building2,
    username: "demo.da.dschang",
    variantes: [
      { username: "demo.da.dschang", libelle: "Rapport transmis (Dschang)" },
      { username: "demo.da.fokoue", libelle: "Encore en saisie (Fokoué)" },
      { username: "demo.da.nkongni", libelle: "Renvoyé par le DD (Nkong-Ni)" },
      { username: "demo.da.fongotongo", libelle: "Plusieurs foyers de maladie (Fongo-Tongo)" },
    ],
  },
  {
    titre: "Agent de saisie / chef de centre",
    description: "Remplir les tableaux du mois et du trimestre ; le DA relit et transmet.",
    Icone: ClipboardList,
    username: "demo.agent.dschang",
  },
  {
    titre: "Chef de la section PSA",
    description: "Productions et statistiques animales : contrôler les chiffres, valider sa section.",
    Icone: Wheat,
    username: "demo.chef.psa",
  },
  {
    titre: "Chef de la section SSV",
    description: "Services vétérinaires : santé animale, vaccinations, foyers ; valider sa section.",
    Icone: Stethoscope,
    username: "demo.chef.ssv",
  },
  {
    titre: "Chef de la section SPAIH",
    description: "Pêches, aquaculture et industries halieutiques : contrôler, valider sa section.",
    Icone: Fish,
    username: "demo.chef.spaih",
  },
  {
    titre: "Chef du BAC",
    description: "Affaires communes : personnel, budget, recettes, infrastructures du rapport trimestriel.",
    Icone: FileSpreadsheet,
    username: "demo.chef.bac",
  },
];

export default function DemoLoginPage() {
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState("");
  const router = useRouter();

  async function entrer(username: string) {
    setErreur("");
    setEnCours(username);
    const result = await signIn("demo", { redirect: false, username, password: MOT_DE_PASSE_DEMO });
    if (result?.error) {
      setErreur("La démonstration n'est pas disponible pour le moment. Prévenez l'administrateur du SID.");
      setEnCours(null);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-brand-gradient-soft">
      <div className="sticky top-0 z-50 bg-alerte py-2 text-center text-sm font-bold uppercase tracking-wide text-white">
        Mode démonstration — Données fictives
      </div>

      <div className="mx-auto w-full max-w-[880px] flex-1 p-4 sm:p-6">
        <div className="mb-5 text-center">
          <img src="/icon-512.png?v=2" alt="SID EPIA-O" className="mx-auto mb-3 h-14 w-14 rounded-card shadow-[0_4px_14px_rgba(57,119,129,.28)]" />
          <h1 className="text-2xl font-bold text-primary">SID EPIA-O — Démonstration</h1>
          <p className="mx-auto mt-1 max-w-[560px] text-[14px] text-ink-muted">
            Quelle est votre fonction ? Touchez-la : vous entrez dans le SID avec exactement ce que vous y verrez dans votre
            travail. Données fictives, sans aucun lien avec la production.
          </p>
        </div>

        {erreur && <div className="mb-4 rounded-input bg-statut-rejeteBg p-3 text-center text-sm text-statut-rejeteText">{erreur}</div>}

        <div className="grid gap-3 sm:grid-cols-2">
          {FONCTIONS.map((f) => (
            <div key={f.titre} className="rounded-card border border-line bg-surface shadow-card">
              <button
                type="button"
                onClick={() => entrer(f.username)}
                disabled={enCours !== null}
                className="flex w-full items-start gap-3 rounded-card p-4 text-left hover:bg-primary-light disabled:cursor-wait disabled:opacity-70"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
                  <f.Icone size={22} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-bold text-primary-dark">
                    {enCours === f.username ? "Entrée en cours…" : f.titre}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{f.description}</span>
                </span>
              </button>
              {f.variantes && (
                <div className="border-t border-line px-4 pb-3 pt-2">
                  <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Ou une autre situation d&apos;octobre</p>
                  <div className="flex flex-wrap gap-1.5">
                    {f.variantes.slice(1).map((v) => (
                      <button
                        key={v.username}
                        type="button"
                        onClick={() => entrer(v.username)}
                        disabled={enCours !== null}
                        className="min-h-[36px] rounded-full border border-line px-3 text-[12.5px] text-ink hover:border-primary hover:text-primary disabled:opacity-60"
                      >
                        {enCours === v.username ? "Entrée en cours…" : v.libelle}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="mt-5 text-center text-[13px] text-ink-faint">
          D&apos;avril à septembre 2026 : mois clos et complets. Octobre 2026 : le mois en cours, pour s&apos;exercer.
        </p>
        <div className="mt-2 text-center text-[13px] text-ink-faint">
          <a href="/" className="hover:underline">
            ← Retour à la connexion réelle
          </a>
        </div>
      </div>
    </div>
  );
}
