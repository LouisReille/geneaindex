/**
 * Placement vue Descendants : personne en haut, générations vers le bas.
 * @param {number} maxGenerations — niveaux sous la racine (ex. 3 = enfants + 2 générations).
 */
function calculateDescendantPositions(nodes, coupleGroups, personToCoupleGroup, parentPairToChildren, rootPersonId, maxGenerations, layoutOverrides) {
    maxGenerations = Math.min(3, Math.max(1, Number(maxGenerations) || 3));
    const L = getMenuLayout('descendants', layoutOverrides);
    const positions = {};
    const generationYRange = new Map();
    const generationYears = new Map();
    const generationNumbers = new Set();
    const VERTICAL_SPACING = L.verticalGenerationSpacing;
    const H_SPACING = L.horizontalRowSpacing;
    const positioned = new Set();

    let maxPerRow = L.descendantMaxIndividualsPerRow;
    if (typeof maxPerRow !== 'number' || maxPerRow < 1) {
        maxPerRow = 15;
    }
    maxPerRow = Math.min(15, Math.floor(maxPerRow));

    /** Sous-rangées d’une même génération (empilement) : toujours inférieur à l’espacement entre générations. */
    let ROW_SUB = L.descendantSiblingRowSpacing;
    if (typeof ROW_SUB !== 'number' || ROW_SUB < 1) {
        ROW_SUB = Math.min(VERTICAL_SPACING - 140, 300);
    }
    if (ROW_SUB >= VERTICAL_SPACING) {
        ROW_SUB = Math.max(120, VERTICAL_SPACING - 180);
    }

    let minCoupleGap = L.descendantMinCoupleGap;
    if (typeof minCoupleGap !== 'number' || minCoupleGap < 0) {
        minCoupleGap = 30;
    }
    let minIndividualGap = L.descendantMinIndividualGap;
    if (typeof minIndividualGap !== 'number' || minIndividualGap < 0) {
        minIndividualGap = 160;
    }

    /**
     * Même principe que l’arbre complet (processGeneration) : par rangée (même Y), tri par X puis
     * écart minimal bord à bord ; si conjoints, déplacement du couple entier.
     */
    function resolveSameRowOverlaps() {
        const rowBuckets = new Map();
        positioned.forEach((id) => {
            const p = positions[id];
            if (!p) return;
            const rowKey = Math.round(p.y);
            if (!rowBuckets.has(rowKey)) {
                rowBuckets.set(rowKey, []);
            }
            rowBuckets.get(rowKey).push(id);
        });

        rowBuckets.forEach((ids) => {
            if (ids.length < 2) return;
            const sortedRowNodes = [...ids].sort((a, b) => positions[a].x - positions[b].x);

            for (let i = 0; i < sortedRowNodes.length - 1; i++) {
                const node1Id = sortedRowNodes[i];
                const node2Id = sortedRowNodes[i + 1];
                const node1X = positions[node1Id].x;
                const node2X = positions[node2Id].x;

                const node1Right = node1X + CONFIG.nodeWidth / 2;
                const node2Left = node2X - CONFIG.nodeWidth / 2;
                const gap = node2Left - node1Right;

                const coupleGroup1 = personToCoupleGroup.get(node1Id);
                const coupleGroup2 = personToCoupleGroup.get(node2Id);
                const sameCouple =
                    coupleGroup1 !== undefined &&
                    coupleGroup2 !== undefined &&
                    coupleGroup1 === coupleGroup2;
                const requiredGap = sameCouple ? minCoupleGap : minIndividualGap;

                if (gap < requiredGap) {
                    const offset = requiredGap - gap;
                    positions[node2Id].x += offset;

                    if (coupleGroup2 !== undefined) {
                        const coupleMembers = coupleGroups.get(coupleGroup2) || [];
                        coupleMembers.forEach((memberId) => {
                            if (memberId !== node2Id && ids.includes(memberId)) {
                                positions[memberId].x += offset;
                            }
                        });
                    }
                }
            }
        });
    }

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

    const childToParents = new Map();
    nodeIds.forEach((id) => childToParents.set(id, []));
    parentPairToChildren.forEach((family) => {
        const parentIds = family.parents || [];
        (family.children || []).forEach((childId) => {
            if (!nodeIds.has(childId)) return;
            parentIds.forEach((pid) => {
                if (!nodeIds.has(pid)) return;
                const list = childToParents.get(childId);
                if (!list.includes(pid)) list.push(pid);
            });
        });
    });

    function spousesInTree(personId) {
        const g = personToCoupleGroup.get(personId);
        if (g === undefined) return [];
        const members = coupleGroups.get(g) || [];
        return members.filter((id) => id !== personId && nodeIds.has(id));
    }

    function chunkArray(arr, size) {
        const out = [];
        for (let i = 0; i < arr.length; i += size) {
            out.push(arr.slice(i, i + size));
        }
        return out;
    }

    /**
     * Place une ligne (ou plusieurs sous-rangées si > maxPerRow), puis les descendants.
     * @returns {number} ordonnée maximale utilisée par ce sous-arbre
     */
    function layoutRow(memberIds, anchorCenterX, topY, depth) {
        const valid = memberIds.filter((id) => nodes.get(id));
        if (valid.length === 0) {
            return topY;
        }

        const memberChunks = chunkArray(valid, maxPerRow);
        const memFirstLen = Math.min(valid.length, maxPerRow);
        const rowWMemFirst = memFirstLen <= 1 ? 0 : (memFirstLen - 1) * H_SPACING;
        const memberLeftEdgeX = anchorCenterX - rowWMemFirst / 2;
        memberChunks.forEach((chunk, mi) => {
            const rowY = topY + mi * ROW_SUB;
            chunk.forEach((id, i) => {
                const x = chunk.length === 1 ? memberLeftEdgeX : memberLeftEdgeX + i * H_SPACING;
                if (!positioned.has(id)) {
                    positions[id] = { x, y: rowY };
                    positioned.add(id);
                    const node = nodes.get(id);
                    if (node) generationNumbers.add(node.level);
                }
            });
        });

        const bottomMemberY = topY + (memberChunks.length - 1) * ROW_SUB;

        if (depth >= maxGenerations) {
            return bottomMemberY;
        }

        const midX = valid.reduce((acc, id) => acc + positions[id].x, 0) / valid.length;

        const childSet = new Set();
        valid.forEach((mid) => {
            (parentToChildren.get(mid) || []).forEach((c) => {
                if (nodeIds.has(c)) childSet.add(c);
            });
        });
        const children = Array.from(childSet);
        if (children.length === 0) {
            return bottomMemberY;
        }

        const childStartY = bottomMemberY + VERTICAL_SPACING;
        const childrenSorted = [...children].sort((a, b) => String(a).localeCompare(String(b)));
        const childChunks = chunkArray(childrenSorted, maxPerRow);

        /* Même bord gauche pour chaque sous-rangée : les nœuds qui iraient très loin à gauche
         * sur une seule ligne sont empilés verticalement (l’un sous l’autre) au lieu d’être
         * recentrés sous le couple (ce qui gardait des lignes énormes des deux côtés). */
        const firstChunkLen = Math.min(childrenSorted.length, maxPerRow);
        const rowWFirst = firstChunkLen <= 1 ? 0 : (firstChunkLen - 1) * H_SPACING;
        const leftEdgeCenterX = midX - rowWFirst / 2;

        let subtreeMax = bottomMemberY;
        childChunks.forEach((chunk, ci) => {
            const rowY = childStartY + ci * ROW_SUB;
            const rowW = (chunk.length - 1) * H_SPACING;
            const cx0 = leftEdgeCenterX;
            chunk.forEach((cid, i) => {
                let cx = chunk.length === 1 ? leftEdgeCenterX : cx0 + i * H_SPACING;
                if (positioned.has(cid)) {
                    cx = positions[cid].x;
                }
                const sp = spousesInTree(cid);
                const nextMembers = sp.length > 0 ? [cid, sp[0]] : [cid];
                const subMax = layoutRow(nextMembers, cx, rowY, depth + 1);
                subtreeMax = Math.max(subtreeMax, subMax);
            });
        });

        return subtreeMax;
    }

    if (!rootPersonId || !nodes.get(rootPersonId)) {
        return { positions, generationYRange, generationYears, generationNumbers };
    }

    const rootSp = spousesInTree(rootPersonId);
    const firstRow = rootSp.length > 0 ? [rootPersonId, rootSp[0]] : [rootPersonId];
    layoutRow(firstRow, 0, 0, 0);

    /** Parents (une ligne) au-dessus de la personne de départ pour remonter sans ajouter un palier grands-parents. */
    function placeAncestorsTiers() {
        const r = positions[rootPersonId];
        if (!r) return;
        let anchorX = r.x;
        if (rootSp.length > 0 && positioned.has(rootSp[0])) {
            anchorX = (r.x + positions[rootSp[0]].x) / 2;
        }
        const yRoot = r.y;

        const rawParents = childToParents.get(rootPersonId) || [];
        const parents = [...new Set(rawParents)].filter((id) => nodes.get(id));
        if (parents.length === 0) return;

        const parentsSorted = [...parents].sort((a, b) => String(a).localeCompare(String(b)));
        const parentChunks = chunkArray(parentsSorted, maxPerRow);
        const pFirstLen = Math.min(parentsSorted.length, maxPerRow);
        const rowWP0 = pFirstLen <= 1 ? 0 : (pFirstLen - 1) * H_SPACING;
        const leftPx = anchorX - rowWP0 / 2;

        parentChunks.forEach((chunk, mi) => {
            const rowY = yRoot - VERTICAL_SPACING - mi * ROW_SUB;
            chunk.forEach((id, i) => {
                const x = chunk.length === 1 ? leftPx : leftPx + i * H_SPACING;
                if (!positioned.has(id)) {
                    positions[id] = { x, y: rowY };
                    positioned.add(id);
                    const node = nodes.get(id);
                    if (node) generationNumbers.add(node.level);
                }
            });
        });
    }

    placeAncestorsTiers();

    resolveSameRowOverlaps();

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
