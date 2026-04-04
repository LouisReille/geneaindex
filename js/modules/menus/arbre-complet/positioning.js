// Link view positioning: All individuals organized by generation, stacked vertically
// Each generation is on the same horizontal level (same Y), with generations stacked vertically
// Generations stacked vertically, siblings positioned next to each other with spouses

/**
 * Toujours des copies via getMenuLayout : aucun partage d’objet avec d’autres menus.
 * @param {object} options - ex. { familyNameLayout: true }
 * @param {'sync'|'async'} variant
 */
function resolveLinkLayoutConstants(options, variant) {
    const baseKey = variant === 'async' ? 'linkAsync' : 'linkSync';
    const out = getMenuLayout(baseKey);
    if (options && options.familyNameLayout) {
        Object.assign(out, getMenuLayout('family'));
    }
    return out;
}

// Helper function to process a single generation (extracted for async processing)
// New approach: Each generation can spread up to 3x the width of the generation above
function processGeneration(
    level, nodes, nodesByGeneration, childToParents, personToCoupleGroup, parentToChildren,
    coupleGroups, baseGenerationY, positions, generationYRange,
    ROW_SPACING_WITHIN_GENERATION, GENERATION_SPACING, DIVIDED_GENERATION_ROW_SPACING, GENERATION_DIVISIONS, HORIZONTAL_SPACING,
    MIN_COUPLE_GAP, MIN_COUPLE_SPACING, MIN_INDIVIDUAL_GAP, MIN_INDIVIDUAL_SPACING, MAX_ROW_WIDTH, MAX_LINE_LENGTH, nodeYPositions,
    isFirstGeneration, parentPositions, generationIndex, previousGenerationWidth
) {
    const nodeIds = nodesByGeneration.get(level) || [];
    
    // SIMPLIFIED GROUPING: Create a flat list of items to position
    // Each item is either: a couple, a sibling group, or a single person
    
    // Step 1: Identify all couples
    const couples = new Map();
    const nodeToCouple = new Map();
    nodeIds.forEach(nodeId => {
        const coupleGroup = personToCoupleGroup.get(nodeId);
        if (coupleGroup !== undefined) {
            if (!couples.has(coupleGroup)) {
                couples.set(coupleGroup, []);
            }
            couples.get(coupleGroup).push(nodeId);
            nodeToCouple.set(nodeId, coupleGroup);
        }
    });
    
    // Step 2: Identify sibling groups (children with same parents)
    const siblingGroups = new Map();
    const nodeToSiblingGroup = new Map();
    nodeIds.forEach(nodeId => {
        const parents = childToParents.get(nodeId) || [];
        if (parents.length > 0) {
            const parentKey = parents.sort().join('_');
            if (!siblingGroups.has(parentKey)) {
                siblingGroups.set(parentKey, []);
            }
            siblingGroups.get(parentKey).push(nodeId);
            nodeToSiblingGroup.set(nodeId, parentKey);
        }
    });
    
    // Step 3: Create positioning items
    // Priority: Couples stay together, siblings stay together
    const items = [];
    const processedNodes = new Set();
    
    // First: Process sibling groups (including their spouses if in couples)
    siblingGroups.forEach((siblingIds, parentKey) => {
        // For each sibling, check if they're in a couple
        const siblingItems = [];
        siblingIds.forEach(siblingId => {
            const coupleGroup = nodeToCouple.get(siblingId);
            if (coupleGroup) {
                // This sibling is in a couple - add the whole couple
                const coupleMembers = couples.get(coupleGroup);
                if (!processedNodes.has(siblingId)) {
                    siblingItems.push({ type: 'couple', members: [...coupleMembers] });
                    coupleMembers.forEach(id => processedNodes.add(id));
                }
            } else {
                // Single sibling
                if (!processedNodes.has(siblingId)) {
                    siblingItems.push({ type: 'single', members: [siblingId] });
                    processedNodes.add(siblingId);
                }
            }
        });
        
        if (siblingItems.length > 0) {
            items.push({ type: 'sibling-group', items: siblingItems });
        }
    });
    
    // Second: Add remaining couples (not part of sibling groups)
    couples.forEach((memberIds, coupleGroup) => {
        if (!memberIds.every(id => processedNodes.has(id))) {
            items.push({ type: 'couple', members: [...memberIds] });
            memberIds.forEach(id => processedNodes.add(id));
        }
    });
    
    // Third: Add remaining singles
    nodeIds.forEach(nodeId => {
        if (!processedNodes.has(nodeId)) {
            items.push({ type: 'single', members: [nodeId] });
            processedNodes.add(nodeId);
        }
    });
    
    // Check if this generation should be divided into multiple rows
    const numDivisions = GENERATION_DIVISIONS.get(level) || 1;
    
    // Helper function to count individuals in an item
    const countIndividualsInItem = (item) => {
        if (item.type === 'sibling-group') {
            let count = 0;
            item.items.forEach(subItem => {
                count += subItem.members.length;
            });
            return count;
        } else {
            return item.members.length;
        }
    };
    
    // If generation is divided, split items into groups based on number of individuals
    let itemGroups = [];
    if (numDivisions > 1 && items.length > 0) {
        // Count total individuals
        const totalIndividuals = items.reduce((sum, item) => sum + countIndividualsInItem(item), 0);
        const targetIndividualsPerRow = Math.ceil(totalIndividuals / numDivisions);
        
        // Distribute items to rows, trying to balance the number of individuals per row
        let currentRow = [];
        let currentRowIndividualCount = 0;
        
        items.forEach(item => {
            const itemIndividualCount = countIndividualsInItem(item);
            
            // Check if adding this item would exceed the target (and we're not on the last row)
            const wouldExceed = currentRowIndividualCount + itemIndividualCount > targetIndividualsPerRow;
            const isLastRow = itemGroups.length === numDivisions - 1;
            
            if (wouldExceed && currentRow.length > 0 && !isLastRow) {
                // Start a new row
                itemGroups.push(currentRow);
                currentRow = [item];
                currentRowIndividualCount = itemIndividualCount;
            } else {
                // Add to current row
                currentRow.push(item);
                currentRowIndividualCount += itemIndividualCount;
            }
        });
        
        // Add the last row
        if (currentRow.length > 0) {
            itemGroups.push(currentRow);
        }
        
        // Ensure we have exactly numDivisions rows (in case we ended up with fewer)
        while (itemGroups.length < numDivisions && itemGroups.length > 0) {
            // Split the last row if it's too large
            const lastRow = itemGroups[itemGroups.length - 1];
            if (lastRow.length > 1) {
                const midPoint = Math.ceil(lastRow.length / 2);
                itemGroups[itemGroups.length - 1] = lastRow.slice(0, midPoint);
                itemGroups.push(lastRow.slice(midPoint));
            } else {
                break; // Can't split further
            }
        }
    } else {
        // Single row: all items in one group
        itemGroups = [items];
    }
    
    // Process each row group
    const allPositionedInGeneration = [];
    const baseY = baseGenerationY.get(level);
    
    itemGroups.forEach((groupItems, rowIndex) => {
        // Calculate Y position for this row
        let targetY = baseY;
        if (numDivisions > 1) {
            // For divided generations, each row is spaced by DIVIDED_GENERATION_ROW_SPACING
            targetY = baseY + (rowIndex * DIVIDED_GENERATION_ROW_SPACING);
        }
        
        // Collect all node IDs in this row group
        const rowNodeIds = [];
        groupItems.forEach(item => {
            if (item.type === 'sibling-group') {
                item.items.forEach(subItem => {
                    rowNodeIds.push(...subItem.members);
                });
            } else {
                rowNodeIds.push(...item.members);
            }
        });
        
        // Calculate Y based on parents (for first row only, or if not divided)
        if (rowIndex === 0 || numDivisions === 1) {
            let parentYSum = 0;
            let parentCount = 0;
            rowNodeIds.forEach(nodeId => {
                const parents = childToParents.get(nodeId) || [];
                parents.forEach(parentId => {
                    if (nodeYPositions.has(parentId)) {
                        parentYSum += nodeYPositions.get(parentId);
                        parentCount++;
                    }
                });
            });
            
            if (parentCount > 0) {
                const parentAvgY = parentYSum / parentCount;
                targetY = Math.max(targetY, parentAvgY + GENERATION_SPACING);
            }
        }
        
        // Position all nodes in this row left to right
        let currentX = 0;
        
        groupItems.forEach(item => {
        if (item.type === 'sibling-group') {
            // Process siblings: position each sibling (and their spouse if in couple) together
            item.items.forEach((subItem, subIdx) => {
                if (subItem.type === 'couple') {
                    // Position couple members with MIN_COUPLE_SPACING
                    subItem.members.forEach((memberId, memberIdx) => {
                        positions[memberId] = { x: currentX + (memberIdx * MIN_COUPLE_SPACING), y: targetY };
                        nodeYPositions.set(memberId, targetY);
                    });
                    const lastMemberX = currentX + ((subItem.members.length - 1) * MIN_COUPLE_SPACING);
                    // Next item starts after this couple with MIN_INDIVIDUAL_SPACING
                    // Always use MIN_INDIVIDUAL_SPACING for consistent spacing
                    currentX = lastMemberX + MIN_INDIVIDUAL_SPACING;
                } else {
                    // Single sibling
                    positions[subItem.members[0]] = { x: currentX, y: targetY };
                    nodeYPositions.set(subItem.members[0], targetY);
                    // Next item starts with MIN_INDIVIDUAL_SPACING
                    currentX += MIN_INDIVIDUAL_SPACING;
                }
            });
        } else if (item.type === 'couple') {
            // Position couple members with MIN_COUPLE_SPACING
            item.members.forEach((memberId, memberIdx) => {
                positions[memberId] = { x: currentX + (memberIdx * MIN_COUPLE_SPACING), y: targetY };
                nodeYPositions.set(memberId, targetY);
            });
            const lastMemberX = currentX + ((item.members.length - 1) * MIN_COUPLE_SPACING);
            // Next item starts after this couple with MIN_INDIVIDUAL_SPACING
            currentX = lastMemberX + MIN_INDIVIDUAL_SPACING;
        } else {
            // Single person
            positions[item.members[0]] = { x: currentX, y: targetY };
            nodeYPositions.set(item.members[0], targetY);
            // Next item starts with MIN_INDIVIDUAL_SPACING
            currentX += MIN_INDIVIDUAL_SPACING;
        }
        });
        
        // Add all nodes from this row to the generation list
        allPositionedInGeneration.push(...rowNodeIds);
        
        // OVERLAP PREVENTION for this row: Sort by X and ensure proper spacing
        const sortedRowNodes = [...rowNodeIds].sort((a, b) => positions[a].x - positions[b].x);
        
        // Track couples for this row
        const nodeToCoupleGroup = new Map();
        couples.forEach((coupleMembers, coupleGroup) => {
            coupleMembers.forEach(memberId => {
                if (rowNodeIds.includes(memberId)) {
                    nodeToCoupleGroup.set(memberId, coupleGroup);
                }
            });
        });
        
        // Simple left-to-right pass: ensure each node is properly spaced from previous
        for (let i = 0; i < sortedRowNodes.length - 1; i++) {
            const node1Id = sortedRowNodes[i];
            const node2Id = sortedRowNodes[i + 1];
            
            const node1X = positions[node1Id].x;
            const node2X = positions[node2Id].x;
            
            const node1Right = node1X + CONFIG.nodeWidth / 2;
            const node2Left = node2X - CONFIG.nodeWidth / 2;
            const gap = node2Left - node1Right;
            
            const coupleGroup1 = nodeToCoupleGroup.get(node1Id);
            const coupleGroup2 = nodeToCoupleGroup.get(node2Id);
            const sameCouple = coupleGroup1 && coupleGroup2 && coupleGroup1 === coupleGroup2;
            const requiredGap = sameCouple ? MIN_COUPLE_GAP : MIN_INDIVIDUAL_GAP;
            
            if (gap < requiredGap) {
                const offset = requiredGap - gap;
                positions[node2Id].x += offset;
                
                // Move entire couple if needed
                if (coupleGroup2) {
                    const coupleMembers = couples.get(coupleGroup2);
                    coupleMembers.forEach(memberId => {
                        if (memberId !== node2Id && rowNodeIds.includes(memberId)) {
                            positions[memberId].x += offset;
                        }
                    });
                }
            }
        }
    });
    
    if (allPositionedInGeneration.length > 0) {
        // For first generation: center it at x=0
        if (isFirstGeneration) {
            // Calculate total width and center
            const minX = Math.min(...allPositionedInGeneration.map(id => positions[id].x));
            const maxX = Math.max(...allPositionedInGeneration.map(id => positions[id].x));
            const centerX = (minX + maxX) / 2;
            
            // Shift all nodes to center at x=0
            allPositionedInGeneration.forEach(nodeId => {
                positions[nodeId].x -= centerX;
            });
            
            generationYRange.set(level, {
                min: minX - centerX,
                max: maxX - centerX
            });
        } else {
            // For subsequent generations: keep current positions (they're already positioned relative to parents)
            // Just apply overlap prevention
            const minX = Math.min(...allPositionedInGeneration.map(id => positions[id].x));
            const maxX = Math.max(...allPositionedInGeneration.map(id => positions[id].x));
            
            generationYRange.set(level, {
                min: minX,
                max: maxX
            });
        }
    }
}

