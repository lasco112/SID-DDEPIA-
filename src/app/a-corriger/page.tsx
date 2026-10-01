import AppShell from "@/components/AppShell";
import { ListeACorriger } from "@/components/ACorriger";

/**
 * « À corriger » — tous les points à corriger de la personne connectée, dans
 * l'ordre du travail (demande du Délégué, 1er octobre 2026).
 */
export default function ACorrigerPage() {
  return (
    <AppShell>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-primary-dark">À corriger</h1>
        <p className="mt-1 mb-5 text-gray-600">
          Tout ce qui empêche vos rapports de partir, ou mérite d&apos;être vérifié — du mensuel au trimestriel, dans
          l&apos;ordre. « Aller corriger » vous emmène à l&apos;endroit exact, encadré en rouge ; la barre du bas vous fait
          passer au point suivant. Un point disparaît tout seul dès qu&apos;il est corrigé.
        </p>
        <ListeACorriger />
      </div>
    </AppShell>
  );
}
