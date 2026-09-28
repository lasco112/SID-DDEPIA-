/**
 * Page d'accueil — « ce que j'ai à faire maintenant ».
 *
 * Demande du Délégué (27 septembre 2026) : à l'ouverture, chacun doit voir
 * tout de suite le rapport du moment et le bouton pour s'y mettre — le mois
 * en cours, et le trimestre à rapporter — plutôt que des compteurs. Une carte
 * par rapport, avec son état, son échéance, et pour le trimestriel ses étapes
 * dans l'ordre. La carte urgente (échéance proche, trimestre échu non
 * transmis) passe devant, et se voit.
 */
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { PrismaClient } from "@prisma/client";
import { resoudrePeriode, libellePeriode } from "@/server/periodes/courante";
import { trimestrielle } from "@/server/periodes/calendrier";
import { etatCircuit, codeSection } from "@/server/trimestre/circuit";
import { trimestreARapporter } from "@/lib/trimestreEchu";
import { authOptions } from "@/lib/auth";
import { contexteSession } from "@/lib/permissions";
import { MENU_PAR_ROLE, etapesTrimestrielles, TITRE_MENSUEL, TITRE_TRIMESTRIEL } from "@/lib/navItems";
import AppShell from "@/components/AppShell";
import NotificationsPanel from "@/components/NotificationsPanel";

interface Lien {
  href: string;
  label: string;
}

interface Carte {
  titre: string;
  periode: string;
  /** L'état, en une phrase. */
  etat: string;
  ton: "neutre" | "attention" | "fait";
  echeance?: string;
  /** Échéance proche ou dépassée, rapport pas encore transmis : la carte passe devant. */
  urgent: boolean;
  /** Une précision en petit, sous les étapes. */
  note?: string;
  bouton?: Lien;
  /** Les étapes numérotées (trimestriel), avec ce à quoi chacune sert. */
  etapes?: (Lien & { numero: number; aide?: string })[];
  etapesFaites?: boolean;
  liens?: Lien[];
}

/** « 1er octobre », « 12 octobre ». */
const le = (d: Date | string) => {
  const date = new Date(d);
  const texte = date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return date.getDate() === 1 ? texte.replace(/^1 /, "1er ") : texte;
};

function joursRestants(cible: Date): number {
  return Math.ceil((cible.getTime() - Date.now()) / 86_400_000);
}

function phraseEcheance(cible: Date, verbe: string): { texte: string; proche: boolean } {
  const j = joursRestants(cible);
  if (j < 0) return { texte: `Échéance dépassée depuis ${-j} jour${-j > 1 ? "s" : ""} (${le(cible)})`, proche: true };
  if (j === 0) return { texte: `${verbe} aujourd'hui (${le(cible)})`, proche: true };
  return { texte: `${verbe} avant le ${le(cible)} — reste ${j} jour${j > 1 ? "s" : ""}`, proche: j <= 7 };
}

const ordinal = (n: number) => (n === 1 ? "1er" : `${n}e`);

/** « Aucun arrondissement n'a encore transmis », « 1 arrondissement sur 6 a transmis », « 4 … ont transmis ». */
function transmisSur6(n: number): string {
  if (n === 0) return "Aucun arrondissement n'a encore transmis";
  return n === 1 ? "1 arrondissement sur 6 a transmis" : `${n} arrondissements sur 6 ont transmis`;
}

/** « aucune section validée », « 1 section sur 4 validée », « 3 sections sur 4 validées ». */
function valideesSur4(n: number): string {
  if (n === 0) return "aucune section validée";
  return n === 1 ? "1 section sur 4 validée" : `${n} sections sur 4 validées`;
}

/** Les écrans du mensuel du rôle, tels que le menu les nomme. */
function liensMensuels(role: string): Lien[] {
  return (MENU_PAR_ROLE[role] ?? []).find((g) => g.cle === "mensuel")?.items ?? [];
}

