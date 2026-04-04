// Network creation and event handlers

function createNetwork(nodes, edges, positions) {
    // Filter nodes to only include those with positions
    const positionedNodeIds = new Set(Object.keys(positions));
    const allNodeIds = Array.from(nodes.getIds());
    const nodesToRemove = allNodeIds.filter(nodeId => !positionedNodeIds.has(nodeId));
    
    if (nodesToRemove.length > 0) {
        nodes.remove(nodesToRemove);
    }
    
    // Filter edges to only include those between positioned nodes
    const allEdges = edges.get();
    const edgesToRemove = allEdges.filter(edge => 
        !positionedNodeIds.has(edge.from) || !positionedNodeIds.has(edge.to)
    );
    if (edgesToRemove.length > 0) {
        edges.remove(edgesToRemove.map(e => e.id));
    }
    
    // Set positions on nodes - preserve all existing properties
    const nodeIds = Array.from(nodes.getIds());
    nodeIds.forEach(nodeId => {
        if (positions[nodeId]) {
            const pos = positions[nodeId];
            const node = nodes.get(nodeId);
            // Create update object with position and preserve all existing properties
            const update = {
                id: nodeId,
                x: pos.x,
                y: pos.y,
                fixed: { x: true, y: true }
            };
            
            // Preserve label if it exists
            if (node.label !== undefined) {
                update.label = node.label;
            }
            
            // Preserve font settings
            if (node.font) {
                update.font = node.font;
            } else {
                update.font = {
                    size: 20,
                    color: '#000000',
                    face: 'Arial',
                    align: 'center'
                };
            }
            
            nodes.update(update);
        }
    });
    
    // Update marriage edges: make them curved if they pass through other nodes
    updateMarriageEdges(edges, positions, nodes);
    
    // Calculate bounding box of all nodes to determine minimum zoom
    const nodePositions = Object.values(positions);
    if (nodePositions.length === 0) {
        return; // No nodes to display
    }
    
    const numNodes = nodePositions.length;
    
    const isLinkMode = AppState.currentMenu === 'link';
    const isFamilyNameMode = AppState.currentMenu === 'family';

    const selectedPersonId = AppState.rootPersonId;
    let hasTwoParents = false;
    if (selectedPersonId && AppState.treeData) {
        const relationships = AppState.treeData.relationships || [];
        const parentCount = relationships.filter(rel => 
            rel.type === 'parent-child' && rel.to === selectedPersonId
        ).length;
        hasTwoParents = parentCount >= 2;
    }
    
    const bbAll = boundsXY(nodePositions);
    const minX = bbAll.minX;
    const maxX = bbAll.maxX;
    const minY = bbAll.minY;
    const maxY = bbAll.maxY;

    const treeWidth = maxX - minX;
    const treeHeight = maxY - minY;
    
    // Get container dimensions
    const container = document.getElementById('tree-container');
    const containerWidth = container.offsetWidth || window.innerWidth;
    const containerHeight = container.offsetHeight || window.innerHeight;
    
    // Calculate minimum scale needed to fit all nodes (with minimal padding)
    const padding = 0.02; // 2% padding on each side
    const scaleX = (containerWidth * (1 - 2 * padding)) / treeWidth;
    const scaleY = (containerHeight * (1 - 2 * padding)) / treeHeight;
    const minScaleToFitAll = Math.min(scaleX, scaleY);
    
    // Allow zooming out much more than needed to fit all nodes (allow 3x more zoom out)
    // This lets users zoom out significantly beyond what's needed to see all ancestors
    const zoomMin = Math.max(0.01, minScaleToFitAll * 0.33);
    
    // Calculate maximum zoom to ensure at least 3 nodes are visible
    let zoomMax = 2.0;
    let zoomEnabled = true;
    
    if (isLinkMode || isFamilyNameMode) {
        // Large / free-layout graphs: allow zoom so nodes stay readable
        zoomMax = 3.0;
        zoomEnabled = true;
    } else if (numNodes < 3 || !hasTwoParents) {
        // If fewer than 3 nodes or selected person doesn't have 2 parents, disable zoom
        zoomEnabled = false;
        zoomMax = zoomMin; // Lock zoom to minimum
    } else {
        // Calculate maximum zoom based on ensuring at least 3 nodes are visible
        // Find the 3 nodes that should be visible: selected person + 2 parents
        const threeNodes = [];
        if (selectedPersonId && positions[selectedPersonId]) {
            threeNodes.push(positions[selectedPersonId]);
            
            // Find parents of selected person
            if (AppState.treeData) {
                const relationships = AppState.treeData.relationships || [];
                const parents = relationships
                    .filter(rel => rel.type === 'parent-child' && rel.to === selectedPersonId)
                    .map(rel => rel.from)
                    .slice(0, 2); // Take first 2 parents
                
                parents.forEach(parentId => {
                    if (positions[parentId]) {
                        threeNodes.push(positions[parentId]);
                    }
                });
            }
        }
        
        // If we have at least 3 nodes, calculate bounding box
        if (threeNodes.length >= 3) {
            const tb = boundsXY(threeNodes);
            const threeWidth = tb.maxX - tb.minX;
            const threeHeight = tb.maxY - tb.minY;
            
            // Add some padding for node sizes (nodes are ~234px wide, 78px+ tall)
            const nodeWidth = 250; // Account for node width
            const nodeHeight = 100; // Account for node height
            const effectiveWidth = Math.max(threeWidth, nodeWidth * 2);
            const effectiveHeight = Math.max(threeHeight, nodeHeight * 2);
            
            // Calculate maximum scale where these 3 nodes fit in viewport
            const maxScaleX = (containerWidth * (1 - 2 * padding)) / effectiveWidth;
            const maxScaleY = (containerHeight * (1 - 2 * padding)) / effectiveHeight;
            zoomMax = Math.min(maxScaleX, maxScaleY);
            
            // Ensure max zoom is at least the min zoom
            zoomMax = Math.max(zoomMin, zoomMax);
        }
    }
    
    // Create network
    const data_vis = { nodes: nodes, edges: edges };
    const options = {
        nodes: {
            borderWidth: 1,
            shadow: false,
            font: {
                color: '#000000',
                face: 'Arial',
                size: 20,
                align: 'center'
            },
            widthConstraint: {
                minimum: 234,
                maximum: 234
            },
            heightConstraint: {
                minimum: 78
            },
            fixed: {
                x: false,
                y: false
            },
            margin: 10,
            shapeProperties: {
                borderRadius: 4
            },
            scaling: {
                min: 1,
                max: 1.1,
                label: {
                    enabled: false
                }
            },
            opacity: 1 // Enable opacity support for fade transitions
        },
        edges: {
            shadow: false,
            font: {
                size: 10,
                align: 'middle'
            },
            length: 200,
            smooth: {
                type: 'curvedCW',
                roundness: 0.4
            }
        },
        physics: {
            enabled: false
        },
        interaction: {
            hover: true, // Enable hover for popup display
            tooltipDelay: 0,
            zoomView: zoomEnabled,
            dragView: true,
            dragNodes: false,
            zoomSpeed: 1.2 // Zoom speed (1.2 = 20% per scroll step)
        },
        configure: {
            enabled: false
        },
        layout: {
            hierarchical: {
                enabled: false
            }
        }
    };
    
    // Only destroy existing network if not in Link mode with already-built tree
    const isLinkModeWithBuiltTree = AppState.currentMenu === 'link' && AppState.linkTreeBuilt && AppState.network;
    
    if (AppState.network && !isLinkModeWithBuiltTree) {
        AppState.network.destroy();
    }
    
    // Only create new network if we don't already have one in Link mode
    if (!isLinkModeWithBuiltTree) {
        AppState.network = new vis.Network(container, data_vis, options);
        
        // Set up event handlers
        setupNetworkEvents();
    } else {
        // Network already exists, just update the data
        console.log('[createNetwork] Preserving existing Link network');
        AppState.network.setData(data_vis);
    }
}

