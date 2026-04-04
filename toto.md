# Geneaindex — checklist projet

On coche au fur et à mesure. L’ordre suit la priorité métier (l’icône d’app est en dernier).

---

## Interface et contenu

- [x] **Interface entièrement en français** — libellés, messages d’erreur, chargements, légendes, statistiques, modes de recherche (hors données brutes dans `data.js`). _Reste possible : quelques chaînes dans d’autres modules (ex. logs console, libellés secondaires)._
- [x] **Dates d’affichage** — pour les dates complètes au format ISO `aaaa-mm-jj`, affichage en **`jj/mm/aaaa`** (recherche, fiche popup ; fonction `formatDateForDisplay` dans `utils.js`).
- [x] **Barre de recherche (personnes)** — ne plus afficher l’**identifiant interne** de l’individu dans les résultats (nom + infos utiles uniquement).
- [x] **Nouveau menu « Descendants »** — arbre vers le bas sur **2 à 5 générations** ; recherche + liste déroulante ; clic sur un nœud pour recentrer ; conjoints ajoutés si mariage dans le sous-ensemble.
- [ ] **Guide d’utilisation (première visite)** — expliquer chacun des **5 menus** (ancêtres, descendants, arbre complet, ancêtre commun, nom de famille) et comment les utiliser.
- [ ] **Design global** — harmoniser mise en page, typographie, espacements et cohérence visuelle entre les vues.
- [ ] **Affichage d’une personne par menu** — adapter le **détail / la présentation** d’un individu selon le menu actif (ce qui est pertinent diffère selon la vue).
- [x] **Placement par menu** — `MENU_LAYOUT` (figé au chargement) + `getMenuLayout()` : copie à chaque lecture, un bloc par menu ; modifier un menu n’altère pas les autres (`config.js`, commentaires de règles de travail).

## Comportement

- [x] **Chargement du menu « Arbre » (vue complète)** — bouton central **« Charger l’arbre complet »** (pas de démarrage auto). Chargement **en arrière-plan** si changement de menu : pas d’affichage ni de bascule forcée tant qu’on n’est pas sur ce menu ; au retour, arbre affiché si le calcul est terminé (`linkTreeLoading` / `AppState.currentMenu === 'link'` pour le rendu).

## Packaging

- [ ] **Icône de l’application** — placer les fichiers dans `build/` (ex. `icon.png` / `.icns` / `.ico`) et configurer **electron-builder** (+ option `icon` de la fenêtre si besoin).

---

_Dernière mise à jour : reprise session (interruption corrigée)._
