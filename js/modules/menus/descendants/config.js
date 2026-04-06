/**
 * Config placement — Descendants (clé `descendants`).
 *
 * Après placement récursif, une passe anti-chevauchement par rangée (même logique que l’arbre
 * complet : écart minimal entre bords, plus large entre individus qu’entre conjoints).
 *
 * `verticalGenerationSpacing` doit être **supérieur** à `descendantSiblingRowSpacing` : plus
 * d’air entre deux générations qu’entre deux sous-rangées d’une même génération (empilement).
 */
const MENU_LAYOUT_DESCENDANTS = {
    verticalGenerationSpacing: 520,
    /** Centre → centre sur une même ligne (placement initial). */
    horizontalRowSpacing: 270,
    /** Écart minimal entre les bords des cartes de deux conjoints (cf. arbre complet async). */
    descendantMinCoupleGap: 30,
    /** Écart minimal entre les bords de deux cartes qui ne sont pas le même couple (idem). */
    descendantMinIndividualGap: 160,
    /** Au plus ce nombre d’individus sur une même ligne horizontale (au-delà : lignes empilées). */
    descendantMaxIndividualsPerRow: 15,
    /** Écart vertical entre deux sous-rangées d’une même génération (moins que entre générations). */
    descendantSiblingRowSpacing: 300
};