// Find the oldest ancestor in the direct line from the selected person
// This finds the ancestor with the highest level (oldest generation) in the direct ancestral line
function findOldestAncestor(rootPersonId, nodes, relationships) {
    if (!rootPersonId || !nodes || !relationships) return null;
    
    const childToParents = new Map();
    relationships.forEach(rel => {
        if (rel.type === 'parent-child') {
            if (!childToParents.has(rel.to)) {
                childToParents.set(rel.to, []);
            }
            childToParents.get(rel.to).push(rel.from);
        }
    });
    
    // Find the ancestor with the highest level (oldest generation)
    let oldestAncestorId = rootPersonId;
    let maxLevel = -Infinity;
    
    // Get the level of the root person
    const rootNode = nodes.get(rootPersonId);
    if (rootNode) {
        maxLevel = rootNode.level || 0;
    }
    
    // Traverse up the tree to find the oldest ancestor
    // We'll follow the direct line (choosing one parent path)
    const visited = new Set();
    const traverse = (personId) => {
        if (visited.has(personId)) return;
        visited.add(personId);
        
        const node = nodes.get(personId);
        if (node && node.level !== undefined) {
            if (node.level > maxLevel) {
                maxLevel = node.level;
                oldestAncestorId = personId;
            }
        }
        
        // Get parents and traverse each path
        const parents = childToParents.get(personId) || [];
        parents.forEach(parentId => {
            traverse(parentId);
        });
    };
    
    traverse(rootPersonId);
    
    return oldestAncestorId;
}


