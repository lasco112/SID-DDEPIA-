/**
 * Une passerelle pour toute interface « compatible OpenAI ».
 *
 * Pourquoi celle-ci et pas une par fournisseur
 * -------------------------------------------
 * Mistral, Together, Groq, OpenRouter — et, du côté auto-hébergé, vLLM,
 * llama.cpp ou Ollama — exposent tous le même point d'entrée
 * `/chat/completions`. Un seul adaptateur les couvre donc tous, et surtout il
 * couvre **les deux mondes** : changer de fournisseur, ou passer un jour à
 * l'auto-hébergement d'un modèle ouvert, ne demande que de changer trois
 * variables d'environnement. Aucune ligne de code.
 *
 * C'est exactement la réversibilité que l'étude exige (§ 4) — et c'est ce qui
 * rend le choix du modèle peu risqué à prendre.
 *
 * Ce qu'elle ne fait jamais
 * -------------------------
 * Elle ne lève pas : elle rend `null`. L'appelant se rabat alors sur le texte du
 * moteur de règles. Un modèle lent, en panne ou mal configuré ne doit jamais
 * empêcher le Délégué de travailler.
 *
 * Elle ne journalise jamais la clé, ni en clair ni tronquée.
 */
import type { PasserelleIA, DemandeRedaction, PropositionModele } from "./passerelle";

export interface ConfigurationIA {
  /** Racine de l'API : « https://…/v1 », ou « http://localhost:11434/v1 ». */
  urlBase: string;
  cle: string;
  modele: string;
}

/** Délai au-delà duquel on abandonne. Le repli coûte moins cher que l'attente. */
const DELAI_PAR_DEFAUT_MS = 20_000;

/**
 * Lit la configuration depuis l'environnement.
 *
 * Rend `null` si elle est incomplète — ce qui est le cas normal aujourd'hui,
 * aucun modèle n'étant choisi. L'absence de configuration n'est pas une erreur.
 */
export function configurationDepuisEnvironnement(): ConfigurationIA | null {
  const urlBase = process.env.IA_URL_BASE?.trim();
  const cle = process.env.IA_CLE?.trim();
  const modele = process.env.IA_MODELE?.trim();
  if (!urlBase || !cle || !modele) return null;
  return { urlBase: urlBase.replace(/\/+$/, ""), cle, modele };
}

/**
 * La consigne système.
 *
 * Elle dit au modèle ce qu'il a le droit de faire, mais rien ici ne REPOSE sur
 * son obéissance : les garde-fous vérifient la sortie et rejettent ce qui ne
 * convient pas. La consigne réduit le nombre de rejets ; elle ne les remplace
 * pas.
 */
export const CONSIGNE_SYSTEME = [
  "Vous rédigez des paragraphes pour un rapport administratif officiel du MINEPIA, au Cameroun.",
  "",
  "RÈGLES ABSOLUES :",
  "- N'écrivez JAMAIS un chiffre. Les valeurs sont fournies sous forme de repères",
  "  entre doubles accolades, par exemple {{F1.phrase}}. Reprenez ces repères tels quels,",
  "  sans les modifier, sans en inventer d'autres.",
  "- N'inventez aucun repère qui ne figure pas dans les faits fournis.",
  "- Ne portez aucun jugement : pas de « préoccupant », « satisfaisant », « alarmant ».",
  "  Décrivez ce que disent les faits, sans les qualifier.",
  "- Mentionnez tous les faits fournis. N'en omettez aucun.",
  "",
  "Style : français administratif sobre, phrases courtes, à destination d'agents",
  "de l'administration. Pas de titre, pas de liste, pas de formule de politesse.",
].join("\n");

interface ReponseChat {
  choices?: { message?: { content?: string } }[];
  model?: string;
}

/**
 * Fabrique la passerelle. `null` si aucune configuration n'est présente — le
 * SID fonctionne alors exactement comme aujourd'hui.
 */
export function passerelleCompatibleOpenAI(config: ConfigurationIA): PasserelleIA {
  return {
    nom: `compatible-openai:${config.modele}`,

    async disponible() {
      // On ne « pingue » pas : la plupart des fournisseurs facturent ou limitent
      // les appels, et une configuration présente suffit à tenter l'appel réel.
      // Un échec se traduira par un repli, ce qui est le comportement voulu.
      return Boolean(config.urlBase && config.cle && config.modele);
    },

    async proposer(demande: DemandeRedaction): Promise<PropositionModele | null> {
      const debut = Date.now();
      const abandon = new AbortController();
      const minuterie = setTimeout(() => abandon.abort(), demande.delaiMs ?? DELAI_PAR_DEFAUT_MS);

      try {
        const reponse = await fetch(`${config.urlBase}/chat/completions`, {
          method: "POST",
          signal: abandon.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.cle}`,
          },
          body: JSON.stringify({
            model: config.modele,
            messages: [
              { role: "system", content: CONSIGNE_SYSTEME },
              { role: "user", content: demande.invite },
            ],
            // Peu de créativité : on veut une reformulation sobre et stable,
            // pas une variation littéraire d'un rapport à l'autre.
            temperature: 0.2,
            max_tokens: 500,
          }),
        });

        if (!reponse.ok) {
          // Le corps peut contenir la clé dans un message d'erreur mal fait :
          // on ne journalise que le code.
          console.error(`[assistance] appel refusé par le service (${reponse.status}).`);
          return null;
        }

        const donnees = (await reponse.json()) as ReponseChat;
        const texte = donnees.choices?.[0]?.message?.content?.trim();
        if (!texte) return null;

        return {
          texte,
          modele: config.modele,
          versionModele: donnees.model,
          latenceMs: Date.now() - debut,
        };
      } catch (e) {
        const cause = e instanceof Error && e.name === "AbortError" ? "délai dépassé" : "service injoignable";
        console.error(`[assistance] appel abandonné : ${cause}.`);
        return null;
      } finally {
        clearTimeout(minuterie);
      }
    },
  };
}
