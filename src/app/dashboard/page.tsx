import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import AppShell from "@/components/AppShell";
import NotificationsPanel from "@/components/NotificationsPanel";

function ActionCard({ href, glyph, label, sub }: { href: string; glyph: string; label: string; sub: string }) {
  return (
    <a
      href={href}
      className="flex w-full items-center gap-3 rounded-[9px] border border-[#d3dce6] bg-white p-[15px_16px] text-left hover:border-primary hover:bg-primary-light"
    >
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg bg-primary-light text-base font-bold text-primary">
        {glyph}
      </span>
      <span>
        <span className="block text-sm font-semibold text-[#28323d]">{label}</span>
        <span className="mt-0.5 block text-xs text-ink-faint">{sub}</span>
      </span>
    </a>
  );
}

function joursRestants(cible: Date): number {
  const ms = cible.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function StatCard({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-white p-[18px_20px]">
      <div className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-1.5 text-[30px] font-bold" style={{ color: valueColor ?? "#173a56" }}>
        {value}
      </div>
      {sub && <div className="mt-2.5 text-[12.5px] text-ink-muted">{sub}</div>}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/");

  const role = (session.user as any).role as string;
  const username = (session.user as any).username as string;

  const periode = await db.periodeReporting.findFirst({
    where: { type: "MENSUEL" },
    orderBy: [{ annee: "desc" }, { mois: "desc" }],
  });

  const cards: { label: string; value: string; sub?: string; valueColor?: string }[] = [];

  if (periode) {
    const cible = periode.statut === "OUVERTE" ? periode.dateLimiteDA : periode.dateLimiteDD;
    const jours = joursRestants(cible);
    cards.push({
      label: "Échéance",
      value: `${jours} jour${jours > 1 ? "s" : ""}`,
      sub: `${periode.statut === "OUVERTE" ? "Verrouillage DA" : "Clôture DD"} le ${cible.toLocaleDateString("fr-FR")}`,
      valueColor: jours <= 3 ? "#b45309" : undefined,
    });
  }

  if (role === "DD" && periode) {
    const rapports = await db.rapportArrondissement.findMany({ where: { periodeId: periode.id } });
    const soumis = rapports.filter((r) => r.statut === "SOUMIS" || r.statut === "CLOTURE").length;
    const rejetes = rapports.filter((r) => r.statut === "REJETE").length;
    cards.unshift({
      label: "Arrondissements soumis",
      value: `${soumis} / 6`,
      sub: `${6 - soumis - rejetes} en attente · ${rejetes} rejeté(s)`,
    });
    const taux = Math.round((soumis / 6) * 100);
    cards.unshift({ label: "Taux de soumission", value: `${taux} %` });
  }

  if (role === "DA" && periode) {
    const user = await db.user.findUnique({ where: { username } });
    const rapport = user?.arrondissementId
      ? await db.rapportArrondissement.findUnique({
          where: { periodeId_arrondissementId: { periodeId: periode.id, arrondissementId: user.arrondissementId } },
        })
      : null;
    cards.unshift({ label: "Statut de mon rapport", value: rapport?.statut ?? "EN_SAISIE" });
  }

  if (role.startsWith("CHEF_") && periode) {
    const user = await db.user.findUnique({ where: { username } });
    const validation = user?.sectionId
      ? await db.validationSection.findUnique({ where: { periodeId_sectionId: { periodeId: periode.id, sectionId: user.sectionId } } })
      : null;
    cards.unshift({ label: "Statut de ma section", value: validation?.statut ?? "EN_ATTENTE" });
  }

  const actions: { href: string; glyph: string; label: string; sub: string }[] = [];
  if (role === "DA") {
    actions.push({ href: "/da/saisie", glyph: "＋", label: "Saisir mes données", sub: "Les 28 tableaux du mois, hors-ligne possible" });
  }
  if (role === "DD") {
    actions.push({ href: "/dd/supervision", glyph: "✓", label: "Superviser les arrondissements", sub: "Soumissions, validations, déverrouillage" });
    actions.push({ href: "/admin/utilisateurs", glyph: "👤", label: "Gérer les comptes", sub: "Créer et autoriser les accès" });
    if (periode) {
      actions.push({ href: `/api/exports/drepia?periodeId=${periode.id}`, glyph: "↧", label: "Exporter vers la DREPIA", sub: "Classeur .xlsx normalisé" });
    }
  }
  if (role.startsWith("CHEF_")) {
    actions.push({ href: "/section/controle", glyph: "⊞", label: "Vue croisée de contrôle", sub: "Comparer les 6 arrondissements" });
    actions.push({ href: "/section/analyse", glyph: "✎", label: "Rédiger la synthèse", sub: "Analyse qualitative de la section" });
  }

  return (
    <AppShell>
      <div className="max-w-[1080px]">
        <h1 className="mb-0.5 text-[23px] font-bold text-primary-dark">Tableau de bord</h1>
        <p className="mb-[22px] text-sm text-ink-muted">
          Bienvenue, {username}
          {periode ? ` — campagne de collecte de ${periode.mois}/${periode.annee}.` : "."}
        </p>

        {cards.length > 0 && (
          <div className="mb-[26px] grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <StatCard key={c.label} {...c} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-[22px] lg:grid-cols-[1.15fr_.85fr]">
          <NotificationsPanel />
          {actions.length > 0 && (
            <div>
              <h2 className="mb-3 text-[15px] font-bold text-primary-dark">Actions</h2>
              <div className="grid gap-[11px]">
                {actions.map((a) => (
                  <ActionCard key={a.href} {...a} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