function updateMarriageEdges(edges, positions, nodes) {
    const edgeArray = edges.get();
    const relationships = AppState.treeData.relationships || [];
    const marriageEdgeIds = new Set();
    
    relationships.forEach(rel => {
        if (rel.type === 'marriage') {
            const edge = edgeArray.find(e => 
                (e.from === rel.from && e.to === rel.to) ||
                (e.from === rel.to && e.to === rel.from)
            );
            if (edge) {
                marriageEdgeIds.add(edge.id);
            }
        }
    });
    
    const marriageEdges = edgeArray.filter(edge => {
        return marriageEdgeIds.has(edge.id) &&
               !edge.from.startsWith('family_') && 
               !edge.to.startsWith('family_');
    });
    
    // Group nodes by level for checking
    const nodesByLevel = new Map();
    nodes.getIds().forEach(nodeId => {
        const node = nodes.get(nodeId);
        if (node) {
            const level = node.level;
            if (!nodesByLevel.has(level)) {
                nodesByLevel.set(level, []);
            }
            nodesByLevel.get(level).push(nodeId);
        }
    });
    
    marriageEdges.forEach(edge => {
        const fromPos = positions[edge.from];
        const toPos = positions[edge.to];
        if (!fromPos || !toPos) return;
        
        const fromNode = nodes.get(edge.from);
        const toNode = nodes.get(edge.to);
        if (!fromNode || !toNode) return;
        
        if (fromNode.level !== toNode.level) return;
        
        const level = fromNode.level;
        const levelNodes = nodesByLevel.get(level) || [];
        
        const minX = Math.min(fromPos.x, toPos.x);
        const maxX = Math.max(fromPos.x, toPos.x);
        const y = fromPos.y;
        
        let hasNodesBetween = false;
        levelNodes.forEach(nodeId => {
            if (nodeId === edge.from || nodeId === edge.to) return;
            if (nodeId.startsWith('family_')) return;
            
            const nodePos = positions[nodeId];
            if (nodePos && nodePos.y === y) {
                if (nodePos.x > minX && nodePos.x < maxX) {
                    hasNodesBetween = true;
                }
            }
        });
        
        if (hasNodesBetween) {
            edges.update({
                id: edge.id,
                smooth: {
                    type: 'curvedCW',
                    roundness: 0.5
                }
            });
        } else {
            edges.update({
                id: edge.id,
                smooth: false
            });
        }
    });
}

function updateNodeLabelsBasedOnZoom() {
    if (!AppState.network || !AppState.nodes) return;
    
    const scale = AppState.network.getScale();
    // Threshold: if zoomed out (scale < 0.4), show only first name
    // Otherwise show both first and last name
    const showFullName = scale >= 0.4;
    
    // Calculate dynamic border width based on zoom (thinner when zoomed out)
    // Scale from 0.5px (very zoomed out) to 2px (zoomed in)
    const borderWidth = Math.max(0.5, Math.min(2, scale * 2));
    
    const nodeIds = AppState.nodes.getIds();
    const updates = [];
    
    nodeIds.forEach(nodeId => {
        const node = AppState.nodes.get(nodeId);
        if (!node) return;
        
        let newLabel = '';
        let fontSize = 20;
        
        if (showFullName) {
            // Show both first and last name
            if (node.fullDisplayName) {
                newLabel = node.fullDisplayName;
            } else if (node.firstName && node.lastName) {
                newLabel = `${node.firstName}\n${node.lastName}`;
            } else if (node.firstName) {
                newLabel = node.firstName;
            } else if (node.lastName) {
                newLabel = node.lastName;
            } else {
                newLabel = node.label || 'Unknown';
            }
            fontSize = 20; // Normal size for full name
        } else {
            // Show only first name - scale font size with zoom to ensure visibility
            if (node.firstName) {
                newLabel = node.firstName;
            } else if (node.lastName) {
                newLabel = node.lastName;
            } else {
                // Fallback: use first part of existing label
                const parts = (node.label || '').split('\n');
                newLabel = parts[0] || 'Unknown';
            }
            // Scale font size inversely with zoom level to ensure visibility when zoomed out
            // When scale is very small (e.g., 0.1), use larger font (e.g., 50-60)
            // When scale is moderate (e.g., 0.3), use medium font (e.g., 30-35)
            // Formula: baseSize / scale, with min 24 and max 60
            // This ensures first names remain visible even when very zoomed out
            fontSize = Math.max(24, Math.min(60, 12 / Math.max(scale, 0.1)));
            
            // Truncate text to fit in box width (234px) with single "." ellipsis
            // Calculate max characters based on font size (Arial average char width ≈ 0.6 * fontSize)
            // Account for box width (234px) minus margins (20px total)
            const boxWidth = 234;
            const margins = 20;
            const usableWidth = boxWidth - margins;
            const avgCharWidth = fontSize * 0.6;
            const maxChars = Math.floor(usableWidth / avgCharWidth);
            
            // Ensure we have at least 1 character
            if (maxChars > 0 && newLabel.length > maxChars) {
                // Truncate with single "." ellipsis
                newLabel = newLabel.substring(0, maxChars - 1) + '.';
            }
        }
        
        // Update if label, font size, or border width changed
        const currentBorderWidth = node.borderWidth !== undefined ? node.borderWidth : 1;
        if (newLabel !== node.label || 
            (node.font && node.font.size !== fontSize) || 
            Math.abs(currentBorderWidth - borderWidth) > 0.1) {
            updates.push({
                id: nodeId,
                label: newLabel,
                borderWidth: borderWidth,
                font: {
                    size: fontSize,
                    color: '#000000',
                    face: 'Arial',
                    align: 'center'
                },
                // Ensure color stays white
                color: {
                    background: '#ffffff',
                    border: '#2c3e50',
                    highlight: {
                        background: '#e0e0e0',
                        border: '#2c3e50'
                    }
                },
                scaling: {
                    min: 1,
                    max: 1.1,
                    label: {
                        enabled: false
                    }
                }
            });
        }
    });
    
    if (updates.length > 0) {
        AppState.nodes.update(updates);
    }
}

