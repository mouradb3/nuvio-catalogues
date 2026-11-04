# Nuvio — Catalogues streaming France + Canada (hébergement gratuit)

Ce projet génère un addon compatible avec Nuvio/Stremio et le publie sous forme de fichiers statiques sur GitHub Pages. **Aucun PC ni serveur personnel ne doit rester allumé** : GitHub Actions lance le scan automatiquement toutes les 3 heures, conserve l'état dans `data/state.json` et republie les catalogues.

## Catalogues générés

- Nouveautés streaming — Films (France)
- Nouveautés streaming — Séries (France)
- Sorties récentes — Films (Canada, VFQ possible)
- Sorties récentes — Séries (Canada, VFQ possible)
- Récemment retirés — Films (90 jours)
- Récemment retirés — Séries (90 jours)
- Tendances — Films disponibles en France
- Tendances — Séries disponibles en France

Les offres prises en compte : abonnement (`flatrate`), location (`rent`), achat (`buy`), gratuit (`free`) et gratuit avec publicité (`ads`). Une disponibilité canadienne ne garantit pas la présence d'une piste audio VFQ.

## Installation sans ordinateur (depuis un téléphone Android)

1. Créer un compte gratuit sur [GitHub](https://github.com/).
2. Créer un nouveau dépôt **public** nommé par exemple `nuvio-catalogues`.
3. Importer dans ce dépôt tous les fichiers de cette archive en conservant leur arborescence (`src`, `public`, `.github`, `package.json`, etc.). Le plus simple depuis Android est d'utiliser GitHub dans Chrome en mode « version pour ordinateur » ou l'application GitHub avec un outil d'envoi de fichiers.
4. Sur TMDB, créer/récupérer un jeton API v4 Bearer dans [Paramètres API](https://www.themoviedb.org/settings/api).
5. Dans le dépôt GitHub : **Settings → Secrets and variables → Actions → New repository secret**. Nom : `TMDB_API_TOKEN`. Valeur : le jeton Bearer TMDB. Ne jamais mettre ce jeton dans un fichier public.
6. Dans **Settings → Pages → Build and deployment**, choisir **Source: GitHub Actions**.
7. Ouvrir **Actions → Actualiser les catalogues Nuvio → Run workflow** pour lancer le premier scan. Le premier scan initialise l'historique ; les rangées de nouveautés se rempliront au fil des scans suivants.
8. Une fois le déploiement terminé, ouvrir **Settings → Pages** et récupérer l'adresse publiée, de la forme `https://VOTRE-PSEUDO.github.io/nuvio-catalogues/`.
9. Ajouter dans Nuvio sur Android TV le manifest en ajoutant `manifest.json` à la fin de cette adresse : `https://VOTRE-PSEUDO.github.io/nuvio-catalogues/manifest.json`.

## Automatisation et historique

- Scan programmé toutes les 3 heures (`.github/workflows/deploy.yml`) et lancement manuel possible depuis l'onglet Actions.
- L'état `data/state.json` est commité dans le dépôt pour conserver les offres précédentes et les événements sur 90 jours entre deux exécutions.
- Les changements détectés sont horodatés par le moteur ; ce n'est pas la date officielle de mise en ligne sur la plateforme.
- Une erreur temporaire de l'API pour une région ne transforme plus ses anciennes offres en faux retraits.
- Le premier scan est un état de référence et ne fabrique pas d'historique antérieur.

## Limites et confidentialité

- Le dépôt doit être public pour bénéficier gratuitement des runners GitHub Actions sans consommer le quota mensuel privé. Le code, l'historique de disponibilités et les catalogues publiés seront donc publics.
- Le jeton TMDB reste dans les Secrets GitHub et n'est pas inclus dans le dépôt ni dans les fichiers publiés.
- TMDB/JustWatch fournit principalement les disponibilités actuelles, pas un flux historique exhaustif des dates d'ajout. Les titres plus anciens peuvent être manqués par la découverte actuelle, qui s'appuie sur les dates de sortie et un nombre limité de pages Discover.
- La fréquence planifiée GitHub peut être retardée en période de forte charge ; elle n'est pas une garantie d'exécution à la minute près.
- Les données d'offres sont fournies par JustWatch via TMDB. Respecter les [conditions TMDB](https://www.themoviedb.org/api-terms-of-use) et afficher l'attribution requise.

## Lancement local facultatif

Node.js 20+ : `npm install`, définir `TMDB_API_TOKEN`, puis `npm run update` et `npm run export`. Pour utiliser le serveur Express local : `npm start` (port 7000). Ce mode local n'est pas nécessaire pour l'utilisation Android TV via GitHub Pages.
