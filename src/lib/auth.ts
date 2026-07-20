import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
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
      }
      // Après complétion du profil (premiere-connexion), le client déclenche
      // update() pour rafraîchir mustChangePassword sans exiger une reconnexion.
      if (trigger === "update" && token.sub) {
        const fresh = await db.user.findUnique({ where: { id: token.sub } });
        if (fresh) {
          token.mustChangePassword = fresh.mustChangePassword;
          token.role = fresh.role;
          token.username = fresh.username;
          token.arrondissementId = fresh.arrondissementId;
          token.sectionId = fresh.sectionId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).username = token.username;
        (session.user as any).arrondissementId = token.arrondissementId;
        (session.user as any).sectionId = token.sectionId;
        (session.user as any).mustChangePassword = token.mustChangePassword;
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