async function carteMensuelle(
  db: PrismaClient,
  moi: { role: string; arrondissementId?: string | null; sectionId?: string | null }
): Promise<Carte | null> {
  const role = moi.role;
  if (role === "ADMIN_TECH") return null;
  const liens = liensMensuels(role);
  const periode = await resoudrePeriode(db);
  if (!periode) {
    return {
      titre: TITRE_MENSUEL,
      periode: "Aucun mois ouvert",
      etat: role === "DD" ? "Ouvrez le mois à saisir." : "Le Délégué départemental n'a pas encore ouvert de mois.",
      ton: "attention",
      urgent: role === "DD",
      bouton: role === "DD" ? { href: "/dd/periodes", label: "Ouvrir un mois" } : undefined,
    };
  }
  const mois = libellePeriode(periode);
  const nomDuMois = mois.split(" ")[0].toLowerCase();
  // « les tableaux d'août », « d'avril », « d'octobre » ; « de juillet ».
  const moisSeul = /^[aeiouéh]/.test(nomDuMois) ? `d'${nomDuMois}` : `de ${nomDuMois}`;

  if (role === "DA" || role === "AGENT_SAISIE") {
    const rapport = moi.arrondissementId
      ? await db.rapportArrondissement.findUnique({
          where: { periodeId_arrondissementId: { periodeId: periode.id, arrondissementId: moi.arrondissementId } },
          select: { statut: true, dateSoumission: true, motifRejet: true },
        })
      : null;
    const statut = rapport?.statut ?? "EN_SAISIE";
    const transmis = statut === "SOUMIS" || statut === "CLOTURE";
    const e = phraseEcheance(periode.dateLimiteDA, "À transmettre");
    const etat = transmis
      ? `Transmis au DD${rapport?.dateSoumission ? ` le ${le(rapport.dateSoumission)}` : ""}.`
      : statut === "REJETE"
        ? `Renvoyé par le DD pour correction${rapport?.motifRejet ? ` : ${rapport.motifRejet}` : "."}`
        : role === "DA"
          ? "En cours de saisie. Vous l'envoyez au DD une fois les tableaux remplis."
          : "En cours de saisie. Votre DA l'enverra au DD.";
    return {
      titre: TITRE_MENSUEL,
      periode: mois,
      etat,
      ton: transmis ? "fait" : statut === "REJETE" ? "attention" : "neutre",
      echeance: transmis ? undefined : e.texte,
      urgent: !transmis && (e.proche || statut === "REJETE"),
      bouton: {
        href: "/da/saisie",
        label: transmis
          ? `Consulter les tableaux ${moisSeul}`
          : role === "DA"
            ? `Remplir et envoyer les tableaux ${moisSeul}`
            : `Remplir les tableaux ${moisSeul}`,
      },
      liens: liens.filter((l) => l.href !== "/da/saisie"),
    };
  }

  if (role === "DD") {
    const rapports = await db.rapportArrondissement.findMany({ where: { periodeId: periode.id }, select: { statut: true } });
    const soumis = rapports.filter((r) => r.statut === "SOUMIS" || r.statut === "CLOTURE").length;
    const rejetes = rapports.filter((r) => r.statut === "REJETE").length;
    const e = phraseEcheance(periode.dateLimiteDD, "À clôturer");
    return {
      titre: TITRE_MENSUEL,
      periode: mois,
      etat: `${transmisSur6(soumis)}${rejetes ? ` · ${rejetes} renvoyé${rejetes > 1 ? "s" : ""} pour correction` : ""}.`,
      ton: soumis === 6 ? "fait" : "neutre",
      echeance: e.texte,
      urgent: soumis < 6 && e.proche,
      bouton: { href: "/dd/supervision", label: "Suivre les arrondissements" },
      liens: [
        ...liens.filter((l) => l.href !== "/dd/supervision"),
        { href: `/api/exports/drepia?periodeId=${periode.id}`, label: "Exporter le mois vers la DREPIA (Excel)" },
      ],
    };
  }

  // Chefs de section
  const validation = moi.sectionId
    ? await db.validationSection.findUnique({
        where: { periodeId_sectionId: { periodeId: periode.id, sectionId: moi.sectionId } },
        select: { statut: true },
      })
    : null;
  const valide = validation?.statut === "VALIDE";
  const e = phraseEcheance(periode.dateLimiteChef, "À contrôler");
  return {
    titre: TITRE_MENSUEL,
    periode: mois,
    etat: valide ? "Votre section est validée pour ce mois." : "Contrôlez les chiffres des arrondissements de votre section.",
    ton: valide ? "fait" : "neutre",
    echeance: valide ? undefined : e.texte,
    urgent: !valide && e.proche,
    bouton: liens[0],
    liens: liens.slice(1),
  };
}

