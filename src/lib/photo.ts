/**
 * Réduire une photo SUR LE TÉLÉPHONE avant de la garder ou de l'envoyer : un
 * appareil récent produit 3 à 8 Mo par photo, trop pour le réseau du terrain
 * et pour la base. 1280 pixels de côté et une qualité JPEG de 0,7 suffisent à
 * reconnaître un marché — 100 à 300 Ko.
 */
const COTE_MAX = 1280;

export async function compresserPhoto(fichier: File, qualite = 0.7): Promise<string> {
  const image = await charger(fichier);
  const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height));
  const l = Math.round(image.width * echelle);
  const h = Math.round(image.height * echelle);
  const toile = document.createElement("canvas");
  toile.width = l;
  toile.height = h;
  const ctx = toile.getContext("2d");
  if (!ctx) throw new Error("Cet appareil ne sait pas préparer la photo.");
  ctx.drawImage(image, 0, 0, l, h);
  let donnees = toile.toDataURL("image/jpeg", qualite);
  // Une photo très chargée en détails : on baisse encore un peu la qualité.
  if (donnees.length > 1_000_000) donnees = toile.toDataURL("image/jpeg", 0.55);
  return donnees;
}

function charger(fichier: File): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      ko(new Error("Cette photo n'a pas pu être lue."));
    };
    img.src = url;
  });
}
