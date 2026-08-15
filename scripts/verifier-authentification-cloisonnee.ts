/**
 * L'authentification, une fois les politiques posées.
 *
 * `User` est une table cloisonnée, mais la connexion doit lire un compte AVANT
 * de connaître son département. Une seule porte est ouverte pour cela :
 * `compte_pour_authentification`, fonction SQL `SECURITY DEFINER` appelée
 * uniquement par `src/lib/comptes.ts`.
 *
 * C'est le point le plus dangereux du lot : s'il cède, plus personne ne se
 * connecte — ni le Délégué, ni les six arrondissements. Ce contrôle exerce donc
 * la connexion RÉELLE, sur un compte fictif créé puis supprimé, plutôt que de
 * se contenter d'inspecter le code.
 *
 *   node --env-file=.env --import tsx scripts/verifier-authentification-cloisonnee.ts
 */
import bcrypt from "bcryptjs";
import { base, baseBrute, DEPARTEMENT_DE_TRAVAIL, exigerDepartementDeTravail } from "../src/lib/baseDeTravail";
import { compteParUsername, compteParId, identifiantDisponible } from "../src/lib/comptes";
import { authOptions } from "../src/lib/auth";

const dire = (quoi: string, ok: boolean) => {
  console.log(`  ${ok ? "ok    " : "FAUTE "}  ${quoi}`);
  if (!ok) process.exitCode = 1;
};

const USERNAME = "controle.authentification";
const MOT_DE_PASSE = "controle-lot19-motdepasse";

/**
 * Le fournisseur « credentials » de production — celui que la page de connexion
 * utilise.
 *
 * Piège : `CredentialsProvider` ne garde PAS la fonction qu'on lui donne à la
 * racine du fournisseur. Il y laisse un `authorize: () => null` par défaut et
 * range les options fournies sous `.options`. Appeler `fournisseur.authorize`
 * rend donc toujours `null` — un banc d'essai écrit ainsi conclut « la
 * connexion est cassée » alors que l'application fonctionne.
 */
const fournisseur = (authOptions.providers as any[]).find((p) => p.id === "credentials");
const connexion = { authorize: fournisseur?.options?.authorize ?? fournisseur?.authorize };

async function principal() {
  await exigerDepartementDeTravail();

  let compteFictifId: string | null = null;

  try {
    // --- La porte d'amorçage --------------------------------------------------
    console.log("\nLa porte d'amorçage");

    // Sans elle, cette lecture ne rendrait rien : aucun département n'est déclaré.
    const invisible = await baseBrute.user.count();
    dire("le client nu ne voit aucun compte (les politiques sont bien actives)", invisible === 0);

    const reel = await base.user.findFirst({ where: { actif: true }, select: { username: true, id: true } });
    if (!reel) throw new Error("Aucun compte actif : le contrôle ne prouverait rien.");

    const parNom = await compteParUsername(baseBrute, reel.username);
    dire("elle rend le compte par nom d'utilisateur, malgré les politiques", parNom?.id === reel.id);
    dire("et elle rend son département, qui est la clé de tout le reste", parNom?.departementId === DEPARTEMENT_DE_TRAVAIL);

    const parId = await compteParId(baseBrute, reel.id);
    dire("elle rend le même compte par identifiant", parId?.id === reel.id);

    const inconnu = await compteParUsername(baseBrute, "personne.n.existe.pas");
    dire("un nom inconnu rend null, sans lever", inconnu === null);

    dire("un identifiant déjà pris est signalé occupé", (await identifiantDisponible(baseBrute, reel.username)) === false);
    dire("un identifiant libre est signalé libre", (await identifiantDisponible(baseBrute, USERNAME)) === true);

    // --- La connexion réelle --------------------------------------------------
    console.log("\nLa connexion, exercée de bout en bout");

    const compte = await base.user.create({
      data: {
        nom: "Compte de contrôle",
        username: USERNAME,
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
        role: "AGENT_SAISIE",
        actif: true,
        mustChangePassword: false,
      },
      select: { id: true },
    });
    compteFictifId = compte.id;

    const identite = await connexion.authorize({ username: USERNAME, password: MOT_DE_PASSE }, {} as any);
    dire("un mot de passe correct ouvre bien la session", identite?.id === compteFictifId);
    dire("l'identité rendue porte le rôle du compte", (identite as any)?.role === "AGENT_SAISIE");

    // La connexion écrit lastLoginAt et une trace d'audit : deux écritures dans
    // des tables cloisonnées, faites après que le département a été appris.
    const apres = await base.user.findUnique({ where: { id: compteFictifId }, select: { lastLoginAt: true } });
    dire("la date de dernière connexion a bien été écrite", Boolean(apres?.lastLoginAt));

    const trace = await base.auditLog.count({ where: { userId: compteFictifId, action: "LOGIN" } });
    dire("la trace d'audit de la connexion a bien été écrite", trace === 1);

    // --- Et ce qui doit être refusé -------------------------------------------
    console.log("\nCe qui doit être refusé");

    dire(
      "un mot de passe faux est refusé",
      (await connexion.authorize({ username: USERNAME, password: "mauvais" }, {} as any)) === null
    );
    dire(
      "un nom d'utilisateur inconnu est refusé",
      (await connexion.authorize({ username: "personne.n.existe.pas", password: MOT_DE_PASSE }, {} as any)) === null
    );

    await base.user.update({ where: { id: compteFictifId }, data: { actif: false } });
    dire(
      "un compte désactivé est refusé, même avec le bon mot de passe",
      (await connexion.authorize({ username: USERNAME, password: MOT_DE_PASSE }, {} as any)) === null
    );
  } finally {
    // --- Remise en état --------------------------------------------------------
    let traces = 0;
    if (compteFictifId) {
      traces = (await base.auditLog.deleteMany({ where: { userId: compteFictifId } })).count;
      await base.user.delete({ where: { id: compteFictifId } });
    }
    console.log(
      `\nRemise en état : ${compteFictifId ? "1 compte fictif" : "aucun compte"}, ${traces} ligne(s) d'audit — supprimé(s).`
    );
  }
}

principal()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => baseBrute.$disconnect());
