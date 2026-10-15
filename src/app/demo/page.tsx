"use client";

/**
 * Accueil de la démonstration (correction n°10, §10.1 ; refait à la demande du
 * Délégué, 15 octobre 2026). Trois choix, sans rien taper :
 *   1. son DÉPARTEMENT ;
 *   2. sa FONCTION, nommée pour ce département (« Délégué départemental des
 *      Bamboutos ») ;
 *   3. pour un DA ou un agent de saisie / chef de CZV, son ARRONDISSEMENT.
 * Puis on entre dans le compte de démonstration qui correspond, avec exactement
 * les écrans de son rôle. Pensé d'abord pour le téléphone.
 *
 * Authentifie exclusivement contre la base DEMO_DATABASE_URL (fournisseur
 * NextAuth « demo », jamais « credentials ») : un compte réel ne peut jamais
 * se connecter ici, et un compte démo jamais sur la page réelle. Le mot de
 * passe de démonstration, commun et public, n'ouvre que cette base fictive.
 */

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, ClipboardList, FileSpreadsheet, Fish, Landmark, MapPin, Stethoscope, Wheat, type LucideIcon } from "lucide-react";

const MOT_DE_PASSE_DEMO = "Demo!2026";

interface Arrondissement {
  nom: string;
  da: string | null;
  agent: string | null;
  situation: string | null;
}

interface Departement {
  code: string;
  nom: string;
  nomAvecArticle: string;
  dd: string;
  chefs: { PSA: string | null; SSV: string | null; SPAIH: string | null; BAC: string | null };
  arrondissements: Arrondissement[];
}

type Fonction = "DD" | "DA" | "AGENT" | "PSA" | "SSV" | "SPAIH" | "BAC";

const FONCTIONS: { cle: Fonction; titre: (d: Departement) => string; description: string; Icone: LucideIcon }[] = [
  { cle: "DD", titre: (d) => `Délégué départemental ${d.nomAvecArticle}`, description: "Suivre les arrondissements, relire, produire les rapports du département et la note de situation.", Icone: Landmark },
  { cle: "DA", titre: () => "Délégué d'arrondissement", description: "Remplir et transmettre les tableaux, produire le rapport de son arrondissement.", Icone: Building2 },
  { cle: "AGENT", titre: () => "Agent de saisie / chef de CZV", description: "Remplir les tableaux du mois et du trimestre ; le DA relit et transmet.", Icone: ClipboardList },
  { cle: "PSA", titre: () => "Chef de la section PSA", description: "Productions et statistiques animales : contrôler les chiffres, valider sa section.", Icone: Wheat },
  { cle: "SSV", titre: () => "Chef de la section SSV", description: "Services vétérinaires : santé animale, vaccinations, foyers ; valider sa section.", Icone: Stethoscope },
  { cle: "SPAIH", titre: () => "Chef de la section SPAIH", description: "Pêches, aquaculture et industries halieutiques : contrôler, valider sa section.", Icone: Fish },
  { cle: "BAC", titre: () => "Chef du BAC", description: "Affaires communes : personnel, budget, recettes, infrastructures du rapport trimestriel.", Icone: FileSpreadsheet },
];

function Carte({ titre, description, Icone, onClick, desactive, enCours }: { titre: string; description?: string; Icone: LucideIcon; onClick: () => void; desactive: boolean; enCours?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactive}
      className="flex w-full items-start gap-3 rounded-card border border-line bg-surface p-4 text-left shadow-card hover:bg-primary-light disabled:cursor-wait disabled:opacity-70"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
        <Icone size={22} />
      </span>
      <span className="min-w-0">
        <span className="block text-[16px] font-bold text-primary-dark">{enCours ? "Entrée en cours…" : titre}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{description}</span>}
      </span>
    </button>
  );
}

