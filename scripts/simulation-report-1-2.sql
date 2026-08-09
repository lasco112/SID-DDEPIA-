-- SIMULATION du report automatique vers le tableau 1.2
-- ---------------------------------------------------------------------------
-- Cette requête ne fait que LIRE. Elle ne modifie rien, ne supprime rien.
-- Elle répond à une seule question : si la règle est mise en service, quelles
-- valeurs déjà saisies par les DA changeraient, et de combien ?
--
-- À coller dans la console SQL de la base Postgres, sur Railway.

WITH regles AS (
  SELECT 'T12_VOL_MOD_PONDEUSE'::text     AS cible,
         'T14_PONDEUSES_DEBUT'::text      AS source,
         'Pondeuse — élevage moderne'::text AS ligne_du_1_2,
         '1.4'::text                      AS tableau_source
  UNION ALL
  SELECT 'T12_VOL_MOD_POULET_CHAIR',
         'T15_POULETS_DEBUT',
         'Poulet chair — élevage moderne',
         '1.5'
)
SELECT
  p.mois || '/' || p.annee                       AS periode,
  a.nom                                          AS arrondissement,
  r.ligne_du_1_2                                 AS ligne_du_tableau_1_2,
  m.valeur                                       AS valeur_actuelle,
  COALESCE(s.somme, 0)                           AS somme_du_tableau_source,
  COALESCE(s.nb, 0)                              AS nb_fermes_declarees,
  CASE
    WHEN COALESCE(s.nb, 0) = 0      THEN 'CONSERVEE (tableau ' || r.tableau_source || ' vide)'
    WHEN m.valeur IS NULL           THEN 'case vide -> remplie'
    WHEN m.valeur = s.somme         THEN 'inchangee'
    ELSE '*** REMPLACEE : ' || m.valeur || ' -> ' || s.somme || ' ***'
  END                                            AS effet
FROM "RapportArrondissement" ra
JOIN "Arrondissement"   a ON a.id = ra."arrondissementId"
JOIN "PeriodeReporting" p ON p.id = ra."periodeId"
CROSS JOIN regles r
LEFT JOIN "SaisieMatrice" m
       ON m."rapportId" = ra.id AND m."fieldCode" = r.cible
LEFT JOIN LATERAL (
  SELECT SUM(sn.valeur) AS somme, COUNT(*) AS nb
  FROM "SaisieNominative" sn
  WHERE sn."rapportId" = ra.id
    AND sn."fieldCode" = r.source
    AND sn."nonRenseigne" = false
) s ON true
ORDER BY p.annee DESC, p.mois DESC, a.ordre, r.tableau_source;
