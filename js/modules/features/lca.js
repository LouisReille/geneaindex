// Find Lowest Common Ancestor (LCA) between two individuals

/**
 * Find all ancestors of a person (including the person themselves)
 * @param {string} personId - The person's ID
 * @param {Array} relationships - All relationships
 * @returns {Set} Set of all ancestor IDs including the person
 */
function findAllAncestors(personId, relationships) {
    const ancestors = new Set([personId]);
    const toProcess = [personId];
    const processed = new Set();
    
    while (toProcess.length > 0) {
        const currentId = toProcess.shift();
        if (processed.has(currentId)) continue;
        processed.add(currentId);
        
        // Find parents of current person
        relationships.forEach(rel => {
            if (rel.type === 'parent-child' && rel.to === currentId) {
                const parentId = rel.from;
                if (!ancestors.has(parentId)) {
                    ancestors.add(parentId);
                    toProcess.push(parentId);
                }
            }
        });
    }
    
    return ancestors;
}

/**
 * Find the path from a person to a specific ancestor
 * @param {string} personId - Starting person ID
 * @param {string} targetAncestorId - Target ancestor ID
 * @param {Array} relationships - All relationships
 * @returns {Array|null} Array of person IDs from personId to targetAncestorId, or null if no path exists
 */
function findPathToAncestor(personId, targetAncestorId, relationships) {
    if (personId === targetAncestorId) {
        return [personId];
    }
    
    // Build child -> parents mapping for all relationships
    const childToParents = new Map();
    relationships.forEach(rel => {
        if (rel.type === 'parent-child') {
            if (!childToParents.has(rel.to)) {
                childToParents.set(rel.to, []);
            }
            childToParents.get(rel.to).push(rel.from);
        }
    });
    
    // BFS to find path
    const queue = [[personId, [personId]]];
    const visited = new Set([personId]);
    
    while (queue.length > 0) {
        const [currentId, path] = queue.shift();
        
        const parents = childToParents.get(currentId) || [];
        for (const parentId of parents) {
            if (parentId === targetAncestorId) {
                return [...path, parentId];
            }
            
            if (!visited.has(parentId)) {
                visited.add(parentId);
                queue.push([parentId, [...path, parentId]]);
            }
        }
    }
    
    return null;
}

/**
 * Find the Lowest Common Ancestor (LCA) between two individuals
 * The LCA is the most recent (closest) common ancestor
 * @param {string} person1Id - First person's ID
 * @param {string} person2Id - Second person's ID
 * @param {Array} relationships - All relationships
 * @param {Array} individuals - All individuals (for getting generation/level info)
 * @returns {Object|null} Object with {lcaId, path1, path2, distance} or null if no common ancestor
 */
function findLCA(person1Id, person2Id, relationships, individuals) {
    if (!person1Id || !person2Id || person1Id === person2Id) {
        return null;
    }
    
    // Find all ancestors of both persons
    const ancestors1 = findAllAncestors(person1Id, relationships);
    const ancestors2 = findAllAncestors(person2Id, relationships);
    
    // Find common ancestors
    const commonAncestors = new Set();
    ancestors1.forEach(ancestor => {
        if (ancestors2.has(ancestor)) {
            commonAncestors.add(ancestor);
        }
    });
    
    if (commonAncestors.size === 0) {
        return null; // No common ancestor
    }
    
    // Find the LCA (most recent = highest generation number = lowest level)
    // In genealogy, lower level numbers = older generations, higher = newer
    // So we want the ancestor with the HIGHEST level number (most recent)
    let lcaId = null;
    let maxLevel = -Infinity;
    
    // Create a map of person ID to level for quick lookup
    const personToLevel = new Map();
    individuals.forEach(person => {
        personToLevel.set(person.id, person.generation || 0);
    });
    
    commonAncestors.forEach(ancestorId => {
        const level = personToLevel.get(ancestorId) || 0;
        if (level > maxLevel) {
            maxLevel = level;
            lcaId = ancestorId;
        }
    });
    
    if (!lcaId) {
        return null;
    }
    
    // Find paths from both persons to the LCA
    const path1 = findPathToAncestor(person1Id, lcaId, relationships);
    const path2 = findPathToAncestor(person2Id, lcaId, relationships);
    
    if (!path1 || !path2) {
        return null;
    }
    
    // Calculate distance (number of generations from each person to LCA)
    const distance1 = path1.length - 1;
    const distance2 = path2.length - 1;
    
    return {
        lcaId: lcaId,
        path1: path1,
        path2: path2,
        distance1: distance1,
        distance2: distance2,
        totalDistance: distance1 + distance2
    };
}

/**
 * Carte enfant → parents (tous les liens parent–enfant).
 */
function buildChildToParentsMap(relationships) {
    const m = new Map();
    (relationships || []).forEach((rel) => {
        if (rel.type === 'parent-child') {
            if (!m.has(rel.to)) m.set(rel.to, []);
            const arr = m.get(rel.to);
            if (!arr.includes(rel.from)) arr.push(rel.from);
        }
    });
    return m;
}

/**
 * Pour chaque maillon d’un chemin vers l’A.C., ajoute l’autre parent (co-parent) s’il existe.
 */
function collectCoParentIdsForLCAPaths(path1, path2, childToParents) {
    const extra = new Set();
    function addForPath(path) {
        if (!path || path.length < 2) return;
        for (let j = 1; j < path.length; j++) {
            const child = path[j - 1];
            const parentOnPath = path[j];
            const parents = childToParents.get(child) || [];
            parents.forEach((p) => {
                if (p !== parentOnPath) extra.add(p);
            });
        }
    }
    addForPath(path1);
    addForPath(path2);
    return extra;
}
