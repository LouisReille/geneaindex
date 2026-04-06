// Placement vue Ancêtre commun (deux lignées vers l’ancêtre commun le plus récent).
// À chaque génération, affiche les deux parents du lien parent–enfant lorsqu’ils existent (co-parent).

function calculateLCAPositions(nodes, path1, path2, lcaId, person1Id, person2Id, childToParents, layoutOverrides) {
    const L = getMenuLayout('lca', layoutOverrides || undefined);
    const positions = {};

    const VERTICAL_SPACING = L.verticalSpacing;
    const HORIZONTAL_SPACING = L.horizontalSpacing;
    const coupleGap = CONFIG.nodeWidth + CONFIG.coupleSpacing;

    const bottomY = 0;
    const len1 = path1.length;
    const len2 = path2.length;
    const maxGen = Math.max(len1 - 1, len2 - 1, 1);
    const lcaY = bottomY - maxGen * VERTICAL_SPACING;

    function yAtPathIndex(j, pathLen) {
        if (pathLen <= 1) return bottomY;
        return (j / (pathLen - 1)) * lcaY;
    }

    function coParentsOf(child, parentOnPath) {
        const ps = childToParents.get(child) || [];
        return ps.filter((pid) => pid !== parentOnPath);
    }

    function placeRow(nodeIds, centerX, y) {
        const unique = [...new Set(nodeIds.filter(Boolean))];
        if (unique.length === 0) return;
        const total = (unique.length - 1) * coupleGap;
        let x0 = centerX - total / 2;
        unique.forEach((id, i) => {
            positions[id] = { x: x0 + i * coupleGap, y };
        });
    }

    const leftX = -HORIZONTAL_SPACING * 2;
    const rightX = HORIZONTAL_SPACING * 2;

    const p1IsLca = person1Id === lcaId;
    const p2IsLca = person2Id === lcaId;

    if (!p1IsLca) {
        placeRow([person1Id], leftX, yAtPathIndex(0, len1));
    }

    for (let j = 1; j < len1 - 1; j++) {
        const y = yAtPathIndex(j, len1);
        const row = [path1[j], ...coParentsOf(path1[j - 1], path1[j])];
        placeRow(row, leftX, y);
    }

    if (!p2IsLca) {
        placeRow([person2Id], rightX, yAtPathIndex(0, len2));
    }

    for (let j = 1; j < len2 - 1; j++) {
        const y = yAtPathIndex(j, len2);
        const row = [path2[j], ...coParentsOf(path2[j - 1], path2[j])];
        placeRow(row, rightX, y);
    }

    const lcaRow = new Set([lcaId]);
    if (len1 >= 2) {
        coParentsOf(path1[len1 - 2], path1[len1 - 1]).forEach((id) => lcaRow.add(id));
    }
    if (len2 >= 2) {
        coParentsOf(path2[len2 - 2], path2[len2 - 1]).forEach((id) => lcaRow.add(id));
    }
    placeRow(Array.from(lcaRow), 0, lcaY);

    return positions;
}