async function carteTrimestrielle(
  db: PrismaClient,
  moi: { role: string; arrondissementId?: string | null }
): Promise<Carte | null> {
  const role = moi.role;
  const etapes = etapesTrimestrielles(role);
  if (etapes.length === 0) return null;

  const { annee, trimestre } = trimestreARapporter();
  const P = trimestrielle(annee, trimestre);
  // Le trimestre est échu dès qu'on est dans le trimestre suivant : c'est le
  // moment de le rédiger et de le transmettre.
  const echu = new Date().getUTCMonth() % 3 !== 2;
  const etat = await etatCircuit(db, P);

  let phrase: string;
  let fait = false;
  if (role === "DA" || role === "AGENT_SAISIE") {
    const sien = etat.arrondissements.find((a) => a.id === moi.arrondissementId);
    fait = sien?.statut === "TRANSMIS";
    phrase =
      sien?.statut === "TRANSMIS"
        ? `Transmis au DD${sien.date ? ` le ${le(sien.date)}` : ""}.`
        : sien?.statut === "RENVOYE"
          ? `Renvoyé pour correction${sien.motif ? ` : ${sien.motif}` : "."}`
          : role === "DA"
            ? "En préparation. Suivez les étapes dans l'ordre, puis transmettez au DD."
            : "En préparation. Suivez les étapes dans l'ordre ; votre DA relira et transmettra.";
  } else if (role === "DD") {
    const transmis = etat.arrondissements.filter((a) => a.statut === "TRANSMIS").length;
    const validees = etat.sections.filter((s) => s.statut === "VALIDE").length;
    fait = etat.complet;
    phrase = etat.complet
      ? "Tout est transmis et validé : la version définitive peut être produite."
      : `${transmisSur6(transmis)} · ${valideesSur4(validees)}.`;
  } else {
    const code = codeSection(role);
    const section = etat.sections.find((s) => s.code === code);
    const transmis = etat.arrondissements.filter((a) => a.statut === "TRANSMIS").length;
    fait = section?.statut === "VALIDE";
    phrase =
      section?.statut === "VALIDE"
        ? `Votre section est validée${section.date ? ` depuis le ${le(section.date)}` : ""}.`
        : section?.statut === "A_VALIDER"
          ? "Les six arrondissements ont transmis : terminez l'analyse et les rubriques de votre section, puis validez-la."
          : `${role === "CHEF_BAC" ? "Complétez les tableaux du BAC, validez" : "Validez"} l'analyse des chiffres et rédigez les rubriques de votre section. Validation de la section possible quand les six auront transmis (${transmis} sur 6).`;
  }

  const renvoye = (role === "DA" || role === "AGENT_SAISIE") && phrase.startsWith("Renvoyé");
  // Le T2 clôt le premier semestre ; le T4, le second et l'année.
  const clot = trimestre === 2 ? "le 1er semestre" : trimestre === 4 ? "le 2e semestre et l'année" : null;
  return {
    note: clot ? `Ce trimestre clôt aussi ${clot} : ces rapports se calculent seuls à partir de vos trimestres, sans rien ressaisir.` : undefined,
    titre: TITRE_TRIMESTRIEL,
    periode: `${ordinal(trimestre)} trimestre ${annee}`,
    etat: phrase,
    ton: fait ? "fait" : renvoye ? "attention" : "neutre",
    urgent: !fait && (echu || renvoye),
    // Fait : on mène au document ; sinon à la première étape.
    bouton: fait
      ? { href: etapes[etapes.length - 1].href, label: etapes[etapes.length - 1].label }
      : { href: etapes[0].href, label: `Commencer : ${etapes[0].label.charAt(0).toLowerCase()}${etapes[0].label.slice(1)}` },
    etapes: etapes.map((e) => ({ href: e.href, label: e.label, numero: e.etape!, aide: e.aide })),
    etapesFaites: fait,
  };
}

