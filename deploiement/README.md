# Installer le SID sur un serveur neuf

Quatre scripts, dans l'ordre. Comptez une heure la première fois.

Prévu pour **Ubuntu 24.04 LTS** — le système proposé par défaut chez Hetzner,
Contabo et la plupart des hébergeurs. Ne prenez pas une autre distribution sans
me le dire : les commandes changent.

---

## Avant de commencer

Il vous faut :

- un VPS avec **au moins 4 Go de mémoire** (l'application et PostgreSQL
  tournent ensemble ; 2 Go suffiraient à peine et vous le regretteriez) ;
- son **adresse IP** et le mot de passe root envoyé par l'hébergeur ;
- un **nom de domaine** pointant vers cette IP, si vous en avez un. Sans
  domaine, le HTTPS n'est pas possible et les agents verront un avertissement
  de sécurité dans leur navigateur — à éviter pour un service administratif.

### Se connecter au serveur

Depuis votre ThinkPad, dans PowerShell :

```bash
ssh root@VOTRE_ADRESSE_IP
```

### Envoyer les scripts sur le serveur

Toujours depuis votre machine, dans le dossier du projet :

```bash
scp -r deploiement root@VOTRE_ADRESSE_IP:/root/
```

---

## L'ordre des scripts

| # | Script | Ce qu'il fait | Durée |
|---|---|---|---|
| 1 | `01-serveur.sh` | Sécurise le serveur : pare-feu, SSH, mises à jour | ~5 min |
| 2 | `02-postgres.sh` | PostgreSQL + PostGIS, rôle applicatif sans privilèges | ~5 min |
| 3 | `03-application.sh` | Node, le SID, service qui redémarre tout seul | ~15 min |
| 4 | `04-https.sh` | Nginx et certificat HTTPS | ~5 min |
| 5 | `05-sauvegarde.sh` | **Sauvegarde quotidienne automatique** | ~2 min |

Sur le serveur :

```bash
cd /root/deploiement
chmod +x *.sh
./01-serveur.sh
```

Et ainsi de suite. **Chaque script s'arrête à la première erreur** plutôt que de
continuer sur une base fausse.

---

## Le cinquième n'est pas optionnel

Ce qui est arrivé en septembre 2026 — toutes les données du SID dans un seul
endroit, sans aucune copie, devenues inaccessibles du jour au lendemain — **ne
doit pas pouvoir se reproduire**.

`05-sauvegarde.sh` installe une sauvegarde quotidienne, **envoyée hors du
serveur**. Une sauvegarde qui reste sur la machine qu'elle sauvegarde ne protège
de rien : si le serveur disparaît, elle disparaît avec lui.

Lancez-le le **premier jour**, pas « plus tard ».

---

## Ce que ces scripts ne font pas

- **Ils n'ouvrent aucun compte et ne paient rien.** C'est à vous.
- **Ils ne restaurent aucune donnée** : le serveur démarre avec une base neuve
  et les comptes créés par le semis. Si vous récupérez un jour la sauvegarde
  Railway, `06-restaurer.sh` est là pour l'y verser.
- **Ils n'exposent jamais PostgreSQL à Internet.** La base n'écoute que
  localement. C'est ce qui vous aurait évité bien des soucis ailleurs.

---

## Après l'installation

Vérifiez que tout tient debout :

```bash
./99-verifier.sh
```

Il contrôle le pare-feu, le rôle de la base, le cloisonnement, le certificat et
la présence d'une sauvegarde récente. S'il affiche une seule FAUTE, ne mettez
pas le service entre les mains des arrondissements avant de l'avoir corrigée.
