import AppShell from "@/components/AppShell";
import SaisieTrimestrielleClient from "@/components/SaisieTrimestrielleClient";

/** Les tableaux du BAC : personnel, infrastructures, matériel, équipements, budget, recettes. */
const TABLEAUX_BAC = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 101, 102];

/**
 * Les tableaux du Bureau des Affaires Communes, sur l'écran commun de saisie
 * trimestrielle. Chaque arrondissement remplit désormais sa colonne ; le chef
 * BAC complète et corrige, et les totaux se calculent seuls.
 */
export default function SectionBacPage() {
  return (
    <AppShell allowedRoles={["CHEF_BAC", "DD"]}>
      <SaisieTrimestrielleClient
        titre="Tableaux du Bureau des Affaires Communes"
        presentation="Personnel, infrastructures, matériel, équipements, budget et recettes. Chaque arrondissement remplit sa colonne ; vous complétez et corrigez. Les totaux se calculent seuls."
        seulement={TABLEAUX_BAC}
      />
    </AppShell>
  );
}
