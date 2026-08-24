/**
 * Le test d'intrusion — celui qui donne sa valeur à tous les autres.
 *
 * Vérifier qu'un délégué voit ses propres données ne prouve rien : c'était déjà
 * vrai avant le cloisonnement. Ce qu'il faut établir, c'est qu'il ne peut PAS
 * voir celles d'un autre département — et le test doit ÉCHOUER si la lecture
 * aboutit.
 *
 * Une politique non éprouvée par une tentative d'intrusion n'est pas une
 * politique de sécurité.
 *
 * Méthode : un second département fictif est créé avec quelques lignes, puis on
 * se déclare dans le premier et on compte ce qu'on obtient. Le contrôle
 * symétrique est indispensable — sans lui, « aucune ligne » pourrait simplement
 * signifier que les lignes n'ont jamais été créées.
 *
 * Tout est supprimé à la fin, y compris si le test échoue.
 *
 *   node --env-file=.env --import tsx --test tests/intrusion.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { baseBrute, DEPARTEMENT_DE_TRAVAIL, exigerDepartementDeTravail } from "../src/lib/baseDeTravail";
import { transactionCloisonnee } from "../src/lib/dbCloisonne";

/** Le département dans lequel on se déclare : celui du SID en service. */
const MIEN = DEPARTEMENT_DE_TRAVAIL;

/** Le département fictif, celui qu'on va tenter d'atteindre. */
const AUTRE = "dep_intrusion_controle";
const CODE_AUTRE = "ZZI";

/** Ce que l'intrus tentera de lire, écrire, modifier et supprimer. */
const cible = {
  arrondissementId: "arr_intrusion_controle",
  userId: "user_intrusion_controle",
  periodeId: "per_intrusion_controle",
};

/** Agir en se déclarant dans un département donné. */
function dans<T>(departementId: string, travail: (tx: PrismaClient) => Promise<T>): Promise<T> {
  return transactionCloisonnee(baseBrute, departementId, travail);
}

before(async () => {
  await exigerDepartementDeTravail();

  const region = await baseBrute.region.findFirstOrThrow();
  await baseBrute.departement.upsert({
    where: { id: AUTRE },
    update: {},
    create: { id: AUTRE, code: CODE_AUTRE, nom: "Departement de controle", regionId: region.id },
  });

  // Les lignes du second département sont créées EN SE DÉCLARANT dans celui-ci :
  // le « WITH CHECK » des politiques l'exige, et cela vaut déjà démonstration.
  await dans(AUTRE, async (tx) => {
    await tx.arrondissement.create({
      data: { id: cible.arrondissementId, code: "ZZ1", nom: "Arrondissement de controle", ordre: 99, departementId: AUTRE },
    });
    await tx.user.create({
      data: {
        id: cible.userId,
        nom: "Delegue du departement voisin",
        username: "intrusion.controle",
        passwordHash: "x",
        role: "DD",
        actif: true,
        departementId: AUTRE,
      },
    });
    await tx.periodeReporting.create({
      data: {
        id: cible.periodeId,
        type: "MENSUEL",
        annee: 2099,
        mois: 1,
        dateOuverture: new Date("2099-01-01"),
        dateLimiteDA: new Date("2099-01-28"),
        dateLimiteChef: new Date("2099-01-29"),
        dateLimiteDD: new Date("2099-02-02"),
        departementId: AUTRE,
      },
    });
  });
});

after(async () => {
  await dans(AUTRE, async (tx) => {
    await tx.periodeReporting.deleteMany({ where: { departementId: AUTRE } });
    await tx.user.deleteMany({ where: { departementId: AUTRE } });
    await tx.arrondissement.deleteMany({ where: { departementId: AUTRE } });
  });
  await baseBrute.departement.deleteMany({ where: { id: AUTRE } });
  await baseBrute.$disconnect();
});

// ---------------------------------------------------------------------------
// D'abord : les lignes visées existent VRAIMENT.
// Sans ce contrôle, tous les suivants passeraient au vert sur une base vide.
// ---------------------------------------------------------------------------

test("le département voisin a bien les lignes qu'on va tenter d'atteindre", async () => {
  await dans(AUTRE, async (tx) => {
    assert.equal(await tx.arrondissement.count({ where: { id: cible.arrondissementId } }), 1);
    assert.equal(await tx.user.count({ where: { id: cible.userId } }), 1);
    assert.equal(await tx.periodeReporting.count({ where: { id: cible.periodeId } }), 1);
  });
});

// ---------------------------------------------------------------------------
// L'intrusion en LECTURE
// ---------------------------------------------------------------------------

test("déclaré chez moi, je ne vois pas l'arrondissement du voisin", async () => {
  await dans(MIEN, async (tx) => {
    assert.equal(
      await tx.arrondissement.findUnique({ where: { id: cible.arrondissementId } }),
      null,
      "L'arrondissement d'un autre département est lisible : le cloisonnement ne tient pas."
    );
    const tous = await tx.arrondissement.findMany({ select: { departementId: true } });
    assert.ok(tous.length > 0, "Aucun arrondissement visible : le test ne prouverait rien.");
    assert.ok(
      tous.every((a: { departementId: string | null }) => a.departementId === MIEN),
      "Une ligne d'un autre département figure dans la liste."
    );
  });
});

test("je ne vois pas le compte du délégué voisin", async () => {
  await dans(MIEN, async (tx) => {
    assert.equal(await tx.user.findUnique({ where: { id: cible.userId } }), null);
    assert.equal(await tx.user.count({ where: { username: "intrusion.controle" } }), 0);
  });
});

