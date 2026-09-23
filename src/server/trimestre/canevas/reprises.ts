/**
 * Reprise d'une saisie d'un tableau dans un autre, quand les deux portent la
 * même réalité (décision du Délégué, 23 septembre 2026).
 *
 * Les infrastructures sont demandées deux fois par le canevas : au BAC
 * (« Situation des infrastructures », n° 7) et à l'élevage bovin
 * (« Infrastructures d'exploitation », n° 15). Ce qui est saisi au BAC se
 * RECOPIE dans le second tableau ; celui qui saisit peut modifier la valeur
 * recopiée, et une alerte signale alors que les deux ne concordent plus.
 *
 * Les correspondances ci-dessous ont été validées par le Délégué. Une ligne
 * peut en regrouper plusieurs : les infrastructures d'abattage sont les
 * abattoirs, les aires d'abattage et les tueries.
 */
export interface Reprise {
  /** Le tableau qui reçoit, et sa ligne. */
  tableau: number;
  ligne: string;
  /** Le tableau d'origine, et les lignes qui s'additionnent. */
  source: number;
  lignesSource: string[];
}

export const REPRISES: Reprise[] = [
  { tableau: 15, ligne: "Infrastructures d'abattages", source: 7, lignesSource: ["Abattoir", "Aire d'abattage", "Tuerie"] },
  { tableau: 15, ligne: "Points d'eau", source: 7, lignesSource: ["Forage", "Puits", "Mare"] },
  { tableau: 15, ligne: "Ecuries", source: 7, lignesSource: ["Ecurie"] },
  { tableau: 15, ligne: "Barrages", source: 7, lignesSource: ["Barrage de retenue d'eau"] },
  { tableau: 15, ligne: "Infrastructures de vaccination", source: 7, lignesSource: ["Parc vaccinogène"] },
  { tableau: 15, ligne: "Bains de tiqueurs", source: 7, lignesSource: ["Bain détiqueur"] },
  { tableau: 15, ligne: "Marchés", source: 7, lignesSource: ["Marché à bétail"] },
];

export const repriseDe = (tableau: number, ligne: string) =>
  REPRISES.find((r) => r.tableau === tableau && r.ligne === ligne);