/**
 * Find all family members (ancestors and descendants) of a person
 * @param {string} personId - The person's ID
 * @param {Array} relationships - All relationships
 * @returns {Set} Set of person IDs including the person, all ancestors, and all descendants
 */
function findFamilyTree(personId, relationships) {
    const familyMembers = new Set([personId]);
    const processed = new Set();
    const toProcess = [personId];
    
    // Find all ancestors (parents, grandparents, etc.)
    while (toProcess.length > 0) {
        const currentId = toProcess.shift();
        if (processed.has(currentId)) continue;
        processed.add(currentId);
        
        // Find parents
        relationships.forEach(rel => {
            if (rel.type === 'parent-child' && rel.to === currentId) {
                const parentId = rel.from;
                if (!familyMembers.has(parentId)) {
                    familyMembers.add(parentId);
                    toProcess.push(parentId);
                }
            }
        });
    }
    
    // Reset for descendants
    processed.clear();
    toProcess.length = 0;
    toProcess.push(personId);
    
    // Find all descendants (children, grandchildren, etc.)
    while (toProcess.length > 0) {
        const currentId = toProcess.shift();
        if (processed.has(currentId)) continue;
        processed.add(currentId);
        
        // Find children
        relationships.forEach(rel => {
            if (rel.type === 'parent-child' && rel.from === currentId) {
                const childId = rel.to;
                if (!familyMembers.has(childId)) {
                    familyMembers.add(childId);
                    toProcess.push(childId);
                }
            }
        });
    }
    
    return familyMembers;
}

/**
 * Show family tree lines (green parent-child edges) for a person
 * Also applies the hovered node's color to all related family members
 * @param {string} personId - The person's ID
 */
function showFamilyTreeLines(personId) {
    if (!AppState.edges || !AppState.treeData || !AppState.nodes) return;
    
    const relationships = AppState.treeData.relationships || [];
    const familyMembers = findFamilyTree(personId, relationships);
    
    // Get the hovered node's color
    const hoveredNode = AppState.nodes.get(personId);
    if (!hoveredNode) return;
    
    // Get the background color from the hovered node
    const hoveredColor = hoveredNode.color && hoveredNode.color.background 
        ? hoveredNode.color.background 
        : '#ffffff';
    
    // Update edges: show parent-child edges that connect family members
    // Also keep edges visible for locked family trees
    const lockedPersonIds = Array.from(AppState.lockedFamilyTrees || []);
    const allLockedFamilyMembers = new Set();
    
    if (AppState.treeData) {
        const relationships = AppState.treeData.relationships || [];
        lockedPersonIds.forEach(lockedPersonId => {
            const lockedFamily = findFamilyTree(lockedPersonId, relationships);
            lockedFamily.forEach(id => allLockedFamilyMembers.add(id));
        });
    }
    
    const edgeUpdates = [];
    AppState.edges.forEach(edge => {
        // Check if this is a parent-child edge (green line)
        // Can be either a string color or an object with color property
        const edgeColor = typeof edge.color === 'object' ? edge.color.color : edge.color;
        const isParentChildEdge = edgeColor === CONFIG.parentChildColor || edgeColor === '#27ae60';
        
        if (isParentChildEdge) {
            // Show edge if both from and to are in the current family tree
            const fromInFamily = familyMembers.has(edge.from);
            const toInFamily = familyMembers.has(edge.to);
            const shouldBeVisible = fromInFamily && toInFamily;
            
            // Also keep visible if in a locked family tree
            const fromInLocked = allLockedFamilyMembers.has(edge.from);
            const toInLocked = allLockedFamilyMembers.has(edge.to);
            const inLockedTree = fromInLocked && toInLocked;
            
            edgeUpdates.push({
                id: edge.id,
                hidden: !(shouldBeVisible || inLockedTree),
                opacity: (shouldBeVisible || inLockedTree) ? 1 : 0
            });
        }
    });
    
    if (edgeUpdates.length > 0) {
        AppState.edges.update(edgeUpdates);
    }
    
    // Apply the hovered node's color to all family members (all nodes where green lines connect)
    const nodeUpdates = [];
    AppState.nodes.forEach(node => {
        const isFamilyMember = familyMembers.has(node.id);
        
        if (isFamilyMember) {
            // Store original color if not already stored
            if (!node.originalColor) {
                node.originalColor = node.color ? {
                    background: node.color.background || '#ffffff',
                    border: node.color.border || '#2c3e50',
                    highlight: node.color.highlight || {
                        background: '#e0e0e0',
                        border: '#2c3e50'
                    }
                } : {
                    background: '#ffffff',
                    border: '#2c3e50',
                    highlight: {
                        background: '#e0e0e0',
                        border: '#2c3e50'
                    }
                };
            }
            
            // Apply hovered color to all family members (including the hovered node itself)
            // This makes all nodes connected by green lines have the same color
            nodeUpdates.push({
                id: node.id,
                color: {
                    background: hoveredColor,
                    border: node.originalColor.border,
                    highlight: {
                        background: hoveredColor,
                        border: node.originalColor.border
                    }
                }
            });
        } else {
            // For nodes not in the current family tree, restore their original color if they had one
            // But don't restore if they're in a locked family tree
            const isInLockedTree = allLockedFamilyMembers.has(node.id);
            if (node.originalColor && !isInLockedTree) {
                nodeUpdates.push({
                    id: node.id,
                    color: node.originalColor
                });
                delete node.originalColor;
            }
        }
    });
    
    if (nodeUpdates.length > 0) {
        AppState.nodes.update(nodeUpdates);
    }
}