test("je ne vois pas sa période de reporting", async () => {
  await dans(MIEN, async (tx) => {
    assert.equal(await tx.periodeReporting.findUnique({ where: { id: cible.periodeId } }), null);
    assert.equal(await tx.periodeReporting.count({ where: { annee: 2099 } }), 0);
  });
});

test("aucune jointure ne le contourne", async () => {
  // Passer par une relation est le contournement le plus naturel : les
  // politiques s'appliquent aussi aux tables jointes.
  await dans(MIEN, async (tx) => {
    const parRelation = await tx.user.findMany({
      where: { arrondissement: { code: "ZZ1" } },
      select: { id: true },
    });
    assert.equal(parRelation.length, 0, "Une jointure a ramené une ligne d'un autre département.");
  });
});

// ---------------------------------------------------------------------------
// L'intrusion en ÉCRITURE
// ---------------------------------------------------------------------------

test("je ne peux pas modifier une ligne du voisin", async () => {
  await dans(MIEN, async (tx) => {
    const r = await tx.arrondissement.updateMany({
      where: { id: cible.arrondissementId },
      data: { nom: "MODIFIE PAR INTRUSION" },
    });
    assert.equal(r.count, 0, "Une ligne d'un autre département a été modifiée.");
  });

  // Et la ligne est intacte, vue de chez son propriétaire.
  await dans(AUTRE, async (tx) => {
    const a = await tx.arrondissement.findUniqueOrThrow({ where: { id: cible.arrondissementId } });
    assert.equal(a.nom, "Arrondissement de controle", "La ligne du voisin a bel et bien été modifiée.");
  });
});

test("je ne peux pas supprimer une ligne du voisin", async () => {
  await dans(MIEN, async (tx) => {
    const r = await tx.periodeReporting.deleteMany({ where: { id: cible.periodeId } });
    assert.equal(r.count, 0, "Une ligne d'un autre département a été supprimée.");
  });
  await dans(AUTRE, async (tx) => {
    assert.equal(await tx.periodeReporting.count({ where: { id: cible.periodeId } }), 1);
  });
});

test("je ne peux pas créer une ligne AU NOM du voisin", async () => {
  // Le « WITH CHECK » est la moitié qu'on oublie : sans lui, on ne pourrait pas
  // lire les données d'un autre département, mais on pourrait y en déposer.
  await assert.rejects(
    () =>
      dans(MIEN, (tx) =>
        tx.arrondissement.create({
          data: { code: "ZZ2", nom: "Depose chez le voisin", ordre: 98, departementId: AUTRE },
        })
      ),
    "Une ligne a pu être créée dans un autre département."
  );

  await dans(AUTRE, async (tx) => {
    assert.equal(await tx.arrondissement.count({ where: { code: "ZZ2" } }), 0);
  });
});

// ---------------------------------------------------------------------------
// La CRÉATION : une ligne prend le département de qui la crée
// ---------------------------------------------------------------------------

test("une ligne créée sans le préciser prend le département de l'appelant", async () => {
  // C'est le point qui manquait au lot 19 : le client déclarait le département
  // à la base, mais ne l'inscrivait pas dans les lignes créées. Une valeur par
  // défaut, 'dep_menoua', comblait le trou — juste tant qu'il n'y a qu'un
  // département, faux dès le second.
  const cree = await dans(AUTRE, (tx) =>
    tx.arrondissement.create({
      data: { code: "ZZ3", nom: "Cree sans departement", ordre: 97 },
      select: { id: true, departementId: true },
    })
  );
  assert.equal(cree.departementId, AUTRE, "La ligne n'a pas pris le département de celui qui l'a créée.");

  // Et le voisin ne la voit pas : elle est bien rattachée, pas seulement étiquetée.
  await dans(MIEN, async (tx) => {
    assert.equal(await tx.arrondissement.count({ where: { id: cree.id } }), 0);
  });

  await dans(AUTRE, (tx) => tx.arrondissement.delete({ where: { id: cree.id } }));
});

test("une insertion sans aucun département déclaré est refusée, pas rattachée au hasard", async () => {
  // Sans la règle, la valeur par défaut aurait rattaché cette ligne à la Menoua
  // — silencieusement, et sans que personne ne l'ait voulu.
  await assert.rejects(
    () => baseBrute.arrondissement.create({ data: { code: "ZZ4", nom: "Sans departement", ordre: 96 } }),
    (e: Error) => /d[ée]partement/i.test(e.message),
    "Une ligne a pu être insérée sans qu'aucun département soit déclaré."
  );
});

test("le département déclaré prime : on ne peut pas en inscrire un autre", async () => {
  // Le déclencheur ne renseigne que si la colonne est vide ; s'il est fourni,
  // c'est le WITH CHECK de la politique qui tranche.
  await assert.rejects(
    () =>
      dans(MIEN, (tx) =>
        tx.arrondissement.create({ data: { code: "ZZ5", nom: "Chez le voisin", ordre: 95, departementId: AUTRE } })
      ),
    "Une ligne a pu être créée avec le département d'un autre."
  );
});

// ---------------------------------------------------------------------------
// Et sans département du tout
// ---------------------------------------------------------------------------

test("sans département déclaré, on ne voit ni l'un ni l'autre", async () => {
  assert.equal(await baseBrute.arrondissement.count(), 0);
  assert.equal(await baseBrute.user.count(), 0);
  assert.equal(await baseBrute.periodeReporting.count(), 0);
});
