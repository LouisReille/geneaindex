// Placement vue Ancêtres : personne choisie en bas, ancêtres au-dessus (récursif).
// Vertical et horizontal (écart centre-à-centre des couples) : même valeur uniforme
// (ancestorUniformSpacing), sans variation selon la profondeur.
// Asymétrie gauche/droite : jambe « vers le centre » plus courte (ancestorBranchInnerLegShare).
// Branche gauche : ensemble précalculé = le parent à gauche de la racine (parents[0]) + tous ses
// ascendants (parents des parents, etc.) via childToParents. Chaque nœud consulte ce set, pas un
// booléen propagé dans la récursion.
// Réglages : ancestorLeftBranchCoupleGapMult, ancestorLeftBranchShiftLeft.
// Si deux nœuds restent trop proches sur une même ligne (y), relaxation horizontale
// (ancestorHorizontalRelaxStep / MaxScale), puis « spreadSameYRows » : espacement mini par ligne ;
// si branche gauche + droite sur la même ligne, deux blocs avec trou au milieu (BetweenSidesGap).

function calculateAncestorPositions(nodes, coupleGroups, personToCoupleGroup, parentPairToChildren, rootPersonId, layoutOverrides) {
    const L = getMenuLayout('tree', layoutOverrides);
    let positions = {};
    const generationYRange = new Map();
    const generationYears = new Map();
    const generationNumbers = new Set();

    const coupleMinCenter = CONFIG.nodeWidth + CONFIG.coupleSpacing;

    const childToParents = new Map();
    parentPairToChildren.forEach((family, parentKey) => {
        const parentIds = family.parents || (parentKey.includes('_')
            ? parentKey.split('_')
            : [parentKey]);
        family.children.forEach(childId => {
            if (!childToParents.has(childId)) {
                childToParents.set(childId, []);
            }
            parentIds.forEach(parentId => {
                if (!childToParents.get(childId).includes(parentId)) {
                    childToParents.get(childId).push(parentId);
                }
            });
        });
    });

    const selectedPersonId = rootPersonId;

    if (!selectedPersonId || !nodes.get(selectedPersonId)) {
        return { positions, generationYRange, generationYears, generationNumbers };
    }

    const selectedNode = nodes.get(selectedPersonId);
    if (!selectedNode) {
        return { positions, generationYRange, generationYears, generationNumbers };
    }

    const leftBranchAncestorSet = new Set();
    function collectLeftBranchAncestors(id) {
        if (!id || leftBranchAncestorSet.has(id)) {
            return;
        }
        leftBranchAncestorSet.add(id);
        const asc = childToParents.get(id) || [];
        asc.forEach((p) => collectLeftBranchAncestors(p));
    }
    const rootParentsForSide = childToParents.get(selectedPersonId) || [];
    if (rootParentsForSide.length >= 1) {
        collectLeftBranchAncestors(rootParentsForSide[0]);
    }

    let uniformSpacing = L.ancestorUniformSpacing;
    if (typeof uniformSpacing !== 'number' || uniformSpacing < coupleMinCenter) {
        const legacyH = Math.max(
            L.ancestorHorizontalPairGap ?? L.horizontalOldestGenerationBase ?? L.horizontalSpacingFallback ?? 300,
            coupleMinCenter
        );
        const legacyV = L.verticalGenerationSpacingNearRoot ?? L.verticalGenerationSpacing ?? legacyH;
        uniformSpacing = Math.max(coupleMinCenter, Math.min(legacyH, legacyV));
    }

    let horizontalRelaxScale = 1;
    function horizontalPairGapForDepth() {
        return coupleMinCenter + (uniformSpacing - coupleMinCenter) * horizontalRelaxScale;
    }

    function verticalGapForAncestorDepth() {
        return uniformSpacing;
    }

    const positioned = new Set();

    function positionPersonAndParents(personId, centerX, centerY, depth = 0) {
        const node = nodes.get(personId);
        if (!node) {
            return;
        }

        const inLeftBranch = leftBranchAncestorSet.has(personId);

        if (!positioned.has(personId)) {
            positions[personId] = { x: centerX, y: centerY };
            positioned.add(personId);
            generationNumbers.add(node.level);
        }

        const parents = childToParents.get(personId) || [];

        if (parents.length === 0) {
            return;
        }

        const parentY = centerY - verticalGapForAncestorDepth();

        const parentDepth = depth + 1;
        const firstParentNode = nodes.get(parents[0]);
        let horizontalSpacing = horizontalPairGapForDepth();
        if (parents.length === 2 && inLeftBranch) {
            let leftCoupleMult = L.ancestorLeftBranchCoupleGapMult;
            if (typeof leftCoupleMult === 'number' && leftCoupleMult > 0 && leftCoupleMult < 1) {
                horizontalSpacing = Math.max(coupleMinCenter, horizontalSpacing * leftCoupleMult);
            }
        }

        if (firstParentNode) {
            generationNumbers.add(firstParentNode.level);
        }

        if (parents.length === 1) {
            if (!positioned.has(parents[0])) {
                positions[parents[0]] = { x: centerX, y: parentY };
                positioned.add(parents[0]);
            }

            positionPersonAndParents(parents[0], centerX, parentY, parentDepth);
        } else {
            const coupleGroup = personToCoupleGroup.get(parents[0]);
            let innerLegFrac = L.ancestorBranchInnerLegShare;
            if (typeof innerLegFrac !== 'number' || innerLegFrac <= 0.2 || innerLegFrac >= 0.48) {
                innerLegFrac = 0.36;
            }
            const outerLegFrac = 1 - innerLegFrac;
            let leftLeg;
            let rightLeg;
            if (inLeftBranch || centerX < 0) {
                rightLeg = horizontalSpacing * innerLegFrac;
                leftLeg = horizontalSpacing * outerLegFrac;
            } else if (centerX > 0) {
                leftLeg = horizontalSpacing * innerLegFrac;
                rightLeg = horizontalSpacing * outerLegFrac;
            } else {
                leftLeg = rightLeg = horizontalSpacing / 2;
            }

            if (coupleGroup !== undefined) {
                const coupleMembers = coupleGroups.get(coupleGroup);
                if (coupleMembers.includes(parents[1])) {
                    const coupleAdjustment = (CONFIG.nodeWidth + CONFIG.coupleSpacing) / 2;
                    leftLeg = Math.max(leftLeg, coupleAdjustment);
                    rightLeg = Math.max(rightLeg, coupleAdjustment);
                }
            }

            let leftBranchShift = 0;
            if (inLeftBranch) {
                const shift = L.ancestorLeftBranchShiftLeft;
                if (typeof shift === 'number' && shift > 0) {
                    leftBranchShift = shift;
                }
            }

            const firstParentX = centerX - leftLeg - leftBranchShift;
            const secondParentX = centerX + rightLeg - leftBranchShift;

            if (!positioned.has(parents[0])) {
                positions[parents[0]] = { x: firstParentX, y: parentY };
                positioned.add(parents[0]);
            }

            if (!positioned.has(parents[1])) {
                positions[parents[1]] = { x: secondParentX, y: parentY };
                positioned.add(parents[1]);
            }

            positionPersonAndParents(parents[0], firstParentX, parentY, parentDepth);
            positionPersonAndParents(parents[1], secondParentX, parentY, parentDepth);
        }
    }

    function minCenterSeparation() {
        let pad = L.ancestorRowMinCenterPadding;
        if (typeof pad !== 'number' || pad < 0) {
            pad = 0;
        }
        return CONFIG.nodeWidth + CONFIG.minMarginBetweenNodes + pad;
    }

    function sameRowOverlapsAny() {
        const minDx = minCenterSeparation();
        const yTol = 4;
        const ids = Array.from(positioned);
        for (let i = 0; i < ids.length; i++) {
            const pa = positions[ids[i]];
            if (!pa) {
                continue;
            }
            for (let j = i + 1; j < ids.length; j++) {
                const pb = positions[ids[j]];
                if (!pb) {
                    continue;
                }
                if (Math.abs(pa.y - pb.y) > yTol) {
                    continue;
                }
                if (Math.abs(pa.x - pb.x) < minDx) {
                    return true;
                }
            }
        }
        return false;
    }

    function sortRowIdsByX(ids) {
        return [...ids].sort((a, b) => {
            const dx = positions[a].x - positions[b].x;
            if (dx !== 0) {
                return dx;
            }
            return String(a).localeCompare(String(b));
        });
    }

    /**
     * Évite les chevauchements sur chaque ligne ; si la ligne mélange branche gauche / droite,
     * on regroupe à gauche les ascendants du parent gauche de la racine et à droite les autres,
     * avec un vide au milieu (ancestorRowBetweenSidesGap). Sinon, simple chaîne espacée.
     */
    function spreadSameYRows() {
        const minDx = minCenterSeparation();
        let betweenGap = L.ancestorRowBetweenSidesGap;
        if (typeof betweenGap !== 'number' || betweenGap < 0) {
            betweenGap = 120;
        }
        const yTol = 4;
        const rowBuckets = new Map();
        positioned.forEach((id) => {
            const p = positions[id];
            if (!p) {
                return;
            }
            const yKey = Math.round(p.y / yTol) * yTol;
            if (!rowBuckets.has(yKey)) {
                rowBuckets.set(yKey, []);
            }
            rowBuckets.get(yKey).push(id);
        });
        rowBuckets.forEach((ids) => {
            if (ids.length < 2) {
                return;
            }
            const leftIds = ids.filter((id) => leftBranchAncestorSet.has(id));
            const rightIds = ids.filter((id) => !leftBranchAncestorSet.has(id));
            if (leftIds.length === 0 || rightIds.length === 0) {
                const sorted = sortRowIdsByX(ids);
                for (let i = 1; i < sorted.length; i++) {
                    const prev = positions[sorted[i - 1]];
                    const cur = positions[sorted[i]];
                    const minX = prev.x + minDx;
                    if (cur.x < minX) {
                        cur.x = minX;
                    }
                }
                return;
            }
            const leftSorted = sortRowIdsByX(leftIds);
            const rightSorted = sortRowIdsByX(rightIds);
            const nL = leftSorted.length;
            const nR = rightSorted.length;
            const spanL = nL > 0 ? (nL - 1) * minDx : 0;
            const spanR = nR > 0 ? (nR - 1) * minDx : 0;
            const total = spanL + betweenGap + spanR;
            const left0 = -total / 2;
            for (let i = 0; i < nL; i++) {
                positions[leftSorted[i]].x = left0 + i * minDx;
            }
            const firstRightX = left0 + spanL + betweenGap;
            for (let j = 0; j < nR; j++) {
                positions[rightSorted[j]].x = firstRightX + j * minDx;
            }
        });
    }

    let relaxStep = L.ancestorHorizontalRelaxStep;
    if (typeof relaxStep !== 'number' || relaxStep <= 0) {
        relaxStep = 0.055;
    }
    let relaxMax = L.ancestorHorizontalRelaxMaxScale;
    if (typeof relaxMax !== 'number' || relaxMax < 1) {
        relaxMax = 2.45;
    }

    let relaxScale = 1;
    let relaxGuard = 0;
    while (true) {
        positions = {};
        positioned.clear();
        generationNumbers.clear();
        generationNumbers.add(selectedNode.level);
        horizontalRelaxScale = Math.min(relaxScale, relaxMax);
        positionPersonAndParents(selectedPersonId, 0, 0, 0);
        if (!sameRowOverlapsAny()) {
            break;
        }
        if (relaxScale >= relaxMax || relaxGuard++ >= 50) {
            break;
        }
        relaxScale += relaxStep;
    }

    spreadSameYRows();

    positioned.forEach(nodeId => {
        const node = nodes.get(nodeId);
        if (node && positions[nodeId]) {
            const level = node.level;
            if (!generationYRange.has(level)) {
                generationYRange.set(level, {
                    min: positions[nodeId].x,
                    max: positions[nodeId].x
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