/**
 * Hide all family tree lines (green parent-child edges)
 * Also restore node colors to original
 * CRITICAL: Preserve locked family trees - never hide their lines or colors
 */
function hideAllFamilyTreeLines() {
    if (!AppState.edges || !AppState.nodes || !AppState.treeData) return;
    
    // Get all locked family members - these should NEVER be hidden
    const lockedPersonIds = Array.from(AppState.lockedFamilyTrees || []);
    const lockedFamilyMembers = new Set();
    const relationships = AppState.treeData.relationships || [];
    
    lockedPersonIds.forEach(personId => {
        const familyMembers = findFamilyTree(personId, relationships);
        familyMembers.forEach(id => lockedFamilyMembers.add(id));
    });
    
    // Update all parent-child edges to be hidden (except for locked trees)
    const edgeUpdates = [];
    AppState.edges.forEach(edge => {
        // Check if this is a parent-child edge (green line)
        const edgeColor = typeof edge.color === 'object' ? edge.color.color : edge.color;
        const isParentChildEdge = edgeColor === CONFIG.parentChildColor || edgeColor === '#27ae60';
        
        if (isParentChildEdge) {
            // Keep edge visible if both nodes are in a locked family tree
            const fromLocked = lockedFamilyMembers.has(edge.from);
            const toLocked = lockedFamilyMembers.has(edge.to);
            const shouldStayVisible = fromLocked && toLocked;
            
            if (!shouldStayVisible) {
                // Only hide if not in a locked tree
                edgeUpdates.push({
                    id: edge.id,
                    hidden: true,
                    opacity: 0
                });
            } else {
                // Ensure locked edges are visible
                edgeUpdates.push({
                    id: edge.id,
                    hidden: false,
                    opacity: 1
                });
            }
        }
    });
    
    if (edgeUpdates.length > 0) {
        AppState.edges.update(edgeUpdates);
    }
    
    // Restore node colors to original (except for locked trees)
    // Also ensure locked tree nodes keep their colors
    const nodeUpdates = [];
    AppState.nodes.forEach(node => {
        const isInLockedTree = lockedFamilyMembers.has(node.id);
        
        if (isInLockedTree) {
            // Node is in a locked tree - ensure it keeps its color
            // Find which locked tree it belongs to and get that tree's color
            let lockedTreeColor = null;
            for (const lockedPersonId of lockedPersonIds) {
                const familyMembers = findFamilyTree(lockedPersonId, relationships);
                if (familyMembers.has(node.id)) {
                    const lockedNode = AppState.nodes.get(lockedPersonId);
                    if (lockedNode && lockedNode.color) {
                        lockedTreeColor = lockedNode.color.background || '#ffffff';
                        break;
                    }
                }
            }
            
            if (lockedTreeColor) {
                // Ensure the node has the locked tree's color
                const currentColor = node.color && node.color.background;
                if (currentColor !== lockedTreeColor) {
                    // Store original color if not already stored
                    if (!node.originalColor) {
                        node.originalColor = node.color ? {
                            background: node.color.background || '#ffffff',
                            border: node.color.border || '#2c3e50',
                            highlight: node.color.highlight || {
                                background: '#e0e0e0',
                                border: '#2c3e50'
                            }
                        } : {
                            background: '#ffffff',
                            border: '#2c3e50',
                            highlight: {
                                background: '#e0e0e0',
                                border: '#2c3e50'
                            }
                        };
                    }
                    
                    nodeUpdates.push({
                        id: node.id,
                        color: {
                            background: lockedTreeColor,
                            border: node.originalColor.border,
                            highlight: {
                                background: lockedTreeColor,
                                border: node.originalColor.border
                            }
                        }
                    });
                }
            }
        } else {
            // Node is not in a locked tree - restore original color
            if (node.originalColor) {
                nodeUpdates.push({
                    id: node.id,
                    color: node.originalColor
                });
                // Clear the stored original color
                delete node.originalColor;
            }
        }
    });
    
    if (nodeUpdates.length > 0) {
        AppState.nodes.update(nodeUpdates);
    }
}