/**
 * Au T2, le rapport du 1er semestre ; au T4, celui du 2e semestre et le rapport
 * annuel (décision du Délégué, 28 septembre 2026). Même canevas, calculés à
 * partir des trimestres, produits avec le trimestre qui les clôt et transmis
 * avec lui : une carte chacun pour le DA et le DD, qui les produisent.
 */
function cartesSemestreEtAnnee(role: string, trimestreFait: boolean): Carte[] {
  if (role !== "DA" && role !== "DD") return [];
  const { annee, trimestre } = trimestreARapporter();
  if (trimestre !== 2 && trimestre !== 4) return [];
  const ecran = role === "DA" ? "/da/trimestre" : "/dd/trimestre";
  const faire = role === "DA" ? "Vérifier et télécharger" : "Produire";
  const rapports: { titre: string; periode: string; type: string; rang: number; mois: string; nom: string }[] = [
    trimestre === 2
      ? { titre: "Rapport semestriel", periode: `1er semestre ${annee}`, type: "SEMESTRIEL", rang: 1, mois: "janvier à juin", nom: "le rapport semestriel" }
      : { titre: "Rapport semestriel", periode: `2e semestre ${annee}`, type: "SEMESTRIEL", rang: 2, mois: "juillet à décembre", nom: "le rapport semestriel" },
    ...(trimestre === 4
      ? [{ titre: "Rapport annuel", periode: `Année ${annee}`, type: "ANNUEL", rang: 1, mois: "janvier à décembre", nom: "le rapport annuel" }]
      : []),
  ];
  return rapports.map((r) => ({
    titre: r.titre,
    periode: r.periode,
    etat: trimestreFait
      ? `Prêt : il se calcule à partir de vos trimestres (${r.mois}), et le ${ordinal(trimestre)} trimestre est transmis.`
      : `Se calcule seul à partir de vos trimestres (${r.mois}) : rien à ressaisir. Il part avec la transmission du ${ordinal(trimestre)} trimestre.`,
    ton: trimestreFait ? "fait" : "neutre",
    urgent: false,
    bouton: { href: `${ecran}?annee=${annee}&type=${r.type}&rang=${r.rang}`, label: `${faire} ${r.nom}` },
  }));
}

const TONS = {
  neutre: "bg-appbg text-ink-muted",
  attention: "bg-amber-50 text-amber-900",
  fait: "bg-green-50 text-green-800",
};

/**
 * « Bonsoir Jean Kamdem » / « Délégué d'arrondissement de Dschang » : le nom
 * et le poste de la personne, pas son identifiant de connexion (demande du
 * Délégué : plus convivial, et ça attire l'attention). La fonction saisie au
 * compte l'emporte ; à défaut, le rôle et son rattachement.
 */
async function salutation(db: PrismaClient, moi: { id: string; role: string; username: string }) {
  const u = await db.user.findUnique({
    where: { id: moi.id },
    select: { nom: true, fonction: true, arrondissement: { select: { nom: true } }, section: { select: { code: true, nom: true } } },
  });
  const heure = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Africa/Douala" }).format(new Date()));
  const salut = heure >= 18 || heure < 4 ? "Bonsoir" : "Bonjour";
  const arr = u?.arrondissement?.nom;
  const section = u?.section ? `${u.section.code} (${u.section.nom})` : null;
  const parRole: Record<string, string> = {
    DD: "Délégué départemental",
    DA: arr ? `Délégué d'arrondissement de ${arr}` : "Délégué d'arrondissement",
    AGENT_SAISIE: arr ? `Agent de saisie · arrondissement de ${arr}` : "Agent de saisie",
    CHEF_BAC: section ? `Chef de section ${section}` : "Chef de section BAC",
    CHEF_PSA: section ? `Chef de section ${section}` : "Chef de section PSA",
    CHEF_SSV: section ? `Chef de section ${section}` : "Chef de section SSV",
    CHEF_SPAIH: section ? `Chef de section ${section}` : "Chef de section SPAIH",
    ADMIN_TECH: "Administrateur technique",
  };
  const poste = u?.fonction?.trim() ? `${u.fonction.trim()}${arr && !u.fonction.includes(arr) ? ` · ${arr}` : ""}` : parRole[moi.role] ?? "";
  return { titre: `${salut} ${u?.nom?.trim() || moi.username}`, poste };
}

