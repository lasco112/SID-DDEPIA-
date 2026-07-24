"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FormMatrice from "@/components/FormMatrice";
import FormNominatif from "@/components/FormNominatif";
import FormEvenement from "@/components/FormEvenement";
import SyncButton from "@/components/SyncButton";
import { offlineDB } from "@/lib/dexie";

export default function SaisieTemplateClient({
  templateCode,
  username,
  destinataire,
  peutSoumettre = false,
}: {
  templateCode: string;
  username: string;
  destinataire: string;
  peutSoumettre?: boolean;
}) {
  const [periodeId, setPeriodeId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    // Le tableau et ses données de référence (établissements, référentiels,
    // période) viennent de Dexie — remplies une fois pour toutes par
    // /api/bootstrap (voir lib/offlineStore.ts) — et non plus d'un appel
    // réseau : l'ouverture d'un tableau ne doit jamais dépendre d'internet.
    async function charger() {
      try {
        const meta = await offlineDB.meta.get("bootstrap");
        const tableau = await offlineDB.tableaux.get(templateCode);
        if (!meta || !tableau) {
          throw new Error(
            "Données de référence indisponibles sur cet appareil. Connectez-vous à internet une première fois pour les télécharger."
          );
        }
        const periode = meta.periodeActiveId ? await offlineDB.periodes.get(meta.periodeActiveId) : null;
        if (!periode) throw new Error("Aucune période active. Reconnectez-vous à internet pour synchroniser.");

        let etablissements: unknown[] = [];
        if (tableau.type === "NOMINATIF" && tableau.etablissementTypeCode) {
          etablissements = await offlineDB.etablissements.where("typeCode").equals(tableau.etablissementTypeCode).toArray();
        }

        let referentiels: Record<string, unknown[]> = {};
        if (tableau.type === "EVENEMENT" && Array.isArray(tableau.schemaEvenement)) {
          const categories = Array.from(
            new Set(
              (tableau.schemaEvenement as Array<{ ref?: string }>).map((c) => c.ref).filter((r): r is string => Boolean(r))
            )
          );
          for (const categorie of categories) {
            referentiels[categorie] = await offlineDB.referentiels.where("categorie").equals(categorie).toArray();
          }
        }

        setPeriodeId(periode.id);
        setDetail({
          template: {
            code: tableau.code,
            numero: tableau.numero,
            titre: tableau.titre,
            type: tableau.type,
            fields: tableau.fields,
            schemaEvenement: tableau.schemaEvenement,
          },
          etablissements,
          referentiels,
        });
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur de chargement.");
      }
    }
    charger();
  }, [templateCode]);

  return (
    <div className="max-w-5xl">
      <Link href="/da/saisie" className="mb-4 inline-block text-primary hover:underline">
        ← Tous les tableaux
      </Link>

      {erreur && <p className="rounded bg-red-50 p-3 text-red-700">{erreur}</p>}

      {detail && (
        <>
          <h1 className="text-xl font-bold">
            <span className="mr-2 font-mono text-sm text-gray-400">{detail.template.numero}</span>
            {detail.template.titre}
          </h1>

          <div className="my-4">
            {periodeId && (
              <SyncButton periodeId={periodeId} username={username} destinataire={destinataire} peutSoumettre={peutSoumettre} />
            )}
          </div>

          <div className="mt-4">
            {periodeId && detail.template.type === "MATRICE" && (
              <FormMatrice template={detail.template} periodeId={periodeId} username={username} />
            )}
            {periodeId && detail.template.type === "NOMINATIF" && (
              <FormNominatif template={detail.template} periodeId={periodeId} etablissements={detail.etablissements} username={username} />
            )}
            {periodeId && detail.template.type === "EVENEMENT" && (
              <FormEvenement template={detail.template} periodeId={periodeId} referentiels={detail.referentiels} username={username} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
