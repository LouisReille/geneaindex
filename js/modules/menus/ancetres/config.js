/**
 * Config placement — Ancêtres (clé `tree`).
 *
 * Espacement unique `ancestorUniformSpacing` : même distance en pixels pour
 * — l’écart vertical entre une génération et la suivante (enfant → parents),
 * — l’écart centre-à-centre entre les deux parents d’un couple (partout, constant).
 *
 * Branche gauche : le parent à gauche de la racine (premier id dans childToParents) + **tous** ses
 * ascendants (récursion parents des parents). `ancestorLeftBranchCoupleGapMult` / ShiftLeft
 * s’appliquent à chaque personne de cet ensemble (pas à la descendance droite).
 *
 * `ancestorBranchInnerLegShare` : jambe vers le centre plus courte (asymétrie gauche/droite).
 * Relaxation anti-chevauchement : ancestorHorizontalRelaxStep / MaxScale, puis répartition par
 * rangée (`ancestorRowMinCenterPadding`). Si gauche + droite sur la même ligne, blocs séparés
 * avec `ancestorRowBetweenSidesGap` (centre → centre entre blocs) au lieu d’une seule chaîne
 * entremêlée. `ancestorRowBetweenCouplesGap` : écart horizontal entre couples (ou célibataires)
 * distincts sur la même ligne (≥ minimum anti-chevauchement).
 *
 * Si `ancestorUniformSpacing` est absent ou trop petit, on déduit une valeur à partir des
 * anciennes clés horizontal + vertical (min des deux, plafonné par le minimum physique des couples).
 */
const MENU_LAYOUT_ANCETRES = {
    ancestorRowMinCenterPadding: 8,
    /** Écart centre → centre entre couples (ou personnes seules) distincts sur une même ligne. */
    ancestorRowBetweenCouplesGap: 380,
    /** Écart entre blocs (gauche / droite / etc.) quand une ligne mélange les lignées. */
    ancestorRowBetweenSidesGap: 280,
    ancestorUniformSpacing: 280,
    ancestorBranchInnerLegShare: 0.36,
    ancestorLeftBranchCoupleGapMult: 0.82,
    ancestorLeftBranchShiftLeft: 96,
    ancestorHorizontalRelaxStep: 0.06,
    ancestorHorizontalRelaxMaxScale: 2.65,
    horizontalSpacingFallback: 300,
    horizontalOldestGenerationBase: 300,
    horizontalGenerationMultiplier: 1,
    verticalGenerationSpacingNearRoot: 520
};
