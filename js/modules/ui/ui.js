// UI functions

function showPersonDetails(person) {
    const popup = document.getElementById('personPopup');
    const popupContent = document.getElementById('personPopupContent');
    
    if (!person || !AppState.treeData) {
        popup.classList.add('hidden');
        return;
    }
    
    const relationships = AppState.treeData.relationships || [];
    const individuals = AppState.treeData.individuals || [];
    
    // Create a map of individuals by ID for quick lookup
    const personMap = new Map();
    individuals.forEach(p => personMap.set(p.id, p));
    
    // Find marriages for this person
    const marriages = [];
    relationships.forEach(rel => {
        if (rel.type === 'marriage') {
            if (rel.from === person.id) {
                const spouse = personMap.get(rel.to);
                if (spouse) {
                    marriages.push({
                        spouse: spouse,
                        date: spouse.marriageDate || person.marriageDate || null,
                        place: spouse.marriagePlace || person.marriagePlace || null
                    });
                }
            } else if (rel.to === person.id) {
                const spouse = personMap.get(rel.from);
                if (spouse) {
                    marriages.push({
                        spouse: spouse,
                        date: spouse.marriageDate || person.marriageDate || null,
                        place: spouse.marriagePlace || person.marriagePlace || null
                    });
                }
            }
        }
    });
    
    // Sort marriages by date (chronologically)
    marriages.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date);
    });
    
    // Find parents
    const parents = [];
    relationships.forEach(rel => {
        if (rel.type === 'parent-child' && rel.to === person.id) {
            const parent = personMap.get(rel.from);
            if (parent) {
                parents.push(parent);
            }
        }
    });
    
    // Find children
    const children = [];
    relationships.forEach(rel => {
        if (rel.type === 'parent-child' && rel.from === person.id) {
            const child = personMap.get(rel.to);
            if (child) {
                children.push(child);
            }
        }
    });
    
    // Find siblings (people who share the same parents)
    const siblings = [];
    if (parents.length > 0) {
        // Get all parent IDs
        const parentIds = parents.map(p => p.id).sort();
        
        // Find all children of these parents
        relationships.forEach(rel => {
            if (rel.type === 'parent-child') {
                const parent = personMap.get(rel.from);
                if (parent && parentIds.includes(parent.id)) {
                    const child = personMap.get(rel.to);
                    // Add as sibling if it's not the current person
                    if (child && child.id !== person.id) {
                        // Check if this child has all the same parents
                        const childParents = [];
                        relationships.forEach(childRel => {
                            if (childRel.type === 'parent-child' && childRel.to === child.id) {
                                const childParent = personMap.get(childRel.from);
                                if (childParent) {
                                    childParents.push(childParent.id);
                                }
                            }
                        });
                        childParents.sort();
                        
                        // If the child has the same parents, it's a sibling
                        if (childParents.length === parentIds.length && 
                            childParents.every((id, index) => id === parentIds[index])) {
                            // Check if not already added
                            if (!siblings.find(s => s.id === child.id)) {
                                siblings.push(child);
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Sort siblings by birth date if available
    siblings.sort((a, b) => {
        if (!a.birthDate && !b.birthDate) return 0;
        if (!a.birthDate) return 1;
        if (!b.birthDate) return -1;
        return a.birthDate.localeCompare(b.birthDate);
    });
    
    // Build HTML using template helper
    const html = createPersonPopupHTML(person, marriages, parents, children, siblings);
    popupContent.innerHTML = html;
    popup.classList.remove('hidden');
}

function hidePersonDetails() {
    const popup = document.getElementById('personPopup');
    popup.classList.add('hidden');
}

function updateStats(data) {
    document.getElementById('individualCount').textContent = (data.individuals || []).length;
    document.getElementById('relationshipCount').textContent = (data.relationships || []).length;
    const planches = Object.keys(data.planches || {});
    document.getElementById('plancheCount').textContent = planches.length;
}

function showError(message) {
    const errorEl = document.getElementById('error');
    const loadingEl = document.getElementById('loading');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
    loadingEl.classList.add('hidden');
}

function showLoading() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    if (loadingEl) {
        loadingEl.classList.remove('hidden');
    }
    if (errorEl) {
        errorEl.classList.add('hidden');
    }
    // Don't show progress bar by default - only show it explicitly in buildLinkTree
    const progressBarContainer = document.getElementById('progressBarContainer');
    if (progressBarContainer && !progressBarContainer.classList.contains('link-mode-progress')) {
        progressBarContainer.classList.add('hidden');
    }
}

function hideLoading() {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.classList.add('hidden');
    }
    // Also hide progress bar when hiding loading (but preserve link-mode-progress flag for next time)
    const progressBarContainer = document.getElementById('progressBarContainer');
    if (progressBarContainer) {
        progressBarContainer.classList.add('hidden');
    }
}