function CarteRapport({ c }: { c: Carte }) {
  return (
    <section
      className={`rounded-xl border bg-white p-4 sm:p-5 ${c.urgent ? "border-primary shadow-[0_0_0_3px_rgba(47,98,108,.12)]" : "border-line"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[17px] font-bold text-primary-dark">
          {c.titre} <span className="font-semibold text-ink-muted">· {c.periode}</span>
        </h2>
        {c.urgent && <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">À faire maintenant</span>}
      </div>

      <p className={`mt-3 rounded-md px-3 py-2 text-sm ${TONS[c.ton]}`}>{c.etat}</p>
      {c.echeance && <p className="mt-2 text-sm font-medium text-ink-muted">⏱ {c.echeance}</p>}

      {c.bouton && (
        <a
          href={c.bouton.href}
          className="mt-4 flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-center text-[15px] font-semibold text-white hover:bg-primary-dark"
        >
          {c.bouton.label} →
        </a>
      )}

      {c.etapes && (
        <ol className="mt-4 space-y-0.5">
          {c.etapes.map((e) => (
            <li key={e.href}>
              <a href={e.href} className="flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-appbg">
                <span
                  className={`mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    c.etapesFaites ? "bg-green-100 text-green-800" : "bg-appbg text-ink-muted"
                  }`}
                >
                  {c.etapesFaites ? "✓" : e.numero}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-[#28323d]">{e.label}</span>
                  {e.aide && <span className="mt-0.5 block text-xs leading-snug text-ink-faint">{e.aide}</span>}
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}

      {c.note && <p className="mt-3 border-t border-line pt-3 text-xs leading-snug text-ink-muted">{c.note}</p>}

      {c.liens && c.liens.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3">
          {c.liens.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="text-sm font-medium text-primary hover:underline">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const moi = await contexteSession(session);
  if (!moi) redirect("/");
  const db = moi.db as PrismaClient;
  const role = moi.role as string;

  const [accueil, ...lesCartes] = await Promise.all([salutation(db, moi), carteMensuelle(db, moi), carteTrimestrielle(db, moi)]);
  const cartes = lesCartes.filter((c): c is Carte => c != null);
  const trimestre = cartes.find((c) => c.titre === TITRE_TRIMESTRIEL);
  if (trimestre) cartes.push(...cartesSemestreEtAnnee(role, trimestre.etapesFaites === true));
  // L'urgent d'abord ; à égalité, le mensuel puis le trimestriel.
  cartes.sort((a, b) => Number(b.urgent) - Number(a.urgent));

  // Les outils du DA et de l'agent sont au menu ; l'accueil ne garde, en plus
  // des rapports, que l'administration du DD et de l'administrateur.
  const administration = (MENU_PAR_ROLE[role] ?? []).filter((g) => g.cle === "administration" || g.cle === "autres");

  return (
    <AppShell>
      <div className="max-w-[1080px]">
        <h1 className="text-[23px] font-bold leading-tight text-primary-dark">{accueil.titre}</h1>
        {accueil.poste && <p className="mt-0.5 text-[15px] font-semibold text-primary">{accueil.poste}</p>}
        <p className="mb-[20px] mt-1 text-sm text-ink-muted">Voici les rapports du moment et ce qu&apos;il vous reste à faire.</p>

        {cartes.length > 0 && (
          <div className="mb-[26px] grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            {cartes.map((c) => (
              <CarteRapport key={c.titre} c={c} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-[22px] lg:grid-cols-[1.15fr_.85fr]">
          <NotificationsPanel />
          {administration.length > 0 && (
            <div className="space-y-4">
              {administration.map((g) => (
                <div key={g.cle}>
                  <h2 className="mb-2 text-[15px] font-bold text-primary-dark">{g.titre}</h2>
                  <ul className="grid gap-1.5">
                    {g.items.map((i) => (
                      <li key={i.href}>
                        <a href={i.href} className="block rounded-md border border-line bg-white px-3 py-2 text-sm text-ink-muted hover:border-primary hover:text-primary-dark">
                          {i.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
