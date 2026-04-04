// Search functionality for finding individuals

function findAncestors(personId, relationships, allIndividuals) {
    // Find all ancestors (parents, grandparents, great-grandparents, etc.) of a person
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

function searchIndividuals(query, individuals) {
    // Debug: Log search parameters
    if (!individuals || !Array.isArray(individuals)) {
        console.error('[searchIndividuals] Invalid individuals array:', individuals);
        return [];
    }
    
    const searchTerm = query ? query.trim() : '';
    
    // Normalize search term: remove extra spaces, accents, commas, etc.
    const normalizeString = (str) => {
        if (!str) return '';
        return str.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove accents
            .replace(/[,;]/g, ' ') // Replace commas and semicolons with spaces
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();
    };
    
    // Split name into searchable parts (handles commas, spaces, etc.)
    const splitNameIntoParts = (name) => {
        if (!name) return [];
        return normalizeString(name)
            .split(/\s+/)
            .filter(part => part.length > 0);
    };
    
    const normalizedSearchTerm = normalizeString(searchTerm);
    const searchWords = normalizedSearchTerm.split(/\s+/).filter(w => w.length > 0);
    
    let results = [];
    
    // Debug: Log search start
    if (searchTerm) {
        console.log('[searchIndividuals] Searching for:', searchTerm, 'in', individuals.length, 'individuals');
    }
    
    if (normalizedSearchTerm.length === 0) {
        // No query: return first 50 individuals, sorted alphabetically (for initial display)
        results = [...individuals].sort((a, b) => {
            const aName = (a.fullName || `${a.firstName || ''} ${a.lastName || ''}`).toLowerCase();
            const bName = (b.fullName || `${b.firstName || ''} ${b.lastName || ''}`).toLowerCase();
            return aName.localeCompare(bName);
        }).slice(0, 50);
    } else {
        // Search through all individuals
        individuals.forEach(person => {
            const fullName = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim();
            const firstName = (person.firstName || '').trim();
            const lastName = (person.lastName || '').trim();
            const id = (person.id || '').trim();
            
            // Normalize all name variations
            const normalizedFullName = normalizeString(fullName);
            const normalizedFirstName = normalizeString(firstName);
            const normalizedLastName = normalizeString(lastName);
            const normalizedId = normalizeString(id);
            
            // Split names into parts for more flexible matching
            const fullNameParts = splitNameIntoParts(fullName);
            const firstNameParts = splitNameIntoParts(firstName);
            const lastNameParts = splitNameIntoParts(lastName);
            const allNameParts = [...new Set([...fullNameParts, ...firstNameParts, ...lastNameParts])];
            
            // Create search variations
            const firstNameLastName = normalizeString(`${firstName} ${lastName}`);
            const lastNameFirstName = normalizeString(`${lastName} ${firstName}`);
            
            let matches = false;
            
            // If only one character, filter by first letter
            if (normalizedSearchTerm.length === 1) {
                matches = normalizedFullName.startsWith(normalizedSearchTerm) || 
                         normalizedFirstName.startsWith(normalizedSearchTerm) || 
                         normalizedLastName.startsWith(normalizedSearchTerm) ||
                         normalizedId.startsWith(normalizedSearchTerm) ||
                         allNameParts.some(part => part.startsWith(normalizedSearchTerm));
            } else {
                // Multiple characters: comprehensive search
                // 1. Direct string matching
                matches = normalizedFullName.includes(normalizedSearchTerm) || 
                         normalizedFirstName.includes(normalizedSearchTerm) || 
                         normalizedLastName.includes(normalizedSearchTerm) ||
                         normalizedId.includes(normalizedSearchTerm) ||
                         firstNameLastName.includes(normalizedSearchTerm) ||
                         lastNameFirstName.includes(normalizedSearchTerm);
                
                // 2. Check if all search words are found in any name parts
                if (!matches && searchWords.length > 0) {
                    const allWordsFound = searchWords.every(searchWord => 
                        normalizedFullName.includes(searchWord) || 
                        normalizedFirstName.includes(searchWord) || 
                        normalizedLastName.includes(searchWord) ||
                        allNameParts.some(part => part.includes(searchWord))
                    );
                    if (allWordsFound) {
                        matches = true;
                    }
                }
                
                // 3. Check if search term matches any individual name part
                if (!matches) {
                    matches = allNameParts.some(part => part.includes(normalizedSearchTerm));
                }
            }
            
            if (matches) {
                results.push(person);
            }
        });
        
        // Sort by relevance (exact matches first, then by name)
        results.sort((a, b) => {
            const aName = normalizeString(a.fullName || `${a.firstName || ''} ${a.lastName || ''}`);
            const bName = normalizeString(b.fullName || `${b.firstName || ''} ${b.lastName || ''}`);
            
            // Exact match is best
            const aExact = aName === normalizedSearchTerm;
            const bExact = bName === normalizedSearchTerm;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            
            // Starts with search term is second best
            const aStarts = aName.startsWith(normalizedSearchTerm);
            const bStarts = bName.startsWith(normalizedSearchTerm);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            
            // Then sort alphabetically
            return aName.localeCompare(bName);
        });
    }
    
    return results; // Return all results (no limit)
}

function displaySearchResults(results, onSelect) {
    const resultsDiv = document.getElementById('searchResults');
    
    if (results.length === 0) {
        resultsDiv.innerHTML = '<div class="search-result-item">Aucun résultat</div>';
        resultsDiv.classList.add('active');
        return;
    }
    
    resultsDiv.innerHTML = results.map(person => createSearchResultItemHTML(person)).join('');
    
    // Add click handlers
    resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const personId = item.getAttribute('data-person-id');
            const person = results.find(p => p.id === personId);
            if (person && onSelect) {
                onSelect(person);
            }
        });
    });
    
    resultsDiv.classList.add('active');
}

function hideSearchResults() {
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.classList.remove('active');
}