// Async version that processes generations in chunks with progress updates
async function calculateLinkPositionsAsync(nodes, coupleGroups, personToCoupleGroup, parentPairToChildren, onProgress, options = {}) {
    const positions = {};
    const generationYRange = new Map();
    const generationYears = new Map();
    const generationNumbers = new Set();
    
    // Build child-to-parents mapping
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
    
    // Build parent-to-children mapping (for positioning children close to parents)
    const parentToChildren = new Map();
    parentPairToChildren.forEach((family) => {
        family.parents.forEach(parentId => {
            if (!parentToChildren.has(parentId)) {
                parentToChildren.set(parentId, []);
            }
            family.children.forEach(childId => {
                if (!parentToChildren.get(parentId).includes(childId)) {
                    parentToChildren.get(parentId).push(childId);
                }
            });
        });
    });
    
    // Group all nodes by generation level
    const nodesByGeneration = new Map();
    const allNodeIds = nodes.getIds();
    
    allNodeIds.forEach(nodeId => {
        const node = nodes.get(nodeId);
        if (node) {
            // Ensure all nodes have a valid level (default to 0 if missing or invalid)
            let level = node.level;
            if (level === undefined || level === null || typeof level !== 'number' || isNaN(level)) {
                level = 0;
                node.level = 0; // Update the node to have a valid level
            }
            
            generationNumbers.add(level);
            
            if (!nodesByGeneration.has(level)) {
                nodesByGeneration.set(level, []);
            }
            nodesByGeneration.get(level).push(nodeId);
            
            // Track birth years for generation labels
            if (node.data && node.data.birthDate) {
                const year = parseInt(node.data.birthDate.split('-')[0]);
                if (!isNaN(year)) {
                    if (!generationYears.has(level)) {
                        generationYears.set(level, { min: year, max: year });
                    } else {
                        const range = generationYears.get(level);
                        range.min = Math.min(range.min, year);
                        range.max = Math.max(range.max, year);
                    }
                }
            }
        }
    });
    
    // Normalize levels to start at 0 (shift all levels so minimum is 0)
    // This prevents negative levels or levels that start too high, which would place nodes above the first generation
    const sortedLevels = Array.from(generationNumbers).sort((a, b) => a - b);
    const minLevel = sortedLevels.length > 0 ? sortedLevels[0] : 0;
    const levelOffset = minLevel < 0 ? -minLevel : 0; // Offset to make minimum level = 0
    
    // If we need to normalize, update all nodes and rebuild the maps
    if (levelOffset > 0) {
        const normalizedNodesByGeneration = new Map();
        const normalizedGenerationNumbers = new Set();
        const normalizedGenerationYears = new Map();
        
        nodesByGeneration.forEach((nodeIds, originalLevel) => {
            const normalizedLevel = originalLevel + levelOffset;
            normalizedGenerationNumbers.add(normalizedLevel);
            normalizedNodesByGeneration.set(normalizedLevel, nodeIds);
            
            // Update node levels
            nodeIds.forEach(nodeId => {
                const node = nodes.get(nodeId);
                if (node) {
                    node.level = normalizedLevel;
                }
            });
            
            // Copy generation years
            if (generationYears.has(originalLevel)) {
                normalizedGenerationYears.set(normalizedLevel, generationYears.get(originalLevel));
            }
        });
        
        // Replace maps with normalized versions
        nodesByGeneration.clear();
        normalizedNodesByGeneration.forEach((nodeIds, level) => {
            nodesByGeneration.set(level, nodeIds);
        });
        generationNumbers.clear();
        normalizedGenerationNumbers.forEach(level => generationNumbers.add(level));
        generationYears.clear();
        normalizedGenerationYears.forEach((years, level) => {
            generationYears.set(level, years);
        });
    }
    
    // Sort generations from oldest (lowest number) to newest (highest number)
    const sortedGenerations = Array.from(generationNumbers).sort((a, b) => a - b);
    
    const LC = resolveLinkLayoutConstants(options, 'async');
    const ROW_SPACING_WITHIN_GENERATION = LC.rowSpacingWithinGeneration;
    const GENERATION_SPACING = LC.generationSpacing;
    const DIVIDED_GENERATION_ROW_SPACING = LC.dividedGenerationRowSpacing;
    const HORIZONTAL_SPACING = LC.horizontalSpacing;
    const MIN_COUPLE_GAP = LC.minCoupleGap;
    const MIN_COUPLE_SPACING = CONFIG.nodeWidth + MIN_COUPLE_GAP;
    const MIN_INDIVIDUAL_GAP = LC.minIndividualGap;
    const MIN_INDIVIDUAL_SPACING = CONFIG.nodeWidth + MIN_INDIVIDUAL_GAP;
    const MAX_ROW_WIDTH = CONFIG.maxRowWidth;
    const MAX_LINE_LENGTH = LC.maxLineLength;
    
    // Mapping of generation numbers to number of divisions (rows)
    // Generations not in this map will use 1 row (no division)
    const GENERATION_DIVISIONS = new Map([
        [3, 2],   // Generation 3: divide by 2
        [4, 3],   // Generation 4: divide by 3
        [5, 3],   // Generation 5: divide by 3
        [6, 4],   // Generation 6: divide by 4
        [7, 3],   // Generation 7: divide by 3
        [8, 3],   // Generation 8: divide by 3
        [9, 2],   // Generation 9: divide by 2
        [10, 3],  // Generation 10: divide by 3
        [11, 4],  // Generation 11: divide by 4
        [12, 6],  // Generation 12: divide by 6
        [13, 6],  // Generation 13: divide by 6
        [14, 8],  // Generation 14: divide by 8
        [15, 5],  // Generation 15: divide by 5
        [16, 2],  // Generation 16: divide by 2
        [17, 1]   // Generation 17: divide by 1
    ]);
    
    // Track Y positions
    const nodeYPositions = new Map();
    
    // First pass: Calculate base Y positions for each generation
    // Account for divided generations (multiple rows)
    const baseGenerationY = new Map();
    let currentBaseY = 0;
    
    sortedGenerations.forEach((level, index) => {
        if (index > 0) {
            currentBaseY += GENERATION_SPACING;
        }
        baseGenerationY.set(level, currentBaseY);
        
        // Calculate how much vertical space this generation needs
        const numDivisions = GENERATION_DIVISIONS.get(level) || 1;
        if (numDivisions > 1) {
            // For divided generations, add space for (numDivisions - 1) additional rows
            currentBaseY += (numDivisions - 1) * DIVIDED_GENERATION_ROW_SPACING;
        } else {
            // For non-divided generations, use standard spacing
            currentBaseY += ROW_SPACING_WITHIN_GENERATION;
        }
    });
    
    // Process generations one at a time with progress updates
    const totalGenerations = sortedGenerations.length;
    let previousGenerationWidth = null;
    
    for (let genIndex = 0; genIndex < sortedGenerations.length; genIndex++) {
        const level = sortedGenerations[genIndex];
        const isFirstGeneration = genIndex === 0;
        
        // Update progress BEFORE processing (so user sees it immediately)
        // Use a more gradual progression that accounts for processing time
        // Earlier generations are typically faster, later ones take more time
        if (onProgress) {
            // Use a non-linear progression that better reflects actual processing time
            // The first 50% of generations should only account for ~20% of progress
            // The last 50% should account for ~80% of progress (they have more individuals)
            let progress;
            if (genIndex < totalGenerations / 2) {
                // First half: slower progression (20% of total progress)
                const firstHalfProgress = (genIndex / (totalGenerations / 2)) * 20;
                progress = Math.round(firstHalfProgress);
            } else {
                // Second half: faster progression (80% of total progress)
                const secondHalfIndex = genIndex - (totalGenerations / 2);
                const secondHalfProgress = 20 + ((secondHalfIndex / (totalGenerations / 2)) * 80);
                progress = Math.min(Math.round(secondHalfProgress), 100);
            }
            onProgress(progress, `Processing generation ${genIndex + 1} of ${totalGenerations}...`);
        }
        
        // Yield control BEFORE processing to ensure UI updates
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Get parent positions for this generation (from previous generation)
        const parentPositions = {};
        if (!isFirstGeneration) {
            const prevLevel = sortedGenerations[genIndex - 1];
            const prevNodeIds = nodesByGeneration.get(prevLevel) || [];
            prevNodeIds.forEach(nodeId => {
                if (positions[nodeId]) {
                    parentPositions[nodeId] = positions[nodeId];
                }
            });
        }
        
        // Process this generation (this is the heavy part)
        processGeneration(
            level,
            nodes,
            nodesByGeneration,
            childToParents,
            personToCoupleGroup,
            parentToChildren,
            coupleGroups,
            baseGenerationY,
            positions,
            generationYRange,
            ROW_SPACING_WITHIN_GENERATION,
            GENERATION_SPACING,
            DIVIDED_GENERATION_ROW_SPACING,
            GENERATION_DIVISIONS,
            HORIZONTAL_SPACING,
            MIN_COUPLE_GAP,
            MIN_COUPLE_SPACING,
            MIN_INDIVIDUAL_GAP,
            MIN_INDIVIDUAL_SPACING,
            MAX_ROW_WIDTH,
            MAX_LINE_LENGTH,
            nodeYPositions,
            isFirstGeneration,
            parentPositions,
            genIndex,
            previousGenerationWidth
        );
        
        // Calculate width of this generation for next iteration
        const genRange = generationYRange.get(level);
        if (genRange) {
            previousGenerationWidth = genRange.max - genRange.min;
        }
        
        // Yield control to browser after each generation
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    return { positions, generationYRange, generationYears, generationNumbers };
}

// Synchronous version for backward compatibility (processes all at once)
// options.familyNameLayout: wider horizontal gaps between people (Family name menu)
function calculateLinkPositions(nodes, coupleGroups, personToCoupleGroup, parentPairToChildren, options = {}) {
    const positions = {};
    const generationYRange = new Map();
    const generationYears = new Map();
    const generationNumbers = new Set();
    
    // Build child-to-parents mapping
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
    
    // Build parent-to-children mapping (for positioning children close to parents)
    const parentToChildren = new Map();
    parentPairToChildren.forEach((family) => {
        family.parents.forEach(parentId => {
            if (!parentToChildren.has(parentId)) {
                parentToChildren.set(parentId, []);
            }
            family.children.forEach(childId => {
                if (!parentToChildren.get(parentId).includes(childId)) {
                    parentToChildren.get(parentId).push(childId);
                }
            });
        });
    });
    
    // Group all nodes by generation level
    const nodesByGeneration = new Map();
    const allNodeIds = nodes.getIds();
    
    allNodeIds.forEach(nodeId => {
        const node = nodes.get(nodeId);
        if (node) {
            // Ensure all nodes have a valid level (default to 0 if missing or invalid)
            let level = node.level;
            if (level === undefined || level === null || typeof level !== 'number' || isNaN(level)) {
                level = 0;
                node.level = 0; // Update the node to have a valid level
            }
            
            generationNumbers.add(level);
            
            if (!nodesByGeneration.has(level)) {
                nodesByGeneration.set(level, []);
            }
            nodesByGeneration.get(level).push(nodeId);
            
            // Track birth years for generation labels
            if (node.data && node.data.birthDate) {
                const year = parseInt(node.data.birthDate.split('-')[0]);
                if (!isNaN(year)) {
                    if (!generationYears.has(level)) {
                        generationYears.set(level, { min: year, max: year });
                    } else {
                        const range = generationYears.get(level);
                        range.min = Math.min(range.min, year);
                        range.max = Math.max(range.max, year);
                    }
                }
            }
        }
    });
    
    // Sort generations from oldest (lowest number) to newest (highest number)
    const sortedGenerations = Array.from(generationNumbers).sort((a, b) => a - b);
    
    const LC = resolveLinkLayoutConstants(options, 'sync');
    const ROW_SPACING_WITHIN_GENERATION = LC.rowSpacingWithinGeneration;
    const GENERATION_SPACING = LC.generationSpacing;
    const DIVIDED_GENERATION_ROW_SPACING = LC.dividedGenerationRowSpacing;
    const HORIZONTAL_SPACING = LC.horizontalSpacing;
    const MIN_COUPLE_GAP = LC.minCoupleGap;
    const MIN_COUPLE_SPACING = CONFIG.nodeWidth + MIN_COUPLE_GAP;
    const MIN_INDIVIDUAL_GAP = LC.minIndividualGap;
    const MIN_INDIVIDUAL_SPACING = CONFIG.nodeWidth + MIN_INDIVIDUAL_GAP;
    const MAX_ROW_WIDTH = CONFIG.maxRowWidth;
    const MAX_LINE_LENGTH = LC.maxLineLength;
    
    // Mapping of generation numbers to number of divisions (rows)
    // Generations not in this map will use 1 row (no division)
    const GENERATION_DIVISIONS = new Map([
        [3, 2],   // Generation 3: divide by 2
        [4, 3],   // Generation 4: divide by 3
        [5, 3],   // Generation 5: divide by 3
        [6, 4],   // Generation 6: divide by 4
        [7, 3],   // Generation 7: divide by 3
        [8, 3],   // Generation 8: divide by 3
        [9, 2],   // Generation 9: divide by 2
        [10, 2],  // Generation 10: divide by 3
        [11, 4],  // Generation 11: divide by 4
        [12, 6],  // Generation 12: divide by 6
        [13, 6],  // Generation 13: divide by 6
        [14, 8],  // Generation 14: divide by 8
        [15, 5],  // Generation 15: divide by 5
        [16, 2],  // Generation 16: divide by 2
        [17, 1]   // Generation 17: divide by 1
    ]);
    
    // Track Y positions - we'll calculate dynamically based on parent positions
    const nodeYPositions = new Map(); // nodeId -> y position
    
    // First pass: Calculate base Y positions for each generation
    // Account for divided generations (multiple rows)
    const baseGenerationY = new Map();
    let currentBaseY = 0;
    
    sortedGenerations.forEach((level, index) => {
        if (index > 0) {
            // Add spacing between generations
            currentBaseY += GENERATION_SPACING;
        }
        baseGenerationY.set(level, currentBaseY);
        
        // Calculate how much vertical space this generation needs
        const numDivisions = GENERATION_DIVISIONS.get(level) || 1;
        if (numDivisions > 1) {
            // For divided generations, add space for (numDivisions - 1) additional rows
            currentBaseY += (numDivisions - 1) * DIVIDED_GENERATION_ROW_SPACING;
        } else {
            // For non-divided generations, use standard spacing
            currentBaseY += ROW_SPACING_WITHIN_GENERATION;
        }
    });
    
    // Position nodes generation by generation, from oldest to newest
    sortedGenerations.forEach(level => {
        const nodeIds = nodesByGeneration.get(level) || [];
        
        // First, group siblings together (children who share the same parents)
        const siblingGroups = new Map(); // parentKey -> [childIds]
        const nodeToSiblingGroup = new Map(); // nodeId -> parentKey
        
        nodeIds.forEach(nodeId => {
            const parents = childToParents.get(nodeId) || [];
            if (parents.length > 0) {
                // Create a key from sorted parent IDs
                const parentKey = parents.sort().join('_');
                if (!siblingGroups.has(parentKey)) {
                    siblingGroups.set(parentKey, []);
                }
                siblingGroups.get(parentKey).push(nodeId);
                nodeToSiblingGroup.set(nodeId, parentKey);
            }
        });
        
        // Group nodes by couples and singles (within sibling groups)
        const couples = new Map();
        const singles = [];
        
        nodeIds.forEach(nodeId => {
            // Check if this node is part of a sibling group
            const siblingGroupKey = nodeToSiblingGroup.get(nodeId);
            const coupleGroup = personToCoupleGroup.get(nodeId);
            
            if (coupleGroup !== undefined) {
                if (!couples.has(coupleGroup)) {
                    couples.set(coupleGroup, []);
                }
                couples.get(coupleGroup).push(nodeId);
            } else if (!siblingGroupKey) {
                // Only add to singles if not part of a sibling group
                singles.push(nodeId);
            }
        });
        
        // Create groups: siblings first (ALL siblings together, even if in couples), then couples, then singles
        const groups = [];
        const processedNodes = new Set();
        const siblingGroupMap = new Map(); // nodeId -> sibling group object
        
        // Add ALL sibling groups together (siblings stay together regardless of couple status)
        siblingGroups.forEach((siblingIds, parentKey) => {
            if (siblingIds.length > 1) {
                // Multiple siblings - group them ALL together
                const siblingGroup = { type: 'siblings', members: siblingIds.sort() };
                groups.push(siblingGroup);
                siblingIds.forEach(id => {
                    processedNodes.add(id);
                    siblingGroupMap.set(id, siblingGroup);
                });
            } else if (siblingIds.length === 1) {
                // Single sibling - check if in couple
                const nodeId = siblingIds[0];
                const coupleGroup = personToCoupleGroup.get(nodeId);
                if (coupleGroup !== undefined && couples.has(coupleGroup)) {
                    // Will be handled as couple, but mark as processed
                    processedNodes.add(nodeId);
                } else {
                    // Single sibling not in couple
                    groups.push({ type: 'single', members: [nodeId] });
                    processedNodes.add(nodeId);
                }
            }
        });
        
        // Add couples (spouses stay together)
        // But if both spouses are siblings, they're already in a sibling group
        couples.forEach((memberIds) => {
            // Check if all members are already in sibling groups
            const allInSiblingGroups = memberIds.every(id => siblingGroupMap.has(id));
            if (!allInSiblingGroups) {
                // Not all members are siblings, so add as separate couple
                groups.push({ type: 'couple', members: memberIds.sort() });
                memberIds.forEach(id => processedNodes.add(id));
            }
            // If all members are in sibling groups, they're already grouped together
        });
        
        // Add remaining singles (not in sibling groups or couples)
        singles.forEach(nodeId => {
            if (!processedNodes.has(nodeId)) {
                groups.push({ type: 'single', members: [nodeId] });
                processedNodes.add(nodeId);
            }
        });
        
        // Group all items into rows based on maximum row width
        // CRITICAL RULE: Siblings MUST ALWAYS be on the same row - never split sibling groups
        // IMPORTANT: Never split couples across rows - spouses must stay together
        // If a sibling group is too large, it gets its own row (even if it exceeds MAX_ROW_WIDTH)
        
        // First, calculate width for each group
        const groupWidths = new Map(); // group -> width
        groups.forEach(group => {
            let groupWidth = 0;
            
            if (group.type === 'siblings') {
                // For sibling groups, calculate width based on actual positioning:
                // Each sibling is positioned with their spouse(s) next to them
                // Spacing between sibling and spouse: MIN_COUPLE_SPACING
                // Spacing between different sibling couples: HORIZONTAL_SPACING
                group.members.forEach((memberId, idx) => {
                    const coupleGroup = personToCoupleGroup.get(memberId);
                    if (coupleGroup !== undefined && couples.has(coupleGroup)) {
                        const coupleMembers = couples.get(coupleGroup);
                        // Width for this sibling + spouse(s): nodeWidth + (spouseCount * MIN_COUPLE_SPACING)
                        const spouseCount = coupleMembers.length - 1;
                        groupWidth += CONFIG.nodeWidth + (spouseCount * MIN_COUPLE_SPACING);
                    } else {
                        // Single sibling (no spouse)
                        groupWidth += CONFIG.nodeWidth;
                    }
                    // Add spacing between sibling couples (but not after the last one)
                    if (idx < group.members.length - 1) {
                        groupWidth += HORIZONTAL_SPACING;
                    }
                });
                // Add spacing after the entire sibling group
                groupWidth += HORIZONTAL_SPACING;
            } else if (group.type === 'couple') {
                // Width for couple: all members side by side
                const nodeCount = group.members.length;
                groupWidth = (nodeCount * CONFIG.nodeWidth) + ((nodeCount - 1) * MIN_COUPLE_SPACING) + HORIZONTAL_SPACING;
            } else {
                // Single person
                groupWidth = CONFIG.nodeWidth + HORIZONTAL_SPACING;
            }
            
            groupWidths.set(group, groupWidth);
        });
        
        // Now assign groups to rows
        // Check if this generation should be divided into multiple rows
        const numDivisions = GENERATION_DIVISIONS.get(level) || 1;
        
        // Helper function to count individuals in a group
        const countIndividualsInGroup = (group) => {
            return group.members.length;
        };
        
        const rows = [];
        if (numDivisions > 1 && groups.length > 0) {
            // Count total individuals
            const totalIndividuals = groups.reduce((sum, group) => sum + countIndividualsInGroup(group), 0);
            const targetIndividualsPerRow = Math.ceil(totalIndividuals / numDivisions);
            
            // Distribute groups to rows, trying to balance the number of individuals per row
            let currentRow = [];
            let currentRowIndividualCount = 0;
            
            groups.forEach(group => {
                const groupIndividualCount = countIndividualsInGroup(group);
                
                // Check if adding this group would exceed the target (and we're not on the last row)
                const wouldExceed = currentRowIndividualCount + groupIndividualCount > targetIndividualsPerRow;
                const isLastRow = rows.length === numDivisions - 1;
                
                if (wouldExceed && currentRow.length > 0 && !isLastRow) {
                    // Start a new row
                    rows.push(currentRow);
                    currentRow = [group];
                    currentRowIndividualCount = groupIndividualCount;
                } else {
                    // Add to current row
                    currentRow.push(group);
                    currentRowIndividualCount += groupIndividualCount;
                }
            });
            
            // Add the last row
            if (currentRow.length > 0) {
                rows.push(currentRow);
            }
            
            // Ensure we have exactly numDivisions rows (in case we ended up with fewer)
            while (rows.length < numDivisions && rows.length > 0) {
                // Split the last row if it's too large
                const lastRow = rows[rows.length - 1];
                if (lastRow.length > 1) {
                    const midPoint = Math.ceil(lastRow.length / 2);
                    rows[rows.length - 1] = lastRow.slice(0, midPoint);
                    rows.push(lastRow.slice(midPoint));
                } else {
                    break; // Can't split further
                }
            }
        } else {
            // Single row: all groups in one row, but still respect MAX_ROW_WIDTH for very long rows
            let currentRow = [];
            let currentRowWidth = 0;
            
            groups.forEach(group => {
                const groupWidth = groupWidths.get(group);
                
                // CRITICAL: If this is a sibling group, it MUST stay together
                // If it doesn't fit in current row, start a new row for it
                if (group.type === 'siblings') {
                    // If current row has other groups and adding siblings would exceed limit, start new row
                    if (currentRow.length > 0 && currentRowWidth + groupWidth > MAX_ROW_WIDTH) {
                        rows.push(currentRow);
                        currentRow = [group];
                        currentRowWidth = groupWidth;
                    } else {
                        // Add siblings to current row (even if it exceeds MAX_ROW_WIDTH - siblings must stay together)
                        currentRow.push(group);
                        currentRowWidth += groupWidth;
                    }
                } else {
                    // For non-sibling groups (couples, singles), try to fit them in current row
                    if (currentRowWidth + groupWidth > MAX_ROW_WIDTH && currentRow.length > 0) {
                        // Start a new row
                        rows.push(currentRow);
                        currentRow = [group];
                        currentRowWidth = groupWidth;
                    } else {
                        // Add to current row
                        currentRow.push(group);
                        currentRowWidth += groupWidth;
                    }
                }
            });
            
            // Add the last row if it has groups
            if (currentRow.length > 0) {
                rows.push(currentRow);
            }
        }
        
        // If no rows were created (shouldn't happen), create one with all groups
        if (rows.length === 0) {
            rows.push(groups);
        }
        
        // Calculate Y positions for each row
        // Try to position children close to their parents
        const rowYPositions = [];
        
        if (rows.length === 1) {
            // Single row - position close to parents if they exist
            let targetY = baseGenerationY.get(level);
            
            // Find parents of nodes in this row
            const rowNodeIds = rows[0].flatMap(group => group.members);
            let parentYSum = 0;
            let parentCount = 0;
            
            rowNodeIds.forEach(nodeId => {
                const parents = childToParents.get(nodeId) || [];
                parents.forEach(parentId => {
                    if (nodeYPositions.has(parentId)) {
                        parentYSum += nodeYPositions.get(parentId);
                        parentCount++;
                    }
                });
            });
            
            if (parentCount > 0) {
                // Position close to parents (just below them with generation spacing)
                // But ensure we're at least at the base generation Y
                const parentAvgY = parentYSum / parentCount;
                targetY = Math.max(baseGenerationY.get(level), parentAvgY + GENERATION_SPACING);
            }
            
            rowYPositions.push(targetY);
        } else {
            // Multiple rows - position each row close to its parents
            // Use DIVIDED_GENERATION_ROW_SPACING if generation is divided, otherwise ROW_SPACING_WITHIN_GENERATION
            const rowSpacing = (numDivisions > 1) ? DIVIDED_GENERATION_ROW_SPACING : ROW_SPACING_WITHIN_GENERATION;
            rows.forEach((row, rowIndex) => {
                const rowNodeIds = row.flatMap(group => group.members);
                let targetY = baseGenerationY.get(level) + (rowIndex * rowSpacing);
                
                // Find parents of nodes in this specific row
                let parentYSum = 0;
                let parentCount = 0;
                
                rowNodeIds.forEach(nodeId => {
                    const parents = childToParents.get(nodeId) || [];
                    parents.forEach(parentId => {
                        if (nodeYPositions.has(parentId)) {
                            parentYSum += nodeYPositions.get(parentId);
                            parentCount++;
                        }
                    });
                });
                
                if (parentCount > 0 && rowIndex === 0) {
                    // For the first row, position close to parents (just below them with generation spacing)
                    const parentAvgY = parentYSum / parentCount;
                    targetY = Math.max(baseGenerationY.get(level), parentAvgY + GENERATION_SPACING);
                } else if (rowIndex > 0) {
                    // For subsequent rows, position relative to previous row with row spacing
                    targetY = rowYPositions[rowIndex - 1] + ROW_SPACING_WITHIN_GENERATION;
                }
                
                rowYPositions.push(targetY);
            });
            
            // Ensure rows don't overlap - adjust if needed
            for (let i = 1; i < rowYPositions.length; i++) {
                const minY = rowYPositions[i - 1] + ROW_SPACING_WITHIN_GENERATION;
                if (rowYPositions[i] < minY) {
                    rowYPositions[i] = minY;
                }
            }
        }
        
        // Position nodes in each row - optimize for shortest, most vertical green lines
        // First, calculate desired X positions based on parent positions
        // Adjust desired positions to respect MAX_LINE_LENGTH constraint
        const desiredXPositions = new Map(); // nodeId -> desired X
        
        rows.forEach((row, rowIndex) => {
            const rowNodeIds = row.flatMap(group => group.members);
            const y = rowYPositions[rowIndex];
            
            // Calculate desired X position for each node based on parent positions
            rowNodeIds.forEach(nodeId => {
                const parents = childToParents.get(nodeId) || [];
                if (parents.length > 0) {
                    // Calculate average X and Y position of parents
                    // PRIORITY: Position child directly below parent(s) for vertical lines
                    let parentXSum = 0;
                    let parentYSum = 0;
                    let parentCount = 0;
                    parents.forEach(parentId => {
                        if (positions[parentId]) {
                            parentXSum += positions[parentId].x;
                            parentYSum += positions[parentId].y;
                            parentCount++;
                        }
                    });
                    if (parentCount > 0) {
                        const parentAvgX = parentXSum / parentCount;
                        const parentAvgY = parentYSum / parentCount;
                        
                        // Set desired X to be exactly the parent's average X for vertical alignment
                        // This ensures green lines are as straight down as possible
                        let desiredX = parentAvgX;
                        
                        // Only adjust if absolutely necessary (if it would create an extremely long line)
                        // But prioritize vertical alignment over line length
                        const deltaY = Math.abs(y - parentAvgY);
                        if (deltaY > 0) {
                            // Calculate the line length if we position directly below parent
                            const lineLength = Math.sqrt(0 + deltaY * deltaY); // deltaX = 0 for vertical line
                            
                            // Only adjust if the vertical line itself would be too long
                            // (This should rarely happen, but handle edge cases)
                            if (lineLength > MAX_LINE_LENGTH * 1.5) {
                                // If even a vertical line would be too long, allow slight horizontal offset
                                // But still keep it as vertical as possible
                                const maxDeltaX = Math.sqrt(Math.max(0, (MAX_LINE_LENGTH * 1.5) * (MAX_LINE_LENGTH * 1.5) - deltaY * deltaY));
                                // Keep desiredX as close to parentAvgX as possible
                                desiredX = parentAvgX; // Still prefer vertical, just document the constraint
                            }
                        }
                        
                        desiredXPositions.set(nodeId, desiredX);
                    }
                }
            });
        });
        
        // Helper function to calculate score for a given arrangement
        // Lower score is better (minimizes line length and keeps connections vertical)
        function calculateArrangementScore(groupOrder, y, rowSiblingGroups, rowCouples) {
            let score = 0;
            let currentX = 0;
            const tempPositions = new Map(); // nodeId -> {x, y}
            
            // Position groups in this order
            groupOrder.forEach(({ group, desiredX }) => {
                const useDesiredX = desiredX !== 0 || desiredXPositions.has(group.members[0]);
                let groupX = currentX;
                
                if (useDesiredX) {
                    if (group.type === 'couple') {
                        // For couples: width = nodeCount * nodeWidth (they touch edge-to-edge)
                        const coupleWidth = group.members.length * CONFIG.nodeWidth;
                        groupX = desiredX - (coupleWidth / 2);
                    } else if (group.type === 'siblings') {
                        let siblingDesiredXSum = 0;
                        let siblingDesiredXCount = 0;
                        group.members.forEach(memberId => {
                            if (desiredXPositions.has(memberId)) {
                                siblingDesiredXSum += desiredXPositions.get(memberId);
                                siblingDesiredXCount++;
                            }
                        });
                        const siblingAvgDesiredX = siblingDesiredXCount > 0 
                            ? siblingDesiredXSum / siblingDesiredXCount 
                            : desiredX;
                        
                        let totalWidth = 0;
                        group.members.forEach((memberId) => {
                            const coupleGroup = personToCoupleGroup.get(memberId);
                            const isInCouple = coupleGroup !== undefined && rowCouples && rowCouples.has(coupleGroup);
                            if (isInCouple) {
                                const coupleMembers = rowCouples.get(coupleGroup);
                                if (coupleMembers && coupleMembers.includes(memberId)) {
                                    totalWidth += (coupleMembers.length - 1) * MIN_COUPLE_SPACING + HORIZONTAL_SPACING;
                                }
                            } else {
                                totalWidth += HORIZONTAL_SPACING;
                            }
                        });
                        groupX = siblingAvgDesiredX - (totalWidth / 2);
                    } else {
                        groupX = desiredXPositions.has(group.members[0]) 
                            ? desiredXPositions.get(group.members[0])
                            : currentX;
                    }
                    
                    // PRIORITY: Respect desiredX for vertical alignment
                    // Only shift if there's a significant overlap (more than half a node width)
                    // This allows some flexibility while maintaining vertical alignment
                    if (groupX < currentX) {
                        const overlap = currentX - groupX;
                        // Only shift if overlap is significant (more than node width)
                        // Otherwise, keep desiredX to maintain vertical alignment
                        if (overlap > CONFIG.nodeWidth) {
                            groupX = currentX;
                        }
                        // For smaller overlaps, keep desiredX - the spacing will handle it
                    }
                }
                
                // Calculate positions for this group
                let groupEndX = groupX;
                group.members.forEach(memberId => {
                    const coupleGroup = personToCoupleGroup.get(memberId);
                    const isInCouple = coupleGroup !== undefined && rowCouples && rowCouples.has(coupleGroup);
                    
                    if (isInCouple) {
                        const coupleMembers = rowCouples.get(coupleGroup);
                        if (coupleMembers && coupleMembers.includes(memberId)) {
                            coupleMembers.forEach((spouseId, idx) => {
                                if (!tempPositions.has(spouseId)) {
                                    tempPositions.set(spouseId, {
                                        x: groupX + (idx * MIN_COUPLE_SPACING),
                                        y: y
                                    });
                                }
                            });
                            groupEndX = groupX + ((coupleMembers.length - 1) * MIN_COUPLE_SPACING + CONFIG.nodeWidth);
                        }
                    } else {
                        tempPositions.set(memberId, { x: groupX, y: y });
                        groupEndX = groupX + HORIZONTAL_SPACING;
                    }
                });
                
                currentX = groupEndX + HORIZONTAL_SPACING;
            });
            
            // Calculate score: sum of squared horizontal distances from children to parents
            // Also penalize siblings being far apart, couples being separated, and lines exceeding max length
            tempPositions.forEach((pos, nodeId) => {
                const parents = childToParents.get(nodeId) || [];
                if (parents.length > 0) {
                    let parentXSum = 0;
                    let parentYSum = 0;
                    let parentCount = 0;
                    parents.forEach(parentId => {
                        if (positions[parentId]) {
                            parentXSum += positions[parentId].x;
                            parentYSum += positions[parentId].y;
                            parentCount++;
                        }
                    });
                    if (parentCount > 0) {
                        const parentAvgX = parentXSum / parentCount;
                        const parentAvgY = parentYSum / parentCount;
                        const horizontalDistance = Math.abs(pos.x - parentAvgX);
                        
                        // Calculate actual line length (Euclidean distance)
                        const deltaX = pos.x - parentAvgX;
                        const deltaY = pos.y - parentAvgY;
                        const lineLength = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                        
                        // HEAVILY penalize horizontal distance - prioritize vertical lines
                        // Use a much stronger penalty to ensure children are positioned directly below parents
                        score += horizontalDistance * horizontalDistance * 50; // Much stronger weight for vertical alignment
                        
                        // Also penalize lines that exceed maximum length (but less than horizontal distance)
                        if (lineLength > MAX_LINE_LENGTH) {
                            const excess = lineLength - MAX_LINE_LENGTH;
                            // Use squared excess with moderate multiplier
                            score += excess * excess * 5;
                        }
                    }
                }
            });
            
            // Penalize siblings being far apart (they should be close together)
            // Use a much stronger penalty to ensure siblings stay together
            if (rowSiblingGroups) {
                rowSiblingGroups.forEach((siblingIds, parentKey) => {
                    if (siblingIds.length > 1) {
                        const siblingPositions = siblingIds
                            .map(id => tempPositions.get(id))
                            .filter(pos => pos !== undefined);
                        
                        if (siblingPositions.length > 1) {
                            const minX = Math.min(...siblingPositions.map(p => p.x));
                            const maxX = Math.max(...siblingPositions.map(p => p.x));
                            const spread = maxX - minX;
                            // Strong penalty for large spreads (siblings MUST be close together)
                            // Use squared spread to heavily penalize separation
                            score += spread * spread * 2; // Much stronger weight to prioritize sibling grouping
                        }
                    }
                });
            }
            
            // Penalize couples being far apart (they should be next to each other)
            if (rowCouples) {
                rowCouples.forEach((memberIds) => {
                    if (memberIds.length > 1) {
                        const couplePositions = memberIds
                            .map(id => tempPositions.get(id))
                            .filter(pos => pos !== undefined);
                        
                        if (couplePositions.length > 1) {
                            const minX = Math.min(...couplePositions.map(p => p.x));
                            const maxX = Math.max(...couplePositions.map(p => p.x));
                            const spread = maxX - minX;
                            // Penalize large spreads (couples should be next to each other)
                            // But allow for couple spacing, so only penalize if spread is too large
                            const expectedCoupleSpacing = (memberIds.length - 1) * MIN_COUPLE_SPACING;
                            if (spread > expectedCoupleSpacing * 1.5) {
                                score += (spread - expectedCoupleSpacing) * 2; // Strong penalty for separated couples
                            }
                        }
                    }
                });
            }
            
            return score;
        }
        
        // Now position nodes, trying different arrangements and choosing the best
        rows.forEach((row, rowIndex) => {
            const y = rowYPositions[rowIndex];
            const positionedInRow = [];
            
            // Calculate desired X for each group
            const groupsWithDesiredX = row.map(group => {
                let desiredXSum = 0;
                let desiredXCount = 0;
                group.members.forEach(memberId => {
                    if (desiredXPositions.has(memberId)) {
                        desiredXSum += desiredXPositions.get(memberId);
                        desiredXCount++;
                    }
                });
                const avgDesiredX = desiredXCount > 0 ? desiredXSum / desiredXCount : 0;
                return { group, desiredX: avgDesiredX };
            });
            
            // Filter sibling groups and couples to only those in this row
            const rowNodeIds = new Set(row.flatMap(group => group.members));
            const rowSiblingGroups = new Map();
            siblingGroups.forEach((siblingIds, parentKey) => {
                const rowSiblings = siblingIds.filter(id => rowNodeIds.has(id));
                if (rowSiblings.length > 0) {
                    rowSiblingGroups.set(parentKey, rowSiblings);
                }
            });
            
            const rowCouples = new Map();
            couples.forEach((memberIds, coupleGroup) => {
                const rowCoupleMembers = memberIds.filter(id => rowNodeIds.has(id));
                if (rowCoupleMembers.length > 0) {
                    rowCouples.set(coupleGroup, rowCoupleMembers);
                }
            });
            
            // Reorder groups to optimize vertical alignment of green lines
            // RULE: Sibling groups must stay together (they're already grouped, but we can reorder the groups themselves)
            // PRIORITY: Find the ordering that minimizes horizontal distances to parents (vertical lines)
            
            // Helper function to generate all permutations
            function permute(arr) {
                if (arr.length <= 1) return [arr];
                const result = [];
                for (let i = 0; i < arr.length; i++) {
                    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
                    const perms = permute(rest);
                    perms.forEach(perm => result.push([arr[i], ...perm]));
                }
                return result;
            }
            
            // Start with ordering by desired X (most logical starting point)
            let bestOrder = [...groupsWithDesiredX].sort((a, b) => a.desiredX - b.desiredX);
            let bestScore = calculateArrangementScore(bestOrder, y, rowSiblingGroups, rowCouples);
            
            // Try all permutations for small groups (up to 6 groups) - exhaustive search
            // This ensures we find the absolute best ordering for vertical alignment
            if (groupsWithDesiredX.length <= 6) {
                const allPerms = permute(groupsWithDesiredX);
                allPerms.forEach(perm => {
                    const score = calculateArrangementScore(perm, y, rowSiblingGroups, rowCouples);
                    if (score < bestScore) {
                        bestOrder = perm;
                        bestScore = score;
                    }
                });
            } else {
                // For larger groups, try multiple strategies:
                
                // 1. Sort by desired X (ascending) - already tried above
                
                // 2. Sort by desired X (descending)
                const sortedDesc = [...groupsWithDesiredX].sort((a, b) => b.desiredX - a.desiredX);
                const scoreDesc = calculateArrangementScore(sortedDesc, y, rowSiblingGroups, rowCouples);
                if (scoreDesc < bestScore) {
                    bestOrder = sortedDesc;
                    bestScore = scoreDesc;
                }
                
                // 3. Try many random permutations (200 for better coverage)
                for (let i = 0; i < 200; i++) {
                    const shuffled = [...groupsWithDesiredX].sort(() => Math.random() - 0.5);
                    const score = calculateArrangementScore(shuffled, y, rowSiblingGroups, rowCouples);
                    if (score < bestScore) {
                        bestOrder = shuffled;
                        bestScore = score;
                    }
                }
                
                // 4. Try strategic ordering: prioritize groups with strong parent connections
                // Calculate how well each group aligns with its parents
                const groupsWithAlignment = groupsWithDesiredX.map(({ group, desiredX }) => {
                    let totalAlignment = 0;
                    let alignmentCount = 0;
                    group.members.forEach(memberId => {
                        const parents = childToParents.get(memberId) || [];
                        if (parents.length > 0) {
                            let parentXSum = 0;
                            let parentCount = 0;
                            parents.forEach(parentId => {
                                if (positions[parentId]) {
                                    parentXSum += positions[parentId].x;
                                    parentCount++;
                                }
                            });
                            if (parentCount > 0) {
                                const parentAvgX = parentXSum / parentCount;
                                // Alignment score: how close desiredX is to parentAvgX (closer = better)
                                const alignment = 1 / (1 + Math.abs(desiredX - parentAvgX));
                                totalAlignment += alignment;
                                alignmentCount++;
                            }
                        }
                    });
                    const avgAlignment = alignmentCount > 0 ? totalAlignment / alignmentCount : 0;
                    return { group, desiredX, alignment: avgAlignment };
                });
                
                // Try ordering by alignment (best aligned first)
                const sortedByAlignment = [...groupsWithAlignment]
                    .sort((a, b) => b.alignment - a.alignment)
                    .map(({ group, desiredX }) => ({ group, desiredX }));
                const scoreByAlignment = calculateArrangementScore(sortedByAlignment, y, rowSiblingGroups, rowCouples);
                if (scoreByAlignment < bestScore) {
                    bestOrder = sortedByAlignment;
                    bestScore = scoreByAlignment;
                }
            }
            
            // Position groups using the best arrangement
            let currentX = 0;
            bestOrder.forEach(({ group, desiredX }, groupIndex) => {
                // If no desired X (no parents), use sequential positioning
                const useDesiredX = desiredX !== 0 || desiredXPositions.has(group.members[0]);
                
                if (!useDesiredX && groupIndex === 0) {
                    // First group with no desired position - start at 0
                    currentX = 0;
                }
                if (group.type === 'couple') {
                    // Position couple members touching each other (edge-to-edge)
                    // For couples: width = nodeCount * nodeWidth
                    const coupleWidth = group.members.length * CONFIG.nodeWidth;
                    let firstX;
                    
                    if (useDesiredX) {
                        firstX = desiredX - (coupleWidth / 2);
                        // Ensure we don't overlap with previous group
                        if (groupIndex > 0 && firstX < currentX) {
                            firstX = currentX;
                        }
                    } else {
                        firstX = currentX;
                    }
                    
                    // Position each spouse touching (center-to-center = nodeWidth)
                    group.members.forEach((memberId, idx) => {
                        const nodeX = firstX + (idx * CONFIG.nodeWidth);
                        positions[memberId] = { 
                            x: nodeX, 
                            y: y 
                        };
                        nodeYPositions.set(memberId, y);
                        positionedInRow.push(memberId);
                    });
                    // Update currentX to the right edge of the last spouse + spacing
                    const lastNodeX = positions[group.members[group.members.length - 1]].x;
                    // Next group's leftmost center must clear this node's right edge + gap
                    currentX = lastNodeX + MIN_INDIVIDUAL_SPACING;
                } else if (group.type === 'siblings') {
                    // Position siblings next to each other, centered on average desired X
                    let siblingDesiredXSum = 0;
                    let siblingDesiredXCount = 0;
                    group.members.forEach(memberId => {
                        if (desiredXPositions.has(memberId)) {
                            siblingDesiredXSum += desiredXPositions.get(memberId);
                            siblingDesiredXCount++;
                        }
                    });
                    const siblingAvgDesiredX = siblingDesiredXCount > 0 
                        ? siblingDesiredXSum / siblingDesiredXCount 
                        : (useDesiredX ? desiredX : currentX);
                    
                    // Calculate total width needed for siblings (including spouses)
                    // First pass: calculate with minimum spacing to estimate total width
                    let totalWidth = 0;
                    const siblingPositions = [];
                    
                    group.members.forEach((memberId) => {
                        const coupleGroup = personToCoupleGroup.get(memberId);
                        const isInCouple = coupleGroup !== undefined && couples.has(coupleGroup);
                        
                        if (isInCouple) {
                            const coupleMembers = couples.get(coupleGroup);
                            if (coupleMembers && coupleMembers.includes(memberId)) {
                                // Use minimum spacing for initial width calculation
                                // For couples: width = nodeCount * nodeWidth (they touch edge-to-edge)
                                const coupleWidth = coupleMembers.length * CONFIG.nodeWidth;
                                totalWidth += coupleWidth + HORIZONTAL_SPACING;
                                siblingPositions.push({ type: 'couple', members: coupleMembers, estimatedWidth: coupleWidth });
                            }
                        } else {
                            totalWidth += CONFIG.nodeWidth + HORIZONTAL_SPACING;
                            siblingPositions.push({ type: 'single', member: memberId });
                        }
                    });
                    
                    // Position siblings starting from left edge, centered on desired X
                    // PRIORITY: Keep siblings centered on parent position for vertical lines
                    let siblingX;
                    if (useDesiredX) {
                        siblingX = siblingAvgDesiredX - (totalWidth / 2);
                        // Only adjust if absolutely necessary to avoid overlap
                        // But prioritize vertical alignment with parents
                        if (groupIndex > 0 && siblingX < currentX) {
                            siblingX = currentX;
                        }
                    } else {
                        siblingX = currentX;
                    }
                    
                    siblingPositions.forEach((siblingPos, siblingIndex) => {
                        if (siblingPos.type === 'couple') {
                            const coupleFirstX = siblingX;
                            const coupleMembers = siblingPos.members;
                            
                            // Position couples touching each other (edge-to-edge)
                            // ALWAYS position ALL couple members together, overwriting any previous positions
                            coupleMembers.forEach((spouseId, idx) => {
                                // For couples: center-to-center = nodeWidth (they touch)
                                const nodeX = coupleFirstX + (idx * CONFIG.nodeWidth);
                                    positions[spouseId] = { 
                                        x: nodeX, 
                                        y: y 
                                    };
                                    nodeYPositions.set(spouseId, y);
                                if (!positionedInRow.includes(spouseId)) {
                                    positionedInRow.push(spouseId);
                                }
                            });
                            // Update siblingX to the right edge of the last spouse + spacing
                            const lastSpouseCenterX = coupleFirstX + ((coupleMembers.length - 1) * CONFIG.nodeWidth);
                            siblingX = lastSpouseCenterX + MIN_INDIVIDUAL_SPACING;
                        } else {
                            positions[siblingPos.member] = { 
                                x: siblingX, 
                                y: y 
                            };
                            nodeYPositions.set(siblingPos.member, y);
                            positionedInRow.push(siblingPos.member);
                            siblingX += MIN_INDIVIDUAL_SPACING;
                        }
                    });
                    currentX = siblingX;
                } else {
                    // Position single person at desired X
                    // PRIORITY: Keep directly below parent for vertical line
                    let singleX;
                    if (useDesiredX && desiredXPositions.has(group.members[0])) {
                        singleX = desiredXPositions.get(group.members[0]);
                        // Only adjust if absolutely necessary to avoid overlap
                        // But prioritize vertical alignment
                        if (groupIndex > 0 && singleX < currentX) {
                            singleX = currentX;
                        }
                    } else {
                        singleX = currentX;
                    }
                    positions[group.members[0]] = { x: singleX, y: y };
                    nodeYPositions.set(group.members[0], y);
                    positionedInRow.push(group.members[0]);
                    currentX = singleX + MIN_INDIVIDUAL_SPACING;
                }
            });
            
            // Optimize row position: Shift entire row left or right to minimize horizontal distances to parents
            // This makes green lines as straight (vertical) as possible
            if (positionedInRow.length > 0) {
                // Calculate the optimal horizontal shift for this row
                // by minimizing the sum of squared horizontal distances from children to their parents
                let optimalShift = 0;
                let minTotalHorizontalDistanceSquared = Infinity;
                
                // Try different shifts (in steps of 50px) to find the optimal position
                // Range: -2000 to +2000 pixels
                for (let shift = -2000; shift <= 2000; shift += 50) {
                    let totalHorizontalDistanceSquared = 0;
                    let validConnections = 0;
                    
                    positionedInRow.forEach(nodeId => {
                        const parents = childToParents.get(nodeId) || [];
                        if (parents.length > 0) {
                            // Calculate average parent X position
                            let parentXSum = 0;
                            let parentCount = 0;
                            parents.forEach(parentId => {
                                if (positions[parentId]) {
                                    parentXSum += positions[parentId].x;
                                    parentCount++;
                                }
                            });
                            
                            if (parentCount > 0) {
                                const parentAvgX = parentXSum / parentCount;
                                const childX = positions[nodeId].x + shift; // Apply shift
                                const horizontalDistance = Math.abs(childX - parentAvgX);
                                totalHorizontalDistanceSquared += horizontalDistance * horizontalDistance;
                                validConnections++;
                            }
                        }
                    });
                    
                    // Use average squared distance for comparison
                    if (validConnections > 0) {
                        const avgDistanceSquared = totalHorizontalDistanceSquared / validConnections;
                        if (avgDistanceSquared < minTotalHorizontalDistanceSquared) {
                            minTotalHorizontalDistanceSquared = avgDistanceSquared;
                            optimalShift = shift;
                        }
                    }
                }
                
                // Apply the optimal shift to all nodes in this row
                if (optimalShift !== 0) {
                    positionedInRow.forEach(id => {
                        positions[id].x += optimalShift;
                    });
                }
                
                // Also ensure the row doesn't extend too far to the left (safety check)
                const minX = Math.min(...positionedInRow.map(id => positions[id].x));
                if (minX < -3000) {
                    const safetyShift = -3000 - minX;
                    positionedInRow.forEach(id => {
                        positions[id].x += safetyShift;
                    });
                }
            }
        });
        
        // Update generation Y range (using X range for horizontal spread)
        const allPositionedInGeneration = [];
        rows.forEach(row => {
            row.forEach(group => {
                allPositionedInGeneration.push(...group.members);
            });
        });
        
        if (allPositionedInGeneration.length > 0) {
            const finalMinX = Math.min(...allPositionedInGeneration.map(id => positions[id].x));
            const finalMaxX = Math.max(...allPositionedInGeneration.map(id => positions[id].x));
            generationYRange.set(level, {
                min: finalMinX,
                max: finalMaxX
            });
        }
    });
    
    return { positions, generationYRange, generationYears, generationNumbers };
}

