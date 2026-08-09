import { getServerSession } from "next-auth";
import { resoudrePeriode } from "@/server/periodes/courante";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { contexteSession } from "@/lib/permissions";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import RapportStatusPanel from "@/components/RapportStatusPanel";

export default async function DASaisieIndexPage() {
  const session = await getServerSession(authOptions);
  const moi = await contexteSession(session);
  const role = moi?.role;
  if (!moi || (role !== "DA" && role !== "AGENT_SAISIE")) redirect("/");
  const db = moi.db;
  const username = moi.username;
  const destinataire = role === "AGENT_SAISIE" ? "Délégué d'Arrondissement" : "Délégué Départemental";

  const templates = await db.formTemplate.findMany({
    where: { actif: true },
    orderBy: { ordre: "asc" },
    include: { section: true },
  });

  // Organisation du travail (indicative — voir /da/assignations) : qui est
  // censé remplir quoi ce mois-ci, sans jamais restreindre l'accès.
  const periodeActive = await resoudrePeriode(db);
  const assignations =
    periodeActive && moi.arrondissementId
      ? await db.assignationSaisie.findMany({
          where: { periodeId: periodeActive.id, arrondissementId: moi.arrondissementId, agentId: { not: null } },
          include: { agent: true },
        })
      : [];
  const agentParTableau = new Map(assignations.map((a) => [a.templateCode, a.agent?.nom]));

  const groupes = new Map<string, typeof templates>();
  for (const t of templates) {
    const section = t.numero.split(".")[0];
    if (!groupes.has(section)) groupes.set(section, []);
    groupes.get(section)!.push(t);
  }

  return (
    <AppShell allowedRoles={["DA", "AGENT_SAISIE"]}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Saisie des données du mois</h1>
        <p className="mt-1 text-gray-600">
          Les 28 tableaux du canevas. Vos saisies sont sauvegardées localement et peuvent être envoyées à tout moment.
          {role === "AGENT_SAISIE" && " Le Délégué d'Arrondissement reste seul habilité à soumettre le rapport final."}
        </p>

        <div className="mt-6">
          <RapportStatusPanel username={username} destinataire={destinataire} peutSoumettre={role === "DA"} />
        </div>

        <div className="mt-6 space-y-6">
          {Array.from(groupes.entries()).map(([section, liste]) => (
            <div key={section} className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="mb-3 font-semibold text-gray-800">Section {section}</h2>
              <ul className="divide-y divide-gray-100">
                {liste.map((t) => (
                  <li key={t.code}>
                    <Link href={`/da/saisie/${t.code}`} className="flex items-center justify-between py-2 hover:text-blue-700">
                      <span>
                        <span className="mr-2 font-mono text-xs text-gray-400">{t.numero}</span>
                        {t.titre}
                      </span>
                      <span className="flex items-center gap-2">
                        {agentParTableau.get(t.code) && (
                          <span className="rounded-full bg-primary-light px-2 py-0.5 text-[11px] font-medium text-primary-dark">
                            {agentParTableau.get(t.code)}
                          </span>
                        )}
                        <span className="text-xs uppercase text-gray-400">{t.type}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
