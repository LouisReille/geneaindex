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
    const rightBranchAncestorSet = new Set();
    function collectRightBranchAncestors(id) {
        if (!id || rightBranchAncestorSet.has(id)) {
            return;
        }
        rightBranchAncestorSet.add(id);
        const asc = childToParents.get(id) || [];
        asc.forEach((p) => collectRightBranchAncestors(p));
    }
    const rootParentsForSide = childToParents.get(selectedPersonId) || [];
    if (rootParentsForSide.length >= 1) {
        collectLeftBranchAncestors(rootParentsForSide[0]);
    }
    if (rootParentsForSide.length >= 2) {
        collectRightBranchAncestors(rootParentsForSide[1]);
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
            // Ne pas utiliser centerX < 0 ici : ce n’est pas la « branche gauche » généalogique
            // (ensemble leftBranchAncestorSet). Sinon l’asymétrie jambe intérieure / extérieure
            // s’applique à tort aux nœuds à gauche de l’axe pour d’autres raisons.
            if (inLeftBranch) {
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

    /** Regroupe les ids d’une ligne en couples (même groupe mariage) puis célibataires, ordre gauche→droite. */
    function buildMarriageGroupsForRow(ids) {
        const used = new Set();
        const groups = [];
        const sorted = sortRowIdsByX(ids);
        sorted.forEach((id) => {
            if (used.has(id)) return;
            const cg = personToCoupleGroup.get(id);
            if (cg === undefined) {
                groups.push([id]);
                used.add(id);
                return;
            }
            const members = coupleGroups.get(cg) || [];
            const partner = members.find((m) => m !== id && ids.includes(m));
            if (partner && !used.has(partner)) {
                if (positions[id].x <= positions[partner].x) {
                    groups.push([id, partner]);
                } else {
                    groups.push([partner, id]);
                }
                used.add(id);
                used.add(partner);
            } else {
                groups.push([id]);
                used.add(id);
            }
        });
        return groups;
    }

    /** Distance centre → centre du premier au dernier nœud de la ligne (couples serrés, puis écart entre groupes). */
    function rowSpanLengthFromGroups(groups, gapBetweenGroups) {
        if (groups.length === 0) return 0;
        let span = 0;
        groups.forEach((g, gi) => {
            if (g.length === 2) span += coupleMinCenter;
            if (gi < groups.length - 1) span += gapBetweenGroups;
        });
        return span;
    }

    /**
     * Place une ligne : conjoints côte à côte (coupleMinCenter), pas d’individu entre les deux époux ;
     * écart horizontal entre couples (ou célibataires) distincts (voir ancestorRowBetweenCouplesGap).
     * @param {number} startFirstCenter — abscisse du centre du premier nœud (gauche) de la ligne.
     */
    function placeRowByMarriageGroupsFrom(ids, minDxRow, startFirstCenter) {
        const groups = buildMarriageGroupsForRow(ids);
        let x = startFirstCenter;
        groups.forEach((g, gi) => {
            if (g.length === 1) {
                positions[g[0]].x = x;
                if (gi < groups.length - 1) x += minDxRow;
            } else {
                positions[g[0]].x = x;
                positions[g[1]].x = x + coupleMinCenter;
                x = positions[g[1]].x;
                if (gi < groups.length - 1) x += minDxRow;
            }
        });
    }

    function blockWidthForRow(ids, minDxRow) {
        return rowSpanLengthFromGroups(buildMarriageGroupsForRow(ids), minDxRow);
    }

    /**
     * Évite les chevauchements sur chaque ligne ; si la ligne mélange branche gauche / droite,
     * on regroupe à gauche les ascendants du parent gauche de la racine et à droite les autres,
     * avec un vide au milieu (ancestorRowBetweenSidesGap). Sinon, placement par couples (conjoints
     * côte à côte) puis espacement entre groupes.
     */
    function spreadSameYRows() {
        const minDx = minCenterSeparation();
        let gapBetweenCouples = L.ancestorRowBetweenCouplesGap;
        if (typeof gapBetweenCouples !== 'number' || gapBetweenCouples < minDx) {
            gapBetweenCouples = minDx;
        }
        let betweenGap = L.ancestorRowBetweenSidesGap;
        if (typeof betweenGap !== 'number' || betweenGap < 0) {
            betweenGap = 120;
        }
        if (betweenGap < gapBetweenCouples) {
            betweenGap = gapBetweenCouples;
        }
        // Même rangée = même pas vertical (uniformSpacing), pas un arrondi en pixels (4 px
        // cassait le regroupement : les nœuds d’une ligne se retrouvaient dans plusieurs seaux,
        // le découpage gauche/droite ne s’appliquait pas → mélange « un sur deux »).
        const verticalStep = uniformSpacing;
        const rowBuckets = new Map();
        positioned.forEach((id) => {
            const p = positions[id];
            if (!p) {
                return;
            }
            const rowIdx = Math.round(-p.y / verticalStep);
            if (!rowBuckets.has(rowIdx)) {
                rowBuckets.set(rowIdx, []);
            }
            rowBuckets.get(rowIdx).push(id);
        });
        rowBuckets.forEach((ids) => {
            if (ids.length < 2) {
                return;
            }
            // Branche gauche = ascendants du parent [0] ; droite = ascendants du parent [1].
            // Exclusif gauche / exclusif droite / consanguinité (les deux) pour ne jamais
            // mélanger deux lignées sur une chaîne triée par x (effet « un sur deux »).
            const leftOnly = ids.filter(
                (id) => leftBranchAncestorSet.has(id) && !rightBranchAncestorSet.has(id)
            );
            const rightOnly = ids.filter(
                (id) => rightBranchAncestorSet.has(id) && !leftBranchAncestorSet.has(id)
            );
            const bothSides = ids.filter(
                (id) => leftBranchAncestorSet.has(id) && rightBranchAncestorSet.has(id)
            );
            const neither = ids.filter(
                (id) =>
                    !leftBranchAncestorSet.has(id) &&
                    !rightBranchAncestorSet.has(id) &&
                    id !== selectedPersonId
            );
            const rootHere = ids.filter((id) => id === selectedPersonId);

            const blocks = [];
            if (leftOnly.length > 0) blocks.push(sortRowIdsByX(leftOnly));
            if (bothSides.length > 0) blocks.push(sortRowIdsByX(bothSides));
            if (rootHere.length > 0) blocks.push(sortRowIdsByX(rootHere));
            if (neither.length > 0) blocks.push(sortRowIdsByX(neither));
            if (rightOnly.length > 0) blocks.push(sortRowIdsByX(rightOnly));

            if (blocks.length <= 1) {
                const sorted = sortRowIdsByX(ids);
                const W = blockWidthForRow(sorted, gapBetweenCouples);
                placeRowByMarriageGroupsFrom(sorted, gapBetweenCouples, -W / 2);
                return;
            }

            const gap = betweenGap;
            const blockWidths = blocks.map((b) => blockWidthForRow(b, gapBetweenCouples));
            const totalGaps = (blocks.length - 1) * gap;
            const totalSpan = blockWidths.reduce((a, w) => a + w, 0) + totalGaps;
            let cursor = -totalSpan / 2;
            blocks.forEach((block, bi) => {
                const W = blockWidths[bi];
                placeRowByMarriageGroupsFrom(block, gapBetweenCouples, cursor);
                cursor += W + (bi < blocks.length - 1 ? gap : 0);
            });
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