/**
 * Toggle lock for a family tree - clicking on a node locks/unlocks it
 */
function toggleLockFamilyTree(personId) {
    if (!AppState.lockedFamilyTrees) {
        AppState.lockedFamilyTrees = new Set();
    }
    
    if (AppState.lockedFamilyTrees.has(personId)) {
        // Unlock - hide the family tree lines and restore colors
        AppState.lockedFamilyTrees.delete(personId);
        hideFamilyTreeLines(personId);
    } else {
        // Lock - show and keep the family tree lines visible
        AppState.lockedFamilyTrees.add(personId);
        showFamilyTreeLines(personId);
    }
    
    // Update clear all locks button visibility
    updateClearLocksButton();
}

/**
 * Hide a specific family tree's lines and colors
 */
function hideFamilyTreeLines(personId) {
    if (!AppState.edges || !AppState.treeData || !AppState.nodes) return;
    
    const relationships = AppState.treeData.relationships || [];
    const familyMembers = findFamilyTree(personId, relationships);
    
    // Get all locked family members (excluding the one we're hiding)
    const lockedPersonIds = Array.from(AppState.lockedFamilyTrees || []);
    const allLockedFamilyMembers = new Set();
    
    lockedPersonIds.forEach(lockedPersonId => {
        if (lockedPersonId !== personId) {
            const lockedFamily = findFamilyTree(lockedPersonId, relationships);
            lockedFamily.forEach(id => allLockedFamilyMembers.add(id));
        }
    });
    
    // Hide edges for this family tree (but keep edges for other locked trees)
    const edgeUpdates = [];
    AppState.edges.forEach(edge => {
        const edgeColor = typeof edge.color === 'object' ? edge.color.color : edge.color;
        const isParentChildEdge = edgeColor === CONFIG.parentChildColor || edgeColor === '#27ae60';
        
        if (isParentChildEdge) {
            const fromInFamily = familyMembers.has(edge.from);
            const toInFamily = familyMembers.has(edge.to);
            const inThisFamily = fromInFamily && toInFamily;
            
            // Keep visible if in another locked tree
            const fromInLocked = allLockedFamilyMembers.has(edge.from);
            const toInLocked = allLockedFamilyMembers.has(edge.to);
            const inOtherLockedTree = fromInLocked && toInLocked;
            
            if (inThisFamily && !inOtherLockedTree) {
                edgeUpdates.push({
                    id: edge.id,
                    hidden: true,
                    opacity: 0
                });
            }
        }
    });
    
    if (edgeUpdates.length > 0) {
        AppState.edges.update(edgeUpdates);
    }
    
    // Restore colors for this family tree (but keep colors for other locked trees)
    const nodeUpdates = [];
    AppState.nodes.forEach(node => {
        const isInThisFamily = familyMembers.has(node.id);
        const isInOtherLockedTree = allLockedFamilyMembers.has(node.id);
        
        if (isInThisFamily && !isInOtherLockedTree && node.originalColor) {
            nodeUpdates.push({
                id: node.id,
                color: node.originalColor
            });
            delete node.originalColor;
        }
    });
    
    if (nodeUpdates.length > 0) {
        AppState.nodes.update(nodeUpdates);
    }
}

/**
 * Update clear all locks button visibility
 */
function updateClearLocksButton() {
    const lockControls = document.getElementById('lockControls');
    if (!lockControls) return;
    
    if (AppState.lockedFamilyTrees && AppState.lockedFamilyTrees.size > 0) {
        lockControls.classList.remove('hidden');
    } else {
        lockControls.classList.add('hidden');
    }
}

/**
 * Clear all locked family trees
 */
function clearAllLocks() {
    if (!AppState.lockedFamilyTrees) return;
    
    // Hide all locked family trees
    const lockedPersonIds = Array.from(AppState.lockedFamilyTrees);
    lockedPersonIds.forEach(personId => {
        hideFamilyTreeLines(personId);
    });
    
    // Clear the set
    AppState.lockedFamilyTrees.clear();
    
    // Update UI
    updateClearLocksButton();
}

