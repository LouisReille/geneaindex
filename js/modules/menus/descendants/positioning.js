/**
 * Placement vue Descendants : personne en haut, générations vers le bas.
 * @param {number} maxGenerations — niveaux sous la racine (ex. 3 = enfants + 2 générations).
 */
function calculateDescendantPositions(nodes, coupleGroups, personToCoupleGroup, parentPairToChildren, rootPersonId, maxGenerations, layoutOverrides) {
    const L = getMenuLayout('descendants', layoutOverrides);
    const positions = {};
    const generationYRange = new Map();
    const generationYears = new Map();
    const generationNumbers = new Set();
    const VERTICAL_SPACING = L.verticalGenerationSpacing;
    const H_SPACING = L.horizontalRowSpacing;
    const positioned = new Set();

    const nodeIds = new Set(nodes.getIds());

    const parentToChildren = new Map();
    nodeIds.forEach((id) => parentToChildren.set(id, []));

    parentPairToChildren.forEach((family) => {
        const parentIds = family.parents || [];
        (family.children || []).forEach((childId) => {
            if (!nodeIds.has(childId)) return;
            parentIds.forEach((pid) => {
                if (!nodeIds.has(pid)) return;
                const list = parentToChildren.get(pid);
                if (!list.includes(childId)) list.push(childId);
            });
        });
    });

    function spousesInTree(personId) {
        const g = personToCoupleGroup.get(personId);
        if (g === undefined) return [];
        const members = coupleGroups.get(g) || [];
        return members.filter((id) => id !== personId && nodeIds.has(id));
    }

    function layoutRow(memberIds, anchorCenterX, topY, depth) {
        const valid = memberIds.filter((id) => nodes.get(id));
        if (valid.length === 0) return;

        let startX = anchorCenterX;
        if (valid.length > 1) {
            const total = (valid.length - 1) * H_SPACING;
            startX = anchorCenterX - total / 2;
        }

        valid.forEach((id, i) => {
            const x = valid.length === 1 ? anchorCenterX : startX + i * H_SPACING;
            if (!positioned.has(id)) {
                positions[id] = { x, y: topY };
                positioned.add(id);
                const node = nodes.get(id);
                if (node) generationNumbers.add(node.level);
            }
        });

        if (depth >= maxGenerations) return;

        const midX = valid.reduce((acc, id) => acc + positions[id].x, 0) / valid.length;
        const childY = topY + VERTICAL_SPACING;

        const childSet = new Set();
        valid.forEach((mid) => {
            (parentToChildren.get(mid) || []).forEach((c) => {
                if (nodeIds.has(c)) childSet.add(c);
            });
        });
        const children = Array.from(childSet);
        if (children.length === 0) return;

        const rowW = (children.length - 1) * H_SPACING;
        const cx0 = midX - rowW / 2;

        children.forEach((cid, i) => {
            let cx = children.length === 1 ? midX : cx0 + i * H_SPACING;
            if (positioned.has(cid)) {
                cx = positions[cid].x;
            }
            const sp = spousesInTree(cid);
            const nextMembers = sp.length > 0 ? [cid, sp[0]] : [cid];
            layoutRow(nextMembers, cx, childY, depth + 1);
        });
    }

    if (!rootPersonId || !nodes.get(rootPersonId)) {
        return { positions, generationYRange, generationYears, generationNumbers };
    }

    const rootSp = spousesInTree(rootPersonId);
    const firstRow = rootSp.length > 0 ? [rootPersonId, rootSp[0]] : [rootPersonId];
    layoutRow(firstRow, 0, 0, 0);

    positioned.forEach((nodeId) => {
        const node = nodes.get(nodeId);
        if (node && positions[nodeId]) {
            const level = node.level;
            if (!generationYRange.has(level)) {
                generationYRange.set(level, {
                    min: positions[nodeId].x,
                    max: positions[nodeId].x,
                });
            } else {
                const range = generationYRange.get(level);
                range.min = Math.min(range.min, positions[nodeId].x);
                range.max = Math.max(range.max, positions[nodeId].x);
            }
        }
    });

    return { positions, generationYRange, generationYears, generationNumbers };
}
