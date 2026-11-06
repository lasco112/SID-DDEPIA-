/**
 * LA DONNÉE OUBLIÉE PAR LE DA, SAISIE PAR LE CHEF DE SECTION (décision du
 * Délégué, 6 novembre 2026 : « un arrondissement a oublié de mettre ses
 * données »). Une case VIDE d'un tableau de chiffres du mois (1.1 bovins,
 * 3.4 inspections…) : le chef de la section y inscrit le chiffre à la place du
 * DA.
 *
 * Mêmes règles que la ligne oubliée (ajoutLigneChef.ts) :
 *  - le chef de la section du tableau (le DD : tous les tableaux) ;
 *  - une fois le mois TRANSMIS par le DA (sinon leurs écritures se mêleraient) ;
 *  - motif obligatoire ; mois non clôturé ;
 *  - jamais une ligne calculée (« Somme du tableau … ») : elle se recalcule
 *    depuis son tableau source, c'est là qu'il faut agir.
 *
 * Une case déjà remplie se corrige par « Corriger moi-même » (/api/corrections),
 * jamais d'ici. La trace : une Correction « (case vide dans le rapport du DA) →
 * valeur », le journal, et le DA et le DD prévenus. Le trimestre la compte de
 * lui-même. La synchronisation des téléphones ne peut plus l'écraser : le
 * rapport transmis refuse les envois du DA.
 */
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { assertPeriodeModifiable } from "@/server/periodes/gel";
import { notifierEvenement } from "@/server/notifications/evenements";
import { regleDuChamp } from "@/lib/champsDerives";
import { avecCible, cibleMensuelle } from "@/lib/surlignage";
import { RefusAjout, refusAuteur, refusRapportNonTransmis, type Auteur } from "./ajoutLigneChef";

const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Le chef peut-il remplir des cases vides de ce tableau ? null s'il le peut, sinon la raison. */
export function refusSaisieManquante(auteur: Auteur, template: { sectionId: string; type: string }): string | null {
  if (template.type !== "MATRICE") return "Seules les cases d'un tableau de chiffres se remplissent ainsi.";
  return refusAuteur(auteur, template, "remplit une case oubliée par le DA");
}

export async function saisirCaseManquante(
  db: PrismaClient,
  auteur: Auteur,
  demande: { templateCode: string; periodeId: string; arrondissementId: string; fieldCode: string; valeur: unknown; motif: unknown }
) {
  const template = await db.formTemplate.findUnique({ where: { code: demande.templateCode } });
  if (!template) throw new RefusAjout("Tableau introuvable.", 404);
  const refus = refusSaisieManquante(auteur, template);
  if (refus) throw new RefusAjout(refus, 403);

  const champ = await db.formField.findFirst({ where: { templateId: template.id, code: demande.fieldCode, actif: true } });
  if (!champ) throw new RefusAjout("Cette ligne n'existe pas dans ce tableau.", 404);
  const regle = regleDuChamp(champ.code);
  if (regle) throw new RefusAjout(`Cette ligne est la somme du tableau ${regle.templateSource} : c'est dans ce tableau qu'il faut compléter.`, 400);
  if (/TEXTE/i.test(champ.typeValeur)) throw new RefusAjout("Une case de texte ne se remplit pas ainsi : signalez-la au DA.", 400);

  const periode = await db.periodeReporting.findUnique({ where: { id: demande.periodeId } });
  if (!periode || periode.type !== "MENSUEL" || !periode.mois) throw new RefusAjout("Mois introuvable.", 404);
  await assertPeriodeModifiable(db, periode.id);

  const motif = typeof demande.motif === "string" ? demande.motif.trim() : "";
  if (motif.length < 5) throw new RefusAjout("Le motif est obligatoire : d'où vient ce chiffre (ex. : rapport papier du CZV, appel au DA…).", 400);
  const n = Number(String(demande.valeur ?? "").replace(/[\s  ]/g, "").replace(",", "."));
  if (String(demande.valeur ?? "").trim() === "" || !Number.isFinite(n) || n < 0) throw new RefusAjout("Inscrivez un nombre, positif ou zéro.", 400);

  const rapport = await db.rapportArrondissement.findFirst({
    where: { periodeId: periode.id, arrondissementId: demande.arrondissementId },
    include: { arrondissement: { select: { nom: true } } },
  });
  if (!rapport) throw new RefusAjout("Cet arrondissement n'a pas de rapport pour ce mois : rien à compléter.", 409);
  const nonTransmis = refusRapportNonTransmis(rapport);
  if (nonTransmis) throw new RefusAjout(nonTransmis, 409);

  const deja = await db.saisieMatrice.findUnique({ where: { rapportId_fieldCode: { rapportId: rapport.id, fieldCode: champ.code } }, select: { id: true } });
  if (deja) throw new RefusAjout("Cette case a déjà une valeur : touchez-la pour la corriger (« Corriger moi-même »).", 409);

  const saisie = await db.saisieMatrice.create({
    data: { rapportId: rapport.id, fieldCode: champ.code, valeur: n, clientId: `chef-${randomUUID()}`, modifieLe: new Date(), saisiParId: auteur.id },
  });
  await db.correction.create({
    data: { saisieMatriceId: saisie.id, valeurAvant: "(case vide dans le rapport du DA)", valeurApres: String(n), motif, auteurId: auteur.id },
  });
  const mois = `${NOMS_MOIS[periode.mois - 1]} ${periode.annee}`;
  await db.auditLog.create({
    data: {
      userId: auteur.id,
      action: "SAISIE_MANQUANTE_CHEF",
      entite: "SaisieMatrice",
      entiteId: saisie.id,
      details: { templateCode: template.code, numero: template.numero, champ: champ.libelle, arrondissement: rapport.arrondissement.nom, mois, valeur: n, motif } as Prisma.InputJsonValue,
    },
  });

  const qui = auteur.role === "DD" ? "Le Délégué départemental" : `Le chef ${auteur.role.replace("CHEF_", "")}`;
  await notifierEvenement(db, { arrondissementId: rapport.arrondissementId, saufUserId: auteur.id }, {
    declencheur: "SAISIE_MANQUANTE_CHEF",
    message: `${qui} a rempli une case laissée vide dans votre rapport de ${mois} — tableau ${template.numero}, « ${champ.libelle} » : ${n}. Motif : ${motif}.`,
    lien: avecCible(`/da/saisie/${template.code}`, [cibleMensuelle.champ(champ.code)]),
  });
  if (auteur.role !== "DD") {
    await notifierEvenement(db, { roles: ["DD"], saufUserId: auteur.id }, {
      declencheur: "SAISIE_MANQUANTE_CHEF",
      message: `${rapport.arrondissement.nom}, ${mois} — ${qui.toLowerCase()} a rempli une case vide du tableau ${template.numero} (« ${champ.libelle} » : ${n}). Motif : ${motif}`,
      lien: `/section/controle?tableau=${template.code}`,
    });
  }
  return saisie;
}