function setupNetworkEvents() {
    if (!AppState.network) {
        return;
    }
    
    // Timeouts for hover-based popup display and line hiding
    let showPopupTimeout = null;
    let hidePopupTimeout = null;
    let hideLinesTimeout = null;
    let currentHoveredNodeId = null;
    
    // Update grid on zoom/pan
    AppState.network.on('zoom', () => {
        updateGridPositions();
        updateNodeLabelsBasedOnZoom();
        enforceZoomLimits();
    });
    AppState.network.on('dragEnd', updateGridPositions);
    
    // Handle node hover to show popup after 1 second and show family tree lines
    AppState.network.on('hoverNode', function(params) {
        const nodeId = params.node;
        const node = AppState.nodes.get(nodeId);
        
        if (!node || !node.data) {
            return;
        }
        
        // Clear any pending hide timeout
        if (hidePopupTimeout) {
            clearTimeout(hidePopupTimeout);
            hidePopupTimeout = null;
        }
        
        // Clear any pending hide timeout for lines
        if (hideLinesTimeout) {
            clearTimeout(hideLinesTimeout);
            hideLinesTimeout = null;
        }
        
        // If already showing this node's popup, do nothing
        if (currentHoveredNodeId === nodeId) {
            return;
        }
        
        // Clear any pending show timeout
        if (showPopupTimeout) {
            clearTimeout(showPopupTimeout);
        }
        
        // Set new hovered node
        currentHoveredNodeId = nodeId;
        
        // Show family tree lines (green lines) for this person - only in link mode
        if (AppState.currentMenu === 'link') {
            showFamilyTreeLines(nodeId);
        }
        
        // Show popup after 1 second
        showPopupTimeout = setTimeout(() => {
            showPersonDetails(node.data);
            showPopupTimeout = null;
        }, 1000);
    });
    
    // Handle node blur to hide popup after 1 second and hide family tree lines
    AppState.network.on('blurNode', function(params) {
        // Clear any pending show timeout
        if (showPopupTimeout) {
            clearTimeout(showPopupTimeout);
            showPopupTimeout = null;
        }
        
        // Store the hovered node ID before clearing it
        const hoveredNodeId = currentHoveredNodeId;
        
        // Clear current hovered node
        currentHoveredNodeId = null;
        
        // Clear any pending hide timeout for lines
        if (hideLinesTimeout) {
            clearTimeout(hideLinesTimeout);
            hideLinesTimeout = null;
        }
        
        // Hide all family tree lines (green lines) immediately - only in link mode
        // But don't hide if the tree is locked
        if (AppState.currentMenu === 'link') {
            // Only hide if not locked
            if (!AppState.lockedFamilyTrees.has(hoveredNodeId)) {
                hideAllFamilyTreeLines();
            }
        }
        
        // Clear any pending hide timeout for popup
        if (hidePopupTimeout) {
            clearTimeout(hidePopupTimeout);
        }
        
        // Hide popup after 1 second
        hidePopupTimeout = setTimeout(() => {
            hidePersonDetails();
            hidePopupTimeout = null;
        }, 1000);
    });
    
    // Handle node click (descendants / link / tree)
    AppState.network.on('click', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            
            if (AppState.currentMenu === 'descendants' && AppState.treeData) {
                const maxG = AppState.descendantsMaxGenerations || 3;
                buildDescendantsTree(AppState.treeData, nodeId, maxG);
                return;
            }
            
            // In link mode, clicking on a node toggles lock/unlock for that family tree
            if (AppState.currentMenu === 'link') {
                toggleLockFamilyTree(nodeId);
                return;
            }
            
            // In tree mode, center the view
            // TODO: Re-enable centering if needed
            // Center horizontally, position at 35% from bottom vertically
            /*
            const currentScale = AppState.network.getScale();
            const container = document.getElementById('tree-container');
            const containerHeight = container.offsetHeight || window.innerHeight;
            
            // Get node position
            const nodePosition = AppState.network.getPositions([nodeId]);
            if (nodePosition && nodePosition[nodeId]) {
                const nodeX = nodePosition[nodeId].x;
                const nodeY = nodePosition[nodeId].y;
                
                // Calculate target viewport center
                // We want the node at 35% from bottom (0 = bottom, 100 = top)
                // If viewport center is at 50% and we want node at 35% from bottom:
                // Node needs to be 15% below center (50% - 35% = 15%)
                // So we move center up: centerY = nodeY - (0.15 * viewportHeight / scale)
                const targetCenterX = nodeX; // Center horizontally
                const targetCenterY = nodeY - (0.15 * containerHeight / currentScale);
                
                AppState.network.moveTo({
                    position: { x: targetCenterX, y: targetCenterY },
                    scale: currentScale,
                    animation: {
                        duration: 300,
                        easingFunction: 'easeInOutQuad'
                    }
                });
            }
            */
        } else {
            // Click on empty space - hide popup
            hidePersonDetails();
            document.getElementById('sidebar').classList.remove('active');
        }
    });
    
    // Handle double click to center
    AppState.network.on('doubleClick', function(params) {
        if (params.nodes.length > 0) {
            AppState.network.focus(params.nodes[0], {
                scale: 1.2,
                animation: true
            });
        }
    });
    
    // Handle popup hover to prevent hiding when hovering over popup
    const popup = document.getElementById('personPopup');
    if (popup) {
        popup.addEventListener('mouseenter', function() {
            // Clear any pending hide timeout when hovering over popup
            if (hidePopupTimeout) {
                clearTimeout(hidePopupTimeout);
                hidePopupTimeout = null;
            }
        });
        
        popup.addEventListener('mouseleave', function() {
            // Start hide timeout when leaving popup
            if (hidePopupTimeout) {
                clearTimeout(hidePopupTimeout);
            }
            hidePopupTimeout = setTimeout(() => {
                hidePersonDetails();
                hidePopupTimeout = null;
                currentHoveredNodeId = null;
            }, 1000);
        });
    }
    
    // Hide popup when clicking outside the network (optional - hover handles it now)
    // Keeping this for cases where user clicks outside to dismiss immediately
    document.addEventListener('click', function(e) {
        const popupEl = document.getElementById('personPopup');
        const treeContainer = document.getElementById('tree-container');
        
        // Check if click is inside tree container - if so, let network handler deal with it
        if (treeContainer && treeContainer.contains(e.target)) {
            return;
        }
        
        // Check if click is outside both popup and tree container
        if (popupEl && !popupEl.classList.contains('hidden') && 
            !popupEl.contains(e.target)) {
            // Clear any pending timeouts
            if (showPopupTimeout) {
                clearTimeout(showPopupTimeout);
                showPopupTimeout = null;
            }
            if (hidePopupTimeout) {
                clearTimeout(hidePopupTimeout);
                hidePopupTimeout = null;
            }
            currentHoveredNodeId = null;
            hidePersonDetails();
        }
    });
    
    // Initial label update based on current zoom
    setTimeout(updateNodeLabelsBasedOnZoom, 100);
    
    // Initial zoom limit enforcement
    setTimeout(enforceZoomLimits, 100);
    
    // Recalculate zoom limits on window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            enforceZoomLimits();
        }, 250);
    });
}

