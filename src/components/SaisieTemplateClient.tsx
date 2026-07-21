"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FormMatrice from "@/components/FormMatrice";
import FormNominatif from "@/components/FormNominatif";
import FormEvenement from "@/components/FormEvenement";
import SyncButton from "@/components/SyncButton";

export default function SaisieTemplateClient({
  templateCode,
  username,
  destinataire,
}: {
  templateCode: string;
  username: string;
  destinataire: string;
}) {
  const [periodeId, setPeriodeId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    async function charger() {
      try {
        const [periodeRes, detailRes] = await Promise.all([
          fetch("/api/periodes/active"),
          fetch(`/api/form-templates/${templateCode}`),
        ]);
        if (!periodeRes.ok) throw new Error("Aucune période active.");
        if (!detailRes.ok) throw new Error("Tableau introuvable.");
        const periodeData = await periodeRes.json();
        const detailData = await detailRes.json();
        setPeriodeId(periodeData.periode.id);
        setDetail(detailData);
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

          <div className="my-4">{periodeId && <SyncButton periodeId={periodeId} username={username} destinataire={destinataire} />}</div>

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
