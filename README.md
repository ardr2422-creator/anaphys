# Thème ANAPHYS

Thème de la boutique anaphyss.myshopify.com, construit sur **Dawn 16.0.0** (thème officiel Shopify, voir `LICENSE.md`).
Il remplace l'ancien thème « shrine-pro » : le rendu est repris, mais tout le code ajouté est écrit pour ce thème.

## Ce qui a été ajouté à Dawn

| Fichier | Rôle |
|---|---|
| `assets/anaphys.css` | Styles communs : titres à mots colorés, galerie, réassurance, pied de page, bouton retour en haut |
| `assets/anaphys-product.css` | Styles de la fiche produit : bénéfices, étapes de livraison, barre d'ajout au panier |
| `sections/anaphys-gallery.liquid` | Galerie d'images défilante (#ANAPHYS) |
| `sections/anaphys-reassurance.liquid` | Bande de réassurance (cartes icône + titre + texte) |
| `sections/anaphys-footer.liquid` | Pied de page : newsletter, aide, menu, réseaux, logo |
| `sections/anaphys-back-to-top.liquid` | Bouton flottant « retour en haut » |
| `snippets/anaphys-icon.liquid` | Icônes Material Symbols (Google, licence Apache 2.0) |
| `snippets/anaphys-benefits.liquid` | Bloc produit « Bénéfices », alimenté par le métachamp `custom.benefices` |
| `snippets/anaphys-delivery-steps.liquid` | Bloc produit « Étapes de livraison » (dates en jours ouvrés) |
| `snippets/anaphys-sticky-atc.liquid` | Barre d'ajout au panier fixe |

Modifications de fichiers Dawn existants :

- `announcement-bar` : tailles de texte et marge verticale réglables
- `header` : largeur du logo sur mobile, lien de la page en cours mis en avant
- `slideshow` : image différente sur mobile, pas de boîte de texte vide
- `image-with-text` : couleur des mots en gras dans le titre
- `main-product` + `buy-buttons` : nouveaux blocs, barre fixe, bouton en majuscules
- `layout/theme.liquid` : chargement de `anaphys.css` et du bouton retour en haut
- `config/settings_schema.json` : réglage « Largeur du logo sur mobile »

## Règles de contenu

Tutoiement, pas d'emojis, aucune promesse chiffrée ou médicale, jamais « vegan » ni « sans sulfates ».
Frais de port, seuil de livraison offerte et politique de retour : toujours en réglage, jamais écrits en dur.
