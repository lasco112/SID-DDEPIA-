import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { demoDb } from "@/lib/demoDb";
import { clientCloisonne } from "@/lib/dbCloisonne";
import { compteParUsername, compteParId } from "@/lib/comptes";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        username: { label: "Nom d'utilisateur", type: "text" },
        password: { label: "Mot de passe", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        // La seule lecture qui précède le cloisonnement : on cherche par nom
        // d'utilisateur, et c'est la ligne trouvée qui apprend le département.
        // Voir lib/comptes.ts.
        const user = await compteParUsername(db, credentials.username.trim());
        if (!user || !user.actif) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        // Le département est connu : tout ce qui suit est cloisonné normalement.
        const base = clientCloisonne(db, user.departementId);
        await base.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await base.auditLog.create({
          data: { userId: user.id, action: "LOGIN", entite: "User", entiteId: user.id },
        });

        return {
          id: user.id,
          name: user.nom,
          role: user.role,
          username: user.username,
          arrondissementId: user.arrondissementId,
          sectionId: user.sectionId,
          mustChangePassword: user.mustChangePassword,
          isDemo: false,
        };
      }
    }),
    // Connexion démonstration (correction n°10, §10.1) : n'interroge JAMAIS la base de
    // production. Un compte réel ne peut jamais s'authentifier ici (table distincte),
    // et un compte démo ne peut jamais s'authentifier via le provider "credentials" ci-dessus.
    CredentialsProvider({
      id: "demo",
      name: "Démonstration",
      credentials: {
        username: { label: "Identifiant démo", type: "text" },
        password: { label: "Mot de passe démo", type: "password" }
      },
      async authorize(credentials) {
        if (!demoDb) return null; // DEMO_DATABASE_URL absent : le mode démo n'est pas configuré ici
        if (!credentials?.username || !credentials?.password) return null;

        // Même amorçage que ci-dessus : la base de démonstration reçoit les
        // mêmes migrations, donc les mêmes politiques et la même porte.
        const user = await compteParUsername(demoDb, credentials.username.trim());
        if (!user || !user.actif) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.nom,
          role: user.role,
          username: user.username,
          arrondissementId: user.arrondissementId,
          sectionId: user.sectionId,
          mustChangePassword: false,
          isDemo: true,
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = (user as any).role;
        token.username = (user as any).username;
        token.arrondissementId = (user as any).arrondissementId;
        token.sectionId = (user as any).sectionId;
        token.mustChangePassword = (user as any).mustChangePassword;
        token.isDemo = Boolean((user as any).isDemo);
      }
      // Après complétion du profil (premiere-connexion), le client déclenche
      // update() pour rafraîchir mustChangePassword sans exiger une reconnexion.
      // Jamais pour une session démo : les comptes démo n'ont pas de première connexion.
      if (trigger === "update" && token.sub && !token.isDemo) {
        const fresh = await compteParId(db, token.sub);
        if (fresh) {
          token.mustChangePassword = fresh.mustChangePassword;
          token.role = fresh.role;
          token.username = fresh.username;
          token.arrondissementId = fresh.arrondissementId;
          token.sectionId = fresh.sectionId;
        }
      }
      // Révocation d'appareil à distance (hors-ligne, sécurité) : vérifiée à
      // CHAQUE résolution de session (pages ET API), jamais seulement à la
      // connexion — sinon un appareil perdu/volé resterait valide jusqu'à
      // expiration naturelle du jeton (30 jours). Un jeton émis avant la
      // révocation échoue ici ; l'utilisateur peut toujours se reconnecter
      // normalement ensuite (seul le jeton déjà émis est invalidé, pas le compte).
      if (!token.isDemo && token.sub && trigger !== "update") {
        // Vérifiée à chaque requête, donc avant tout cloisonnement possible :
        // c'est le second usage — et le dernier — de la porte d'amorçage.
        const fresh = await compteParId(db, token.sub);
        const emisLe = typeof token.iat === "number" ? token.iat * 1000 : 0;
        if (!fresh || !fresh.actif || (fresh.sessionRevoqueeLe && emisLe < fresh.sessionRevoqueeLe.getTime())) {
          token.revoque = true;
        } else {
          // Le rôle et le rattachement suivent la BASE, pas la connexion. Figés
          // dans le jeton, ils survivaient 30 jours à une correction : un compte
          // créé en DA puis corrigé en agent de saisie continuait d'être traité
          // en DA — et son bouton « Envoyer au Délégué Départemental » court-
          // circuitait le Délégué d'Arrondissement. Le compte est déjà relu ici
          // à chaque requête : le reprendre ne coûte rien.
          token.role = fresh.role;
          token.arrondissementId = fresh.arrondissementId;
          token.sectionId = fresh.sectionId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.revoque) {
        // Session invalidée (compte désactivé ou appareil révoqué à distance) :
        // pas d'utilisateur exposé, tout le code existant qui teste `!session?.user`
        // (AppShell, requireUser…) redirige/rejette déjà correctement sur ce cas.
        return { ...session, user: undefined, expires: session.expires };
      }
      if (token && session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).username = token.username;
        (session.user as any).arrondissementId = token.arrondissementId;
        (session.user as any).sectionId = token.sectionId;
        (session.user as any).mustChangePassword = token.mustChangePassword;
        (session.user as any).isDemo = Boolean(token.isDemo);
      }
      return session;
    }
  },
  pages: {
    signIn: '/',
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
};