function enforceZoomLimits() {
    if (!AppState.network || !AppState.positions) return;
    
    const currentScale = AppState.network.getScale();
    const container = document.getElementById('tree-container');
    const containerWidth = container.offsetWidth || window.innerWidth;
    const containerHeight = container.offsetHeight || window.innerHeight;
    
    // Recalculate minimum zoom based on current viewport
    const nodePositions = Object.values(AppState.positions);
    if (nodePositions.length === 0) return;
    
    const numNodes = nodePositions.length;
    
    const isLinkMode = AppState.currentMenu === 'link';
    const isFamilyNameMode = AppState.currentMenu === 'family';

    const selectedPersonId = AppState.rootPersonId;
    
    let hasTwoParents = false;
    if (selectedPersonId && AppState.treeData) {
        const relationships = AppState.treeData.relationships || [];
        const parentCount = relationships.filter(rel => 
            rel.type === 'parent-child' && rel.to === selectedPersonId
        ).length;
        hasTwoParents = parentCount >= 2;
    }
    
    const bbAll = boundsXY(nodePositions);
    const minX = bbAll.minX;
    const maxX = bbAll.maxX;
    const minY = bbAll.minY;
    const maxY = bbAll.maxY;

    const treeWidth = maxX - minX;
    const treeHeight = maxY - minY;
    
    const padding = 0.02; // 2% padding
    const scaleX = (containerWidth * (1 - 2 * padding)) / treeWidth;
    const scaleY = (containerHeight * (1 - 2 * padding)) / treeHeight;
    const minScaleToFitAll = Math.min(scaleX, scaleY);
    
    // Allow zooming out much more (3x more than needed to fit all nodes)
    const minScale = Math.max(0.01, minScaleToFitAll * 0.33);
    
    // Calculate maximum zoom
    let maxScale = 2.0;
    if (isLinkMode || isFamilyNameMode) {
        maxScale = 3.0;
    } else if (numNodes >= 3 && hasTwoParents) {
        // Find the 3 nodes: selected person + 2 parents
        const threeNodes = [];
        if (selectedPersonId && AppState.positions[selectedPersonId]) {
            threeNodes.push(AppState.positions[selectedPersonId]);
            
            if (AppState.treeData) {
                const relationships = AppState.treeData.relationships || [];
                const parents = relationships
                    .filter(rel => rel.type === 'parent-child' && rel.to === selectedPersonId)
                    .map(rel => rel.from)
                    .slice(0, 2);
                
                parents.forEach(parentId => {
                    if (AppState.positions[parentId]) {
                        threeNodes.push(AppState.positions[parentId]);
                    }
                });
            }
        }
        
        if (threeNodes.length >= 3) {
            const tb = boundsXY(threeNodes);
            const threeWidth = tb.maxX - tb.minX;
            const threeHeight = tb.maxY - tb.minY;
            
            const nodeWidth = 250;
            const nodeHeight = 100;
            const effectiveWidth = Math.max(threeWidth, nodeWidth * 2);
            const effectiveHeight = Math.max(threeHeight, nodeHeight * 2);
            
            const maxScaleX = (containerWidth * (1 - 2 * padding)) / effectiveWidth;
            const maxScaleY = (containerHeight * (1 - 2 * padding)) / effectiveHeight;
            maxScale = Math.min(maxScaleX, maxScaleY);
            maxScale = Math.max(minScale, maxScale);
        }
    } else {
        // Disable zoom - lock to minimum
        maxScale = minScale;
    }
    
    // Enforce limits
    if (currentScale < minScale) {
        const viewPosition = AppState.network.getViewPosition();
        AppState.network.moveTo({
            position: viewPosition,
            scale: minScale,
            animation: false
        });
    } else if (currentScale > maxScale) {
        const viewPosition = AppState.network.getViewPosition();
        AppState.network.moveTo({
            position: viewPosition,
            scale: maxScale,
            animation: false
        });
    }
}