export default function DemoLoginPage() {
  const [departements, setDepartements] = useState<Departement[] | null>(null);
  const [disponible, setDisponible] = useState(true);
  const [departement, setDepartement] = useState<Departement | null>(null);
  const [fonction, setFonction] = useState<Fonction | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/demo/comptes")
      .then((r) => r.json())
      .then((j) => {
        setDisponible(Boolean(j.disponible));
        setDepartements(j.departements ?? []);
      })
      .catch(() => {
        setDisponible(false);
        setDepartements([]);
      });
  }, []);

  async function entrer(username: string | null) {
    if (!username) {
      setErreur("Ce compte de démonstration n'existe pas encore. Prévenez l'administrateur du SID.");
      return;
    }
    setErreur("");
    setEnCours(username);
    const result = await signIn("demo", { redirect: false, username, password: MOT_DE_PASSE_DEMO }).catch(() => null);
    if (!result || result.error) {
      setErreur("La démonstration n'est pas disponible pour le moment. Prévenez l'administrateur du SID.");
      setEnCours(null);
      return;
    }
    router.push("/dashboard");
  }

  function choisirFonction(f: Fonction) {
    if (!departement) return;
    if (f === "DA" || f === "AGENT") {
      setFonction(f);
      return;
    }
    void entrer(f === "DD" ? departement.dd : departement.chefs[f]);
  }

  const retour = () => {
    setErreur("");
    if (fonction) setFonction(null);
    else setDepartement(null);
  };

  const etape = !departement ? 1 : !fonction ? 2 : 3;
  const titreFonction = fonction ? FONCTIONS.find((f) => f.cle === fonction)!.titre(departement!) : "";

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
            {etape === 1 && "Choisissez votre département."}
            {etape === 2 && <>Département {departement!.nomAvecArticle} : quelle est votre fonction ?</>}
            {etape === 3 && <>{titreFonction} — choisissez votre arrondissement.</>}
          </p>
          <p className="mt-1 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
            {etape === 1 ? "Département" : etape === 2 ? "Département › Fonction" : "Département › Fonction › Arrondissement"}
          </p>
        </div>

        {erreur && <div className="mb-4 rounded-input bg-statut-rejeteBg p-3 text-center text-sm text-statut-rejeteText">{erreur}</div>}

        {etape > 1 && (
          <button type="button" onClick={retour} className="mb-3 flex min-h-[40px] items-center gap-1.5 text-[14px] font-semibold text-primary hover:underline">
            <ArrowLeft size={16} /> Revenir
          </button>
        )}

        {departements === null && <p className="text-center text-ink-muted">Chargement…</p>}
        {departements !== null && !disponible && (
          <p className="rounded-card border border-amber-200 bg-amber-50 p-4 text-center text-[14px] text-amber-900">
            La démonstration n&apos;est pas encore disponible sur ce serveur. Prévenez l&apos;administrateur du SID.
          </p>
        )}

        {etape === 1 && departements && departements.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {departements.map((d) => (
              <Carte key={d.code} titre={`Département ${d.nomAvecArticle}`} description={`${d.arrondissements.length} arrondissement${d.arrondissements.length > 1 ? "s" : ""} : ${d.arrondissements.map((a) => a.nom).join(", ")}`} Icone={MapPin} onClick={() => setDepartement(d)} desactive={false} />
            ))}
          </div>
        )}

        {etape === 2 && departement && (
          <div className="grid gap-3 sm:grid-cols-2">
            {FONCTIONS.map((f) => {
              const username = f.cle === "DD" ? departement.dd : f.cle === "DA" || f.cle === "AGENT" ? null : departement.chefs[f.cle];
              return (
                <Carte key={f.cle} titre={f.titre(departement)} description={f.description} Icone={f.Icone} onClick={() => choisirFonction(f.cle)} desactive={enCours !== null} enCours={username !== null && enCours === username} />
              );
            })}
          </div>
        )}

        {etape === 3 && departement && (
          <div className="grid gap-3 sm:grid-cols-2">
            {departement.arrondissements.map((a) => {
              const username = fonction === "DA" ? a.da : a.agent;
              return (
                <Carte
                  key={a.nom}
                  titre={fonction === "DA" ? `DA de ${a.nom}` : `Agent de saisie de ${a.nom}`}
                  description={a.situation ?? undefined}
                  Icone={Building2}
                  onClick={() => void entrer(username)}
                  desactive={enCours !== null}
                  enCours={username !== null && enCours === username}
                />
              );
            })}
          </div>
        )}

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
