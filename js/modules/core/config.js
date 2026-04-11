// Configuration constants
const CONFIG = {
    // Color scheme for different planches
    plancheColors: [
        '#3498db', '#e74c3c', '#27ae60', '#f39c12', '#9b59b6',
        '#1abc9c', '#34495e', '#e67e22', '#16a085', '#c0392b'
    ],
    
    // Positioning constants
    sameGenerationSpacing: 400,      // Vertical spacing between nodes in the same generation when stacking
    betweenGenerationSpacing: 800,   // Vertical spacing between different generations (fallback if no birth year)
    nodeWidth: 250,                  // Maximum node width (from widthConstraint)
    nodeMargin: 15,                  // Node margin (from node styling)
    minMarginBetweenNodes: 20,       // Minimum margin between any two nodes (left/right)
    // Spacing calculation: nodeWidth/2 + minMarginBetweenNodes + nodeWidth/2 = nodeWidth + minMarginBetweenNodes
    coupleSpacing: 20,               // Horizontal spacing between spouses (right next to each other)
    minHorizontalSpacing: 270,       // Minimum horizontal spacing between different families (same as coupleSpacing)
    maxHorizontalDistance: 250,      // If parent-child horizontal distance > this, stack vertically (more aggressive)
    maxRowWidth: 10000,              // Maximum width of a row in link mode (prevents green lines from becoming too long)
    maxIndividualsPerRow: 6,         // Maximum number of individuals per row before stacking (more aggressive)
    nodeHeight: 100,                 // Approximate node height to prevent vertical overlap
    minVerticalSpacing: 120,         // Minimum vertical spacing between any two nodes (to prevent overlap)
    maxVerticalSpacing: 300,         // Maximum vertical spacing between nodes (to keep layout compact)
    yearToYScale: 15,                // Base pixels per year for birth year-based positioning (will be adjusted dynamically)
    
    // Edge colors
    marriageColor: '#e74c3c',
    parentChildColor: '#27ae60',
    otherRelationColor: '#3498db',
    
    // Node styling
    nodeBorderColor: '#2c3e50',
    nodeHighlightBorder: '#e74c3c',
    defaultPlancheColor: '#95a5a6',

    /** Popup fiche personne : affichage après survol continu (ms), masquage après sortie (ms). */
    personPopupShowDelayMs: 1000,
    personPopupHideDelayMs: 250
};

/**
 * Copie superficielle d’un profil (nombres / booléens uniquement).
 * Chaque appel de placement reçoit sa propre copie : aucune fuite entre menus.
 */
function cloneLayoutProfile(obj) {
    if (!obj || typeof obj !== 'object') return {};
    const out = {};
    Object.keys(obj).forEach((k) => {
        out[k] = obj[k];
    });
    return out;
}

/**
 * Espacements et paramètres de placement par menu.
 *
 * Chaque menu a son propre dossier `js/modules/menus/<nom>/` :
 * - `config.js` — nombres passés à `getMenuLayout('<clé>')`
 * - `positioning.js` — algorithme de placement (sauf Nom de famille : réutilise Arbre complet)
 *
 * Correspondance : Ancêtres `tree`, Descendants `descendants`, Arbre complet `linkSync`/`linkAsync`,
 * Ancêtre commun `lca`, Nom de famille `family`.
 * Les `config.js` sont chargés avant ce fichier dans index.html.
 *
 * `var` (et non `const`) pour le catalogue : évite une ReferenceError « Cannot access
 * 'MENU_LAYOUT' before initialization » si une fonction hoisted lisait le binding trop tôt.
 */
var MENU_LAYOUT = {
    tree: MENU_LAYOUT_ANCETRES,
    descendants: MENU_LAYOUT_DESCENDANTS,
    lca: MENU_LAYOUT_ANCETRE_COMMUN,
    family: MENU_LAYOUT_NOM_DE_FAMILLE,
    linkSync: MENU_LAYOUT_ARBRE_COMPLET_SYNC,
    linkAsync: MENU_LAYOUT_ARBRE_COMPLET_ASYNC
};

(function freezeMenuLayoutCatalog() {
    function deepFreeze(o) {
        if (o === null || typeof o !== 'object') return;
        Object.freeze(o);
        Object.keys(o).forEach((k) => {
            const v = o[k];
            if (v && typeof v === 'object') deepFreeze(v);
        });
    }
    deepFreeze(MENU_LAYOUT);
})();

/**
 * Retourne toujours une NOUVELLE copie du profil demandé (jamais la référence du catalogue).
 * Les surcharges sont aussi clonées pour éviter qu’un appel ne mute un objet réutilisé ailleurs.
 *
 * @param {string} menuKey — ex. 'tree', 'linkAsync', 'family'
 * @param {object} [overrides]
 */
var getMenuLayout = function (menuKey, overrides) {
    const base = MENU_LAYOUT[menuKey];
    const profile = cloneLayoutProfile(base || MENU_LAYOUT.tree);
    const extra = cloneLayoutProfile(overrides);
    return Object.assign(profile, extra);
};

