import AppShell from "@/components/AppShell";
import TextesDepartementClient from "@/components/TextesDepartementClient";

/** Textes permanents du rapport trimestriel, rédigés par le DD (décision du 14 octobre 2026). */
export default function TextesDepartementPage() {
  return (
    <AppShell allowedRoles={["DD"]}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Textes permanents de mon département</h1>
        <p className="mt-1 text-gray-600">
          Situation et relief, pédologie, démographie, missions, vision, organisation, introduction et références : rédigés une
          fois ici, ils sont repris dans chaque rapport trimestriel — celui du département et ceux des arrondissements. Les
          rédacteurs peuvent encore les adapter pour une période, dans les écrans de rédaction du rapport trimestriel.
        </p>
        <div className="mt-6">
          <TextesDepartementClient />
        </div>
      </div>
    </AppShell>
  );
}
