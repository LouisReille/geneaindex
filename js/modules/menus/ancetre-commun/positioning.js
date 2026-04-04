// Placement vue Ancêtre commun (deux lignées vers l’ancêtre commun le plus récent).

function calculateLCAPositions(nodes, path1, path2, lcaId, person1Id, person2Id, layoutOverrides) {
    const L = getMenuLayout('lca', layoutOverrides);
    const positions = {};

    const VERTICAL_SPACING = L.verticalSpacing;
    const HORIZONTAL_SPACING = L.horizontalSpacing;

    const bottomY = 0;
    positions[person1Id] = { x: -HORIZONTAL_SPACING, y: bottomY };
    positions[person2Id] = { x: HORIZONTAL_SPACING, y: bottomY };

    const generationsToLCA1 = path1.length - 1;
    const generationsToLCA2 = path2.length - 1;
    const maxGenerations = Math.max(generationsToLCA1, generationsToLCA2);

    const lcaY = bottomY - (maxGenerations * VERTICAL_SPACING);
    positions[lcaId] = { x: 0, y: lcaY };

    let currentY = bottomY - VERTICAL_SPACING;
    let currentX = -HORIZONTAL_SPACING;

    for (let i = 1; i < path1.length - 1; i++) {
        const personId = path1[i];
        if (personId && personId !== person1Id && personId !== lcaId) {
            positions[personId] = { x: currentX, y: currentY };
            currentY -= VERTICAL_SPACING;
        }
    }

    currentY = bottomY - VERTICAL_SPACING;
    currentX = HORIZONTAL_SPACING;

    for (let i = 1; i < path2.length - 1; i++) {
        const personId = path2[i];
        if (personId && personId !== person2Id && personId !== lcaId) {
            positions[personId] = { x: currentX, y: currentY };
            currentY -= VERTICAL_SPACING;
        }
    }

    return positions;
}
