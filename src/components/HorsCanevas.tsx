/**
 * CE QUE LE TABLEAU NE PEUT PAS RECEVOIR (décision du Délégué, 22 octobre
 * 2026) : les lignes du mensuel qui n'ont pas de ligne dans ce tableau du
 * canevas — une rage soignée en clinique, au tableau des affections. Elles ne
 * sont pas comptées dans le TOTAL (qui égale la somme des lignes) ; elles sont
 * dites ici, arrondissement par arrondissement, et citées sous le tableau au
 * rapport. Plus de TOTAL incompréhensible au-dessus de lignes vides.
 */
export interface HorsCanevas {
  arrondissement: string;
  quantite: number;
  details: { nature: string; quantite: number }[];
}

const nf = (n: number) => n.toLocaleString("fr-FR");

export default function HorsCanevasNote({ hors }: { hors?: HorsCanevas[] | null }) {
  if (!hors?.length) return null;
  const total = hors.reduce((s, h) => s + h.quantite, 0);
  return (
    <div data-visite="hors-canevas" className="mt-3 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950">
      <p className="font-semibold">
        {nf(total)} déclaré{total > 1 ? "s" : ""} au mensuel sans ligne dans ce tableau — non compté{total > 1 ? "s" : ""} dans le TOTAL
      </p>
      <ul className="mt-1 space-y-0.5">
        {hors.map((h) => (
          <li key={h.arrondissement}>
            <b>{h.arrondissement} : {nf(h.quantite)}</b> — {h.details.map((d) => `${d.nature} ${nf(d.quantite)}`).join(", ")}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-sky-900">Ces cas sont cités dans le texte sous le tableau, au rapport.</p>
    </div>
  );
}
