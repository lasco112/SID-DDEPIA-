import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { demoDb } from "@/lib/demoDb";

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

        const user = await db.user.findUnique({
          where: { username: credentials.username.trim() }
        });
        if (!user || !user.actif) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await db.auditLog.create({
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

        const user = await demoDb.user.findUnique({
          where: { username: credentials.username.trim() }
        });
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
        const fresh = await db.user.findUnique({ where: { id: token.sub } });
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
        const fresh = await db.user.findUnique({
          where: { id: token.sub },
          select: { actif: true, sessionRevoqueeLe: true },
        });
        const emisLe = typeof token.iat === "number" ? token.iat * 1000 : 0;
        if (!fresh || !fresh.actif || (fresh.sessionRevoqueeLe && emisLe < fresh.sessionRevoqueeLe.getTime())) {
          token.revoque = true;
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
