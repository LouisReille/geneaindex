// Data processing: level calculation, grouping, node/edge creation

// Async version that processes in chunks with progress updates
async function calculateLevelsAsync(individuals, relationships, onProgress) {
    const nodeLevels = new Map();
    const processed = new Set();
    const personMap = new Map();
    
    // Build person map in chunks
    const CHUNK_SIZE = 100;
    for (let i = 0; i < individuals.length; i += CHUNK_SIZE) {
        const chunk = individuals.slice(i, i + CHUNK_SIZE);
        chunk.forEach(person => {
            personMap.set(person.id, person);
        });
        if (onProgress) {
            const progress = Math.round((i / individuals.length) * 20); // First 20% for person map
            onProgress(progress, 'Processing levels...');
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    // Build marriages map in chunks (include both marriage and divorce - divorced couples should be on same level)
    const marriages = new Map();
    const coupleRels = relationships.filter(rel => rel.type === 'marriage' || rel.type === 'divorce');
    for (let i = 0; i < coupleRels.length; i += CHUNK_SIZE) {
        const chunk = coupleRels.slice(i, i + CHUNK_SIZE);
        chunk.forEach(rel => {
            if (!marriages.has(rel.from)) marriages.set(rel.from, []);
            if (!marriages.has(rel.to)) marriages.set(rel.to, []);
            marriages.get(rel.from).push(rel.to);
            marriages.get(rel.to).push(rel.from);
        });
        if (onProgress) {
            const progress = 20 + Math.round((i / coupleRels.length) * 10); // 20-30% for marriages
            onProgress(progress, 'Processing levels...');
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    function setLevel(personId, level) {
        if (processed.has(personId)) return;
        processed.add(personId);
        nodeLevels.set(personId, level);
        
        const spouses = marriages.get(personId) || [];
        spouses.forEach(spouseId => {
            if (!processed.has(spouseId)) {
                nodeLevels.set(spouseId, level);
                processed.add(spouseId);
            }
        });
    }
    
    // Find root nodes in chunks
    const hasParent = new Set();
    const parentChildRels = relationships.filter(rel => rel.type === 'parent-child');
    for (let i = 0; i < parentChildRels.length; i += CHUNK_SIZE) {
        const chunk = parentChildRels.slice(i, i + CHUNK_SIZE);
        chunk.forEach(rel => {
            hasParent.add(rel.to);
        });
        if (onProgress) {
            const progress = 30 + Math.round((i / parentChildRels.length) * 10); // 30-40%
            onProgress(progress, `Finding root nodes... ${i}/${parentChildRels.length}`);
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    // Set initial levels for root nodes in chunks
    const rootNodes = individuals.filter(person => !hasParent.has(person.id));
    for (let i = 0; i < rootNodes.length; i += CHUNK_SIZE) {
        const chunk = rootNodes.slice(i, i + CHUNK_SIZE);
        chunk.forEach(person => {
            const generation = person.generation || 0;
            setLevel(person.id, generation);
        });
        if (onProgress) {
            const progress = 40 + Math.round((i / rootNodes.length) * 10); // 40-50%
            onProgress(progress, 'Processing levels...');
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    // Process relationships in chunks within the while loop
    let changed = true;
    let iteration = 0;
    const maxIterations = 50; // Safety limit
    const totalChunksPerIteration = Math.ceil(parentChildRels.length / CHUNK_SIZE);
    // Fixed estimate for smooth progress (most genealogies converge in 8-12 iterations)
    const estimatedMaxIterations = 10;
    const totalEstimatedChunks = totalChunksPerIteration * estimatedMaxIterations;
    let totalChunksProcessed = 0;
    
    while (changed && iteration < maxIterations) {
        changed = false;
        iteration++;
        
        // Process relationships in chunks
        for (let i = 0; i < parentChildRels.length; i += CHUNK_SIZE) {
            const chunk = parentChildRels.slice(i, i + CHUNK_SIZE);
            chunk.forEach(rel => {
                const parentLevel = nodeLevels.get(rel.from);
                if (parentLevel !== undefined) {
                    const person = personMap.get(rel.to);
                    const childLevel = (person && person.generation !== undefined) 
                        ? person.generation 
                        : parentLevel + 1;
                    if (!nodeLevels.has(rel.to) || nodeLevels.get(rel.to) !== childLevel) {
                        setLevel(rel.to, childLevel);
                        changed = true;
                    }
                }
            });
            
            totalChunksProcessed++;
            
            if (onProgress) {
                // Simple linear progress: 50% to 90% based on chunks processed
                // Cap at 90% until we're done with iterations
                const chunkProgress = Math.min(totalChunksProcessed / totalEstimatedChunks, 0.9);
                const progress = 50 + Math.round(chunkProgress * 40); // 50-90%
                onProgress(progress, 'Processing levels...');
            }
            
            // Yield control between chunks
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    
    // Set default levels for remaining nodes in chunks
    const remainingNodes = individuals.filter(person => !nodeLevels.has(person.id));
    const totalRemainingChunks = Math.ceil(remainingNodes.length / CHUNK_SIZE);
    let remainingChunksProcessed = 0;
    
    for (let i = 0; i < remainingNodes.length; i += CHUNK_SIZE) {
        const chunk = remainingNodes.slice(i, i + CHUNK_SIZE);
        chunk.forEach(person => {
            const level = person.generation !== undefined ? person.generation : 0;
            setLevel(person.id, level);
        });
        remainingChunksProcessed++;
        
        if (onProgress) {
            // Final 10%: 90% to 100%
            const remainingProgress = remainingChunksProcessed / totalRemainingChunks;
            const progress = 90 + Math.round(remainingProgress * 10); // 90-100%
            onProgress(progress, 'Processing levels...');
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    if (onProgress) {
        onProgress(100, 'Processing levels...');
    }
    
    return { nodeLevels, marriages };
}

function calculateLevels(individuals, relationships) {
    const nodeLevels = new Map();
    const processed = new Set();
    const personMap = new Map();
    
    individuals.forEach(person => {
        personMap.set(person.id, person);
    });
    
    // Build a map of marriages to find spouses (include both marriage and divorce - divorced couples should be on same level)
    const marriages = new Map();
    relationships.forEach(rel => {
        if (rel.type === 'marriage' || rel.type === 'divorce') {
            if (!marriages.has(rel.from)) marriages.set(rel.from, []);
            if (!marriages.has(rel.to)) marriages.set(rel.to, []);
            marriages.get(rel.from).push(rel.to);
            marriages.get(rel.to).push(rel.from);
        }
    });
    
    function setLevel(personId, level) {
        if (processed.has(personId)) return;
        processed.add(personId);
        nodeLevels.set(personId, level);
        
        // Set spouse to same level (married couples on same level)
        const spouses = marriages.get(personId) || [];
        spouses.forEach(spouseId => {
            if (!processed.has(spouseId)) {
                nodeLevels.set(spouseId, level);
                processed.add(spouseId);
            }
        });
    }
    
    // Find root nodes (people with no parents)
    const hasParent = new Set();
    relationships.forEach(rel => {
        if (rel.type === 'parent-child') {
            hasParent.add(rel.to);
        }
    });
    
    // Start from people without parents (oldest generation)
    individuals.forEach(person => {
        if (!hasParent.has(person.id)) {
            const generation = person.generation || 0;
            setLevel(person.id, generation);
        }
    });
    
    // Set levels for children (newer generations get higher level numbers = lower on screen)
    let changed = true;
    const maxLevelIterations = Math.max(individuals.length, relationships.length) + 100;
    let levelIteration = 0;
    while (changed && levelIteration < maxLevelIterations) {
        levelIteration += 1;
        changed = false;
        relationships.forEach(rel => {
            if (rel.type === 'parent-child') {
                const parentLevel = nodeLevels.get(rel.from);
                if (parentLevel !== undefined) {
                    const person = personMap.get(rel.to);
                    const childLevel = (person && person.generation !== undefined) 
                        ? person.generation 
                        : parentLevel + 1;
                    if (!nodeLevels.has(rel.to) || nodeLevels.get(rel.to) !== childLevel) {
                        setLevel(rel.to, childLevel);
                        changed = true;
                    }
                }
            }
        });
    }
    
    // Set default level for any remaining nodes
    individuals.forEach(person => {
        if (!nodeLevels.has(person.id)) {
            const level = person.generation !== undefined ? person.generation : 0;
            setLevel(person.id, level);
        }
    });
    
    return { nodeLevels, marriages };
}

// Async version that processes in chunks
async function groupCouplesAsync(relationships, onProgress) {
    const coupleGroups = new Map();
    let coupleGroupId = 0;
    const personToCoupleGroup = new Map();
    
    // Include both marriage and divorce relationships - divorced couples should also be positioned close together
    const coupleRels = relationships.filter(rel => rel.type === 'marriage' || rel.type === 'divorce');
    const CHUNK_SIZE = 200;
    
    for (let i = 0; i < coupleRels.length; i += CHUNK_SIZE) {
        const chunk = coupleRels.slice(i, i + CHUNK_SIZE);
        chunk.forEach(rel => {
            const group1 = personToCoupleGroup.get(rel.from);
            const group2 = personToCoupleGroup.get(rel.to);
            
            if (!group1 && !group2) {
                const group = coupleGroupId++;
                coupleGroups.set(group, [rel.from, rel.to]);
                personToCoupleGroup.set(rel.from, group);
                personToCoupleGroup.set(rel.to, group);
            } else if (group1 && !group2) {
                coupleGroups.get(group1).push(rel.to);
                personToCoupleGroup.set(rel.to, group1);
            } else if (!group1 && group2) {
                coupleGroups.get(group2).push(rel.from);
                personToCoupleGroup.set(rel.from, group2);
            } else if (group1 !== group2) {
                const members1 = coupleGroups.get(group1);
                const members2 = coupleGroups.get(group2);
                members1.push(...members2);
                members2.forEach(id => personToCoupleGroup.set(id, group1));
                coupleGroups.delete(group2);
            }
        });
        
        if (onProgress) {
            const progress = Math.round((i / coupleRels.length) * 100);
            onProgress(progress, `Grouping couples... ${i}/${coupleRels.length}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    return { coupleGroups, personToCoupleGroup };
}

function groupCouples(relationships) {
    const coupleGroups = new Map();
    let coupleGroupId = 0;
    const personToCoupleGroup = new Map();
    
    // Include both marriage and divorce relationships - divorced couples should also be positioned close together
    relationships.forEach(rel => {
        if (rel.type === 'marriage' || rel.type === 'divorce') {
            const group1 = personToCoupleGroup.get(rel.from);
            const group2 = personToCoupleGroup.get(rel.to);
            
            if (!group1 && !group2) {
                const group = coupleGroupId++;
                coupleGroups.set(group, [rel.from, rel.to]);
                personToCoupleGroup.set(rel.from, group);
                personToCoupleGroup.set(rel.to, group);
            } else if (group1 && !group2) {
                coupleGroups.get(group1).push(rel.to);
                personToCoupleGroup.set(rel.to, group1);
            } else if (!group1 && group2) {
                coupleGroups.get(group2).push(rel.from);
                personToCoupleGroup.set(rel.from, group2);
            } else if (group1 !== group2) {
                const members1 = coupleGroups.get(group1);
                const members2 = coupleGroups.get(group2);
                members1.push(...members2);
                members2.forEach(id => personToCoupleGroup.set(id, group1));
                coupleGroups.delete(group2);
            }
        }
    });
    
    return { coupleGroups, personToCoupleGroup };
}

function groupParentChildren(relationships, marriages) {
    const parentPairToChildren = new Map();
    const parentChildRels = relationships.filter(rel => rel.type === 'parent-child');
    
    parentChildRels.forEach(rel => {
        const parentId = rel.from;
        const childId = rel.to;
        const spouseId = marriages.get(parentId) ? marriages.get(parentId)[0] : null;
        const parentKey = spouseId 
            ? [parentId, spouseId].sort().join('_')
            : parentId;
        
        if (!parentPairToChildren.has(parentKey)) {
            parentPairToChildren.set(parentKey, {
                parents: spouseId ? [parentId, spouseId] : [parentId],
                children: []
            });
        }
        parentPairToChildren.get(parentKey).children.push(childId);
    });
    
    return parentPairToChildren;
}

// Async version that processes in chunks
async function createNodesAsync(individuals, nodeLevels, personToCoupleGroup, onProgress) {
    const nodes = [];
    const CHUNK_SIZE = 100;
    
    for (let i = 0; i < individuals.length; i += CHUNK_SIZE) {
        const chunk = individuals.slice(i, i + CHUNK_SIZE);
        const chunkNodes = chunk.map((person, chunkIndex) => {
            const index = i + chunkIndex;
            return createNodeFromPerson(person, index, nodeLevels, personToCoupleGroup);
        });
        nodes.push(...chunkNodes);
        
        if (onProgress) {
            const progress = Math.round((i / individuals.length) * 100);
            onProgress(progress, 'Creating nodes...');
        }
        
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    return new vis.DataSet(nodes);
}

// Helper function to create a single node
function createNodeFromPerson(person, index, nodeLevels, personToCoupleGroup) {
        // Only show first name and last name (first name on top, last name on bottom)
        const firstName = (person.firstName || '').trim();
        const lastName = (person.lastName || '').trim();
        let displayName = '';
        
        // Build display name with first name on top, last name on bottom
        if (firstName && lastName) {
            displayName = `${firstName}\n${lastName}`;
        } else if (firstName) {
            displayName = firstName;
        } else if (lastName) {
            displayName = lastName;
        }
        
        // Fallback to fullName if firstName/lastName are not available
        if (!displayName && person.fullName) {
            displayName = person.fullName.trim();
        }
        
        // Final fallback
        if (!displayName) {
            displayName = 'Inconnu(e)';
        }
        
        // Truncate if too long (approximately 26 characters per line fit in 234px width with font size 16)
        const maxLength = 26;
        if (displayName.includes('\n')) {
            const lines = displayName.split('\n');
            const truncatedLines = lines.map(line => {
                if (line.length > maxLength) {
                    return line.substring(0, maxLength - 3) + '...';
                }
                return line;
            });
            displayName = truncatedLines.join('\n');
        } else if (displayName.length > maxLength) {
            displayName = displayName.substring(0, maxLength - 3) + '...';
        }
        
        // Debug: log first few names to verify they're being set
        if (index < 3) {
            console.log('Node label:', displayName, 'for person:', person.id, 'firstName:', firstName, 'lastName:', lastName);
        }
        
        // Full name for reference (no tooltip needed - using popup instead)
        const fullName = person.fullName || displayName;
        
        const level = nodeLevels.get(person.id);
        const finalLevel = (level !== undefined && level !== null && typeof level === 'number') 
            ? level 
            : (person.generation !== undefined ? person.generation : 0);
        
        const coupleGroup = personToCoupleGroup.get(person.id);
        
        const node = {
            id: person.id || `person_${index}`,
            label: displayName || 'Inconnu(e)',
            level: finalLevel,
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
            },
            shape: 'box',
            font: { 
                size: 20,
                color: '#000000',
                face: 'Arial',
                align: 'center'
            },
            margin: 10,
            widthConstraint: {
                minimum: 234,
                maximum: 234
            },
            heightConstraint: {
                minimum: 78
            },
            data: person,
            // Store name components for dynamic label updates
            firstName: firstName,
            lastName: lastName,
            fullDisplayName: displayName
        };
        
        // Don't use groups - they can override color styling
        // Removed: node.group assignment
        
        return node;
}

function createNodes(individuals, nodeLevels, personToCoupleGroup) {
    return new vis.DataSet(individuals.map((person, index) => {
        return createNodeFromPerson(person, index, nodeLevels, personToCoupleGroup);
    }));
}

function createEdges(relationships, parentPairToChildren) {
    const processedEdges = [];
    let edgeCounter = 0;
    
    relationships.forEach(rel => {
        if (rel.type === 'marriage') {
            processedEdges.push({
                id: `edge_${edgeCounter++}`,
                from: rel.from,
                to: rel.to,
                color: CONFIG.marriageColor,
                width: 3,
                arrows: { to: { enabled: false } },
                smooth: {
                    type: 'curvedCW',
                    roundness: 0.3
                }
            });
        } else if (rel.type !== 'parent-child') {
            processedEdges.push({
                id: `edge_${edgeCounter++}`,
                from: rel.from,
                to: rel.to,
                color: CONFIG.otherRelationColor,
                width: 2,
                dashes: rel.type === 'sibling',
                arrows: { to: { enabled: false } }
            });
        }
    });
    
    // Create direct parent-child edges (one from each parent to each child)
    parentPairToChildren.forEach((family, parentKey) => {
        family.parents.forEach(parentId => {
            family.children.forEach(childId => {
                processedEdges.push({
                    id: `edge_${edgeCounter++}`,
                    from: parentId,
                    to: childId,
                    color: CONFIG.parentChildColor,
                    width: 2,
                    arrows: { to: { enabled: false } },
                    smooth: false // Straight lines for direct parent-child connections
                });
            });
        });
    });
    
    return new vis.DataSet(processedEdges);
}

// Create edges for Link mode - parent-child edges are hidden by default (shown on hover)
function createLinkEdges(relationships, parentPairToChildren) {
    const processedEdges = [];
    let edgeCounter = 0;
    
    relationships.forEach(rel => {
        if (rel.type === 'marriage') {
            processedEdges.push({
                id: `edge_${edgeCounter++}`,
                from: rel.from,
                to: rel.to,
                color: CONFIG.marriageColor,
                width: 3,
                arrows: { to: { enabled: false } },
                smooth: {
                    type: 'curvedCW',
                    roundness: 0.3
                }
            });
        } else if (rel.type !== 'parent-child') {
            processedEdges.push({
                id: `edge_${edgeCounter++}`,
                from: rel.from,
                to: rel.to,
                color: CONFIG.otherRelationColor,
                width: 2,
                dashes: rel.type === 'sibling',
                arrows: { to: { enabled: false } }
            });
        }
    });
    
    // Create direct parent-child edges (one from each parent to each child)
    // By default, these are hidden - they will be shown on hover in link mode
    parentPairToChildren.forEach((family, parentKey) => {
        family.parents.forEach(parentId => {
            family.children.forEach(childId => {
                processedEdges.push({
                    id: `edge_${edgeCounter++}`,
                    from: parentId,
                    to: childId,
                    color: CONFIG.parentChildColor,
                    width: 2,
                    arrows: { to: { enabled: false } },
                    smooth: false, // Straight lines for direct parent-child connections
                    hidden: true, // Hidden by default - shown on hover
                    opacity: 0 // Start invisible
                });
            });
        });
    });
    
    return new vis.DataSet(processedEdges);
}
