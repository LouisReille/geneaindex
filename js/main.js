// Main entry point - orchestrates the application

/** Incrémenté à chaque rebuild descendants : annule les builds obsolètes (ex. changement rapide du select). */
let descendantsBuildGeneration = 0;

/** Incrémenté à chaque rebuild nom de famille : évite d’afficher un graphe périmé si l’utilisateur change vite. */
let familyNameBuildGeneration = 0;

/** Nombre maximum de générations descendantes (enfants → petits-enfants → arrière-petits-enfants). Pas plus loin. */
const DESCENDANTS_MAX_GENERATIONS = 3;

const MENU_GRAPH_KEYS = ['tree', 'descendants', 'link', 'lca', 'family'];

function persistMenuGraph(menuKey) {
    if (!MENU_GRAPH_KEYS.includes(menuKey)) return;
    if (menuKey === 'link' && AppState.linkTreeLoading) return;
    if (!AppState.nodes || !AppState.edges) return;
    const entry = {
        nodes: AppState.nodes,
        edges: AppState.edges,
        positions: AppState.positions && typeof AppState.positions === 'object' ? AppState.positions : {},
        rootPersonId: AppState.rootPersonId
    };
    if (menuKey === 'descendants') {
        entry.descendantsRootId = AppState.descendantsRootId;
        entry.descendantsMaxGenerations = DESCENDANTS_MAX_GENERATIONS;
        const del = document.getElementById('descendantsPersonSearch');
        entry.descendantsSearchDisplay = del ? del.value : '';
    }
    if (menuKey === 'tree') {
        const pel = document.getElementById('personSearch');
        entry.personSearchDisplay = pel ? pel.value : '';
    }
    if (menuKey === 'lca') {
        entry.lcaPerson1Id = typeof lcaPerson1 !== 'undefined' && lcaPerson1 ? lcaPerson1.id : null;
        entry.lcaPerson2Id = typeof lcaPerson2 !== 'undefined' && lcaPerson2 ? lcaPerson2.id : null;
    }
    if (menuKey === 'family') {
        entry.familyName = typeof selectedFamilyName !== 'undefined' ? selectedFamilyName : null;
    }
    AppState.menuGraphCache[menuKey] = entry;
}

function restoreMenuGraph(menuKey) {
    if (!MENU_GRAPH_KEYS.includes(menuKey)) {
        AppState.nodes = null;
        AppState.edges = null;
        AppState.positions = null;
        return false;
    }
    const slot = AppState.menuGraphCache[menuKey];
    if (slot && slot.nodes && slot.edges) {
        AppState.nodes = slot.nodes;
        AppState.edges = slot.edges;
        AppState.positions = slot.positions || {};
        AppState.rootPersonId = slot.rootPersonId != null ? slot.rootPersonId : null;
        if (menuKey === 'descendants') {
            AppState.descendantsRootId = slot.descendantsRootId != null ? slot.descendantsRootId : null;
            AppState.descendantsMaxGenerations = DESCENDANTS_MAX_GENERATIONS;
        } else {
            AppState.descendantsRootId = null;
        }
        return true;
    }
    AppState.nodes = null;
    AppState.edges = null;
    AppState.positions = null;
    AppState.descendantsRootId = null;
    return false;
}

function loadTreeData(data) {
    AppState.treeData = data;
    AppState.menuGraphCache = {
        tree: null,
        descendants: null,
        link: null,
        lca: null,
        family: null
    };
    AppState.linkTreeBuilt = false;
    AppState.linkTreeLoading = false;
    showLoading();
    
    try {
        // Show search wrappers after data is loaded (will be shown/hidden based on menu)
        // Don't build tree automatically - wait for user to search
        hideLoading();
        
        // Debug: Log data structure
        console.log('[loadTreeData] Data structure:', {
            hasIndividuals: !!data.individuals,
            individualsCount: data.individuals ? data.individuals.length : 0,
            hasMetadata: !!data.metadata,
            metadataTotal: data.metadata ? data.metadata.totalIndividuals : 'N/A',
            sampleIndividual: data.individuals && data.individuals.length > 0 ? {
                id: data.individuals[0].id,
                firstName: data.individuals[0].firstName,
                lastName: data.individuals[0].lastName,
                fullName: data.individuals[0].fullName
            } : null
        });
        
        // Setup search functionality for all modes
        setupSearch(data);
        setupLinkSearch(data);
        setupLCASearch(data);
        setupFamilyNameSearch(data);
        setupDescendantsSearch(data);
    } catch (error) {
        showError('Erreur de chargement des données : ' + error.message);
        console.error(error);
    }
}

function buildTree(data, rootPersonId) {
    if (!rootPersonId) {
        // Clear the tree if no root person selected
        if (AppState.network) {
            AppState.network.destroy();
            AppState.network = null;
        }
        document.getElementById('tree-container').innerHTML = '';
        document.getElementById('generation-grid').innerHTML = '';
        AppState.rootPersonId = null;
        AppState.positions = null;
        return;
    }
    
    showLoading();
    
    try {
        const individuals = data.individuals || [];
        const relationships = data.relationships || [];
        
        // Recursively find the selected person and ALL their ancestors (parents, grandparents, etc.)
        const peopleToShow = new Set([rootPersonId]);
        const toProcess = [rootPersonId];
        const processed = new Set();
        
        // Recursively find all ancestors
        while (toProcess.length > 0) {
            const currentId = toProcess.shift();
            if (processed.has(currentId)) continue;
            processed.add(currentId);
            
            // Find parents of current person
            relationships.forEach(rel => {
                if (rel.type === 'parent-child' && rel.to === currentId) {
                    if (!peopleToShow.has(rel.from)) {
                        peopleToShow.add(rel.from);
                        toProcess.push(rel.from); // Process this parent's parents too
                    }
                }
            });
        }
        
        // Only include the selected person and all their ancestors
        const filteredIndividuals = individuals.filter(person => peopleToShow.has(person.id));
        
        const filteredRelationships = relationships.filter(rel => {
            // Include relationships where both people are in the tree
            if (rel.type === 'marriage') {
                return peopleToShow.has(rel.from) && peopleToShow.has(rel.to);
            } else if (rel.type === 'parent-child') {
                // Include parent-child relationships where both parent and child are in the tree
                return peopleToShow.has(rel.from) && peopleToShow.has(rel.to);
            }
            return peopleToShow.has(rel.from) && peopleToShow.has(rel.to);
        });
        
        // Process filtered data
        const { nodeLevels, marriages } = calculateLevels(filteredIndividuals, filteredRelationships);
        const { coupleGroups, personToCoupleGroup } = groupCouples(filteredRelationships);
        const parentPairToChildren = groupParentChildren(filteredRelationships, marriages);
        
        // Create nodes and edges
        AppState.nodes = createNodes(filteredIndividuals, nodeLevels, personToCoupleGroup);
        AppState.edges = createEdges(filteredRelationships, parentPairToChildren);
        
        // Calculate positions FIRST (before creating network)
        const { positions, generationYRange, generationYears, generationNumbers } =
            calculateAncestorPositions(AppState.nodes, coupleGroups, personToCoupleGroup, parentPairToChildren, rootPersonId);
        
        // Store root person ID and positions
        AppState.rootPersonId = rootPersonId;
        AppState.positions = positions;
        
        // Create network with pre-calculated positions (no generation grid)
        createNetwork(AppState.nodes, AppState.edges, positions);
        persistMenuGraph('tree');
        
        hideLoading();
    } catch (error) {
        showError('Erreur lors de la construction de l’arbre : ' + error.message);
        console.error(error);
        hideLoading();
    }
}

/** Descendants par BFS parent→enfant uniquement (pas de fermeture mariage : elle serait transitive sur tout le graphe). */
function collectDescendantPersonIds(rootPersonId, maxGenerations, relationships) {
    const queue = [[rootPersonId, 0]];
    const ids = new Set([rootPersonId]);
    while (queue.length > 0) {
        const [id, depth] = queue.shift();
        if (depth >= maxGenerations) continue;
        relationships.forEach((rel) => {
            if (rel.type === 'parent-child' && rel.from === id && !ids.has(rel.to)) {
                ids.add(rel.to);
                queue.push([rel.to, depth + 1]);
            }
        });
    }
    return ids;
}

/** Parents, grands-parents, etc. (remontée) sur `depthUp` niveaux depuis `personId`. */
function collectAncestorPersonIds(personId, depthUp, relationships) {
    const out = new Set();
    let frontier = new Set([personId]);
    for (let d = 0; d < depthUp; d++) {
        const next = new Set();
        frontier.forEach((id) => {
            relationships.forEach((rel) => {
                if (rel.type === 'parent-child' && rel.to === id) {
                    const p = rel.from;
                    if (!out.has(p)) out.add(p);
                    next.add(p);
                }
            });
        });
        frontier = next;
        if (next.size === 0) break;
    }
    return out;
}

/**
 * Remonte les parent→enfant depuis la racine : profondeur 0 = racine, 1 = enfants, etc.
 * Garde uniquement les ids dont la profondeur descendant max ≤ maxDepth (hors racine non concernée).
 */
function pruneDescendantsBeyondDepth(rootPersonId, ids, relationships, maxDepth) {
    const depthMap = new Map([[rootPersonId, 0]]);
    const queue = [rootPersonId];
    let qi = 0;
    while (qi < queue.length) {
        const id = queue[qi++];
        const d = depthMap.get(id);
        if (d >= maxDepth) continue;
        relationships.forEach((rel) => {
            if (rel.type === 'parent-child' && rel.from === id && !depthMap.has(rel.to)) {
                depthMap.set(rel.to, d + 1);
                queue.push(rel.to);
            }
        });
    }
    const toRemove = [];
    ids.forEach((id) => {
        if (id === rootPersonId) return;
        if (!depthMap.has(id)) return;
        if (depthMap.get(id) > maxDepth) toRemove.push(id);
    });
    toRemove.forEach((id) => ids.delete(id));
}

/**
 * Descendants (max générations) + parents (1 génération au-dessus) pour remonter sans être bloqué.
 * Conjoints : une seule passe, uniquement si l’autre extrémité est dans le noyau (descendants BFS ∪ ancêtres).
 * Pas de fermeture transitive des mariages (sinon composante géante → chargement infini / crash mémoire).
 */
function collectDescendantsViewPersonIds(rootPersonId, maxGenerations, relationships) {
    const maxGen = Math.min(DESCENDANTS_MAX_GENERATIONS, Math.max(1, Number(maxGenerations) || DESCENDANTS_MAX_GENERATIONS));
    const down = collectDescendantPersonIds(rootPersonId, maxGen, relationships);
    const up = collectAncestorPersonIds(rootPersonId, 1, relationships);
    const base = new Set(down);
    up.forEach((id) => base.add(id));
    const ids = new Set(base);
    relationships.forEach((rel) => {
        if (rel.type !== 'marriage') return;
        const a = rel.from;
        const b = rel.to;
        if (base.has(a) && !ids.has(b)) ids.add(b);
        else if (base.has(b) && !ids.has(a)) ids.add(a);
    });
    pruneDescendantsBeyondDepth(rootPersonId, ids, relationships, maxGen);
    return ids;
}

function buildDescendantsTree(data, rootPersonId, maxGenerations) {
    if (!rootPersonId) {
        descendantsBuildGeneration += 1;
        if (AppState.network) {
            AppState.network.destroy();
            AppState.network = null;
        }
        document.getElementById('tree-container').innerHTML = '';
        const genGrid = document.getElementById('generation-grid');
        if (genGrid) genGrid.innerHTML = '';
        AppState.rootPersonId = null;
        AppState.descendantsRootId = null;
        AppState.positions = null;
        return;
    }

    const n = DESCENDANTS_MAX_GENERATIONS;
    AppState.descendantsMaxGenerations = n;
    AppState.descendantsRootId = rootPersonId;

    descendantsBuildGeneration += 1;
    const buildId = descendantsBuildGeneration;

    showLoading();

    (async () => {
        try {
            await new Promise((r) => requestAnimationFrame(r));
            if (buildId !== descendantsBuildGeneration) return;

            if (AppState.network && !(AppState.currentMenu === 'link' && AppState.linkTreeBuilt)) {
                AppState.network.destroy();
                AppState.network = null;
            }
            await new Promise((r) => setTimeout(r, 0));
            if (buildId !== descendantsBuildGeneration) return;

            const individuals = data.individuals || [];
            const relationships = data.relationships || [];
            const peopleToShow = collectDescendantsViewPersonIds(rootPersonId, n, relationships);

            const filteredIndividuals = individuals.filter((person) => peopleToShow.has(person.id));
            const filteredRelationships = relationships.filter((rel) => {
                if (rel.type === 'marriage') {
                    return peopleToShow.has(rel.from) && peopleToShow.has(rel.to);
                }
                if (rel.type === 'parent-child') {
                    return peopleToShow.has(rel.from) && peopleToShow.has(rel.to);
                }
                return peopleToShow.has(rel.from) && peopleToShow.has(rel.to);
            });

            await new Promise((r) => setTimeout(r, 0));
            if (buildId !== descendantsBuildGeneration) return;

            const { nodeLevels, marriages } = calculateLevels(filteredIndividuals, filteredRelationships);
            const { coupleGroups, personToCoupleGroup } = groupCouples(filteredRelationships);
            const parentPairToChildren = groupParentChildren(filteredRelationships, marriages);

            await new Promise((r) => setTimeout(r, 0));
            if (buildId !== descendantsBuildGeneration) return;

            AppState.nodes = createNodes(filteredIndividuals, nodeLevels, personToCoupleGroup);
            AppState.edges = createEdges(filteredRelationships, parentPairToChildren);

            await new Promise((r) => setTimeout(r, 0));
            if (buildId !== descendantsBuildGeneration) return;

            const { positions } = calculateDescendantPositions(
                AppState.nodes,
                coupleGroups,
                personToCoupleGroup,
                parentPairToChildren,
                rootPersonId,
                n,
                null
            );

            AppState.rootPersonId = rootPersonId;
            AppState.positions = positions;

            const dInp = document.getElementById('descendantsPersonSearch');
            if (dInp) {
                const p = individuals.find((x) => x.id === rootPersonId);
                if (p) {
                    dInp.value = p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim();
                }
            }

            if (buildId !== descendantsBuildGeneration) return;
            createNetwork(AppState.nodes, AppState.edges, positions);
            persistMenuGraph('descendants');
        } catch (error) {
            if (buildId === descendantsBuildGeneration) {
                showError('Erreur (descendants) : ' + error.message);
                console.error(error);
            }
        } finally {
            if (buildId === descendantsBuildGeneration) {
                hideLoading();
            }
        }
    })();
}

function setupSearch(data) {
    const searchInput = document.getElementById('personSearch');
    const individuals = data.individuals || [];
    let searchTimeout = null;
    
    // Clear input when clicking on search bar (if it has text)
    searchInput.addEventListener('click', () => {
        if (searchInput.value) {
            searchInput.value = '';
            searchInput.focus();
            // Show all results when cleared
            const results = searchIndividuals('', individuals);
            displaySearchResults(results, (person) => {
                searchInput.value = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim();
                hideSearchResults();
                buildTree(data, person.id);
            });
        }
    });
    
    // Show initial list when clicking on search bar
    searchInput.addEventListener('focus', () => {
        const query = searchInput.value;
        const results = searchIndividuals(query, individuals);
        displaySearchResults(results, (person) => {
            // User selected a person - build tree with that person as root
            searchInput.value = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim();
            hideSearchResults();
            buildTree(data, person.id);
        });
    });
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        
        clearTimeout(searchTimeout);
        
        // Show results immediately (no minimum length requirement)
        searchTimeout = setTimeout(() => {
            const results = searchIndividuals(query, individuals);
            displaySearchResults(results, (person) => {
                // User selected a person - build tree with that person as root
                searchInput.value = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim();
                hideSearchResults();
                buildTree(data, person.id);
            });
        }, 100);
    });
    
    // Hide results when clicking outside (only for tree search)
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#searchWrapper')) {
            hideSearchResults();
        }
    });
    
    // Handle escape key
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideSearchResults();
        }
    });
}

function displayDescendantsSearchResults(results, onSelect) {
    const resultsDiv = document.getElementById('descendantsSearchResults');
    if (!resultsDiv) return;
    if (results.length === 0) {
        resultsDiv.innerHTML = '<div class="search-result-item">Aucun résultat</div>';
        resultsDiv.classList.add('active');
        return;
    }
    resultsDiv.innerHTML = results.map((person) => createSearchResultItemHTML(person)).join('');
    resultsDiv.querySelectorAll('.search-result-item').forEach((item) => {
        item.addEventListener('click', () => {
            const personId = item.getAttribute('data-person-id');
            const person = results.find((p) => p.id === personId);
            if (person && onSelect) onSelect(person);
        });
    });
    resultsDiv.classList.add('active');
}

function hideDescendantsSearchResults() {
    const resultsDiv = document.getElementById('descendantsSearchResults');
    if (resultsDiv) resultsDiv.classList.remove('active');
}

function setupDescendantsSearch(data) {
    const searchInput = document.getElementById('descendantsPersonSearch');
    if (!searchInput) return;

    const individuals = data.individuals || [];
    let searchTimeout = null;

    const runBuild = (personId) => {
        if (!personId || !AppState.treeData) return;
        buildDescendantsTree(AppState.treeData, personId, DESCENDANTS_MAX_GENERATIONS);
    };

    const onPick = (person) => {
        searchInput.value = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim();
        hideDescendantsSearchResults();
        runBuild(person.id);
    };

    searchInput.addEventListener('click', () => {
        if (searchInput.value) {
            searchInput.value = '';
            searchInput.focus();
            const results = searchIndividuals('', individuals);
            displayDescendantsSearchResults(results, onPick);
        }
    });

    searchInput.addEventListener('focus', () => {
        const results = searchIndividuals(searchInput.value, individuals);
        displayDescendantsSearchResults(results, onPick);
    });

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const results = searchIndividuals(e.target.value, individuals);
            displayDescendantsSearchResults(results, onPick);
        }, 100);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#descendantsSearchWrapper')) {
            hideDescendantsSearchResults();
        }
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideDescendantsSearchResults();
    });

}

function displayLinkSearchResults(results, onSelect) {
    const resultsDiv = document.getElementById('linkSearchResults');
    
    if (results.length === 0) {
        resultsDiv.innerHTML = '<div class="search-result-item">Aucun résultat</div>';
        resultsDiv.classList.add('active');
        return;
    }
    
    // Show count if there are many results
    let headerHTML = '';
    if (results.length > 20) {
        headerHTML = `<div class="search-result-header" style="padding: 0.5rem 1rem; background: #f8f9fa; border-bottom: 1px solid #ddd; font-size: 0.85rem; color: #666;">
            ${results.length} results found
        </div>`;
    }
    
    resultsDiv.innerHTML = headerHTML + results.map(person => createSearchResultItemHTML(person)).join('');
    
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

function hideLinkSearchResults() {
    const resultsDiv = document.getElementById('linkSearchResults');
    resultsDiv.classList.remove('active');
}

function setupLinkSearch(data) {
    const searchInput = document.getElementById('linkPersonSearch');
    const individuals = data.individuals || [];
    console.log('[setupLinkSearch] Total individuals available:', individuals.length);
    console.log('[setupLinkSearch] Metadata totalIndividuals:', data.metadata ? data.metadata.totalIndividuals : 'N/A');
    console.log('[setupLinkSearch] Match check:', individuals.length === (data.metadata ? data.metadata.totalIndividuals : -1) ? '✓ Match' : '✗ Mismatch!');
    
    // Verify we have all individuals
    if (data.metadata && individuals.length !== data.metadata.totalIndividuals) {
        console.warn('[setupLinkSearch] WARNING: individuals array length does not match metadata.totalIndividuals!');
        console.warn('[setupLinkSearch] Expected:', data.metadata.totalIndividuals, 'Got:', individuals.length);
    }
    
    let searchTimeout = null;
    
    // Clear input when clicking on search bar (if it has text)
    searchInput.addEventListener('click', () => {
        if (searchInput.value) {
            searchInput.value = '';
            searchInput.focus();
            // Show all results when cleared
            const results = searchIndividuals('', individuals);
            displayLinkSearchResults(results, (person) => {
                searchInput.value = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim();
                hideLinkSearchResults();
                centerAndZoomOnPerson(person.id);
            });
        }
    });
    
    // Show initial list when clicking on search bar
    searchInput.addEventListener('focus', () => {
        const query = searchInput.value;
        const results = searchIndividuals(query, individuals);
        displayLinkSearchResults(results, (person) => {
            // User selected a person - center and zoom on that person
            searchInput.value = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim();
            hideLinkSearchResults();
            centerAndZoomOnPerson(person.id);
        });
    });
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        
        clearTimeout(searchTimeout);
        
        // Show results immediately (no minimum length requirement)
        searchTimeout = setTimeout(() => {
            const results = searchIndividuals(query, individuals);
            console.log('[setupLinkSearch] Query:', query, 'Results:', results.length, 'out of', individuals.length);
            if (query && results.length === 0) {
                console.log('[setupLinkSearch] No results found for:', query);
                // Debug: show first few individuals to check data structure
                console.log('[setupLinkSearch] Sample individuals:', individuals.slice(0, 5).map(p => ({
                    id: p.id,
                    firstName: p.firstName,
                    lastName: p.lastName,
                    fullName: p.fullName
                })));
            }
            displayLinkSearchResults(results, (person) => {
                // User selected a person - center and zoom on that person
                searchInput.value = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim();
                hideLinkSearchResults();
                centerAndZoomOnPerson(person.id);
            });
        }, 100);
    });
    
    // Hide results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#linkSearchWrapper')) {
            hideLinkSearchResults();
        }
    });
    
    // Handle escape key
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideLinkSearchResults();
        }
    });
}

// LCA (Lowest Common Ancestor) functionality
let lcaPerson1 = null;
let lcaPerson2 = null;

function setupLCASearch(data) {
    const searchInput1 = document.getElementById('lcaPerson1Search');
    const searchInput2 = document.getElementById('lcaPerson2Search');
    const individuals = data.individuals || [];
    let searchTimeout1 = null;
    let searchTimeout2 = null;
    
    // Setup search for person 1
    if (searchInput1) {
        searchInput1.addEventListener('input', (e) => {
            const query = e.target.value;
            clearTimeout(searchTimeout1);
            searchTimeout1 = setTimeout(() => {
                const results = searchIndividuals(query, individuals);
                displayLCASearchResults('lcaPerson1Results', results, (person) => {
                    searchInput1.value = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim();
                    hideLCASearchResults('lcaPerson1Results');
                    lcaPerson1 = person;
                    checkAndBuildLCA(data);
                });
            }, 100);
        });
        
        searchInput1.addEventListener('focus', () => {
            const query = searchInput1.value;
            const results = searchIndividuals(query, individuals);
            displayLCASearchResults('lcaPerson1Results', results, (person) => {
                searchInput1.value = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim();
                hideLCASearchResults('lcaPerson1Results');
                lcaPerson1 = person;
                checkAndBuildLCA(data);
            });
        });
    }
    
    // Setup search for person 2
    if (searchInput2) {
        searchInput2.addEventListener('input', (e) => {
            const query = e.target.value;
            clearTimeout(searchTimeout2);
            searchTimeout2 = setTimeout(() => {
                const results = searchIndividuals(query, individuals);
                displayLCASearchResults('lcaPerson2Results', results, (person) => {
                    searchInput2.value = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim();
                    hideLCASearchResults('lcaPerson2Results');
                    lcaPerson2 = person;
                    checkAndBuildLCA(data);
                });
            }, 100);
        });
        
        searchInput2.addEventListener('focus', () => {
            const query = searchInput2.value;
            const results = searchIndividuals(query, individuals);
            displayLCASearchResults('lcaPerson2Results', results, (person) => {
                searchInput2.value = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim();
                hideLCASearchResults('lcaPerson2Results');
                lcaPerson2 = person;
                checkAndBuildLCA(data);
            });
        });
    }
    
    // Hide results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#lcaSearchWrapper')) {
            hideLCASearchResults('lcaPerson1Results');
            hideLCASearchResults('lcaPerson2Results');
        }
    });
}

function displayLCASearchResults(resultsId, results, onSelect) {
    const resultsDiv = document.getElementById(resultsId);
    if (!resultsDiv) return;
    
    if (results.length === 0) {
        resultsDiv.innerHTML = '<div class="search-result-item">Aucun résultat</div>';
        resultsDiv.classList.add('active');
        return;
    }
    
    resultsDiv.innerHTML = results.map(person => createSearchResultItemHTML(person)).join('');
    
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

function hideLCASearchResults(resultsId) {
    const resultsDiv = document.getElementById(resultsId);
    if (resultsDiv) {
        resultsDiv.classList.remove('active');
    }
}

function checkAndBuildLCA(data) {
    if (lcaPerson1 && lcaPerson2) {
        buildLCATree(data, lcaPerson1.id, lcaPerson2.id);
    }
}

function escapeHtmlText(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function personDisplayNameForLca(person) {
    if (!person) return '';
    const s = (person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim()).trim();
    return s || person.id;
}

function generationsCountFr(n) {
    const k = Math.floor(Math.abs(Number(n))) || 0;
    if (k <= 1) return `${k} génération`;
    return `${k} générations`;
}

/** Parents des enfants situés juste sous l’A.C. sur chaque branche (couple à cette génération). */
function getLcaGenerationAncestorIds(path1, path2, lcaId, childToParents, individuals) {
    const ids = new Set();
    if (path1.length >= 2) {
        (childToParents.get(path1[path1.length - 2]) || []).forEach((id) => ids.add(id));
    }
    if (path2.length >= 2) {
        (childToParents.get(path2[path2.length - 2]) || []).forEach((id) => ids.add(id));
    }
    if (!ids.has(lcaId)) ids.add(lcaId);
    const arr = Array.from(ids);
    arr.sort((a, b) => {
        if (a === lcaId) return -1;
        if (b === lcaId) return 1;
        const na = personDisplayNameForLca(individuals.find((x) => x.id === a));
        const nb = personDisplayNameForLca(individuals.find((x) => x.id === b));
        return na.localeCompare(nb, 'fr', { sensitivity: 'base' });
    });
    return arr;
}

function buildLCATree(data, person1Id, person2Id) {
    if (!data || !person1Id || !person2Id) {
        return;
    }
    
    showLoading();
    
    try {
        const relationships = data.relationships || [];
        const individuals = data.individuals || [];
        
        // Find the LCA
        const lcaResult = findLCA(person1Id, person2Id, relationships, individuals);
        
        if (!lcaResult) {
            hideLoading();
            const resultDiv = document.getElementById('lcaResult');
            if (resultDiv) {
                resultDiv.className = 'lca-result-panel lca-result-panel--empty';
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = '<strong>Aucun ancêtre commun trouvé</strong>';
            }
            return;
        }

        const childToParentsFull = buildChildToParentsMap(relationships);
        const genIds = getLcaGenerationAncestorIds(
            lcaResult.path1,
            lcaResult.path2,
            lcaResult.lcaId,
            childToParentsFull,
            individuals
        );

        const resultDiv = document.getElementById('lcaResult');
        if (resultDiv) {
            resultDiv.className = 'lca-result-panel';
            resultDiv.style.display = 'block';
            const label =
                genIds.length <= 1
                    ? 'Ancêtre commun le plus récent :'
                    : 'Ancêtres communs (cette génération) :';
            const namesLine = genIds
                .map((id) => {
                    const p = individuals.find((x) => x.id === id);
                    return escapeHtmlText(personDisplayNameForLca(p) || id);
                })
                .join(' · ');
            const p1Label = escapeHtmlText(
                personDisplayNameForLca(individuals.find((x) => x.id === person1Id)) || 'personne 1'
            );
            const p2Label = escapeHtmlText(
                personDisplayNameForLca(individuals.find((x) => x.id === person2Id)) || 'personne 2'
            );
            resultDiv.innerHTML = `
                <strong>${label}</strong> <span class="lca-result-names">${namesLine}</span>
                <small class="lca-result-distance">Distance : ${generationsCountFr(lcaResult.distance1)} depuis ${p1Label}, ${generationsCountFr(lcaResult.distance2)} depuis ${p2Label}</small>
            `;
        }
        
        // Collect all people to show (both paths + LCA + co-parents : 2e parent quand il existe)
        const peopleToShow = new Set();
        lcaResult.path1.forEach(id => peopleToShow.add(id));
        lcaResult.path2.forEach(id => peopleToShow.add(id));
        collectCoParentIdsForLCAPaths(lcaResult.path1, lcaResult.path2, childToParentsFull).forEach((id) =>
            peopleToShow.add(id)
        );
        
        const filteredIndividuals = individuals.filter(person => peopleToShow.has(person.id));
        const filteredRelationships = relationships.filter(rel => 
            peopleToShow.has(rel.from) && peopleToShow.has(rel.to)
        );
        
        // Process data
        const { nodeLevels, marriages } = calculateLevels(filteredIndividuals, filteredRelationships);
        const { coupleGroups, personToCoupleGroup } = groupCouples(filteredRelationships);
        const parentPairToChildren = groupParentChildren(filteredRelationships, marriages);
        
        // Create nodes and edges
        AppState.nodes = createNodes(filteredIndividuals, nodeLevels, personToCoupleGroup);
        AppState.edges = createEdges(filteredRelationships, parentPairToChildren);
        
        // Calculate positions for LCA visualization
        const positions = calculateLCAPositions(
            AppState.nodes,
            lcaResult.path1,
            lcaResult.path2,
            lcaResult.lcaId,
            person1Id,
            person2Id,
            childToParentsFull
        );
        
        AppState.positions = positions;
        
        // Create network
        createNetwork(AppState.nodes, AppState.edges, positions);
        persistMenuGraph('lca');
        
        hideLoading();
    } catch (error) {
        console.error('[buildLCATree] Error:', error);
        showError('Erreur (ancêtre commun) : ' + error.message);
        hideLoading();
    }
}

// Family Name search functionality
let selectedFamilyName = null;

function setupFamilyNameSearch(data) {
    const searchInput = document.getElementById('familyNameSearch');
    const individuals = data.individuals || [];
    let searchTimeout = null;
    
    // Get unique family names for autocomplete
    const familyNames = new Set();
    individuals.forEach(person => {
        const lastName = (person.lastName || '').trim();
        if (lastName) {
            familyNames.add(lastName);
        }
    });
    const uniqueFamilyNames = Array.from(familyNames).sort();
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(searchTimeout);
            
            searchTimeout = setTimeout(() => {
                // Filter family names that match the query
                const matchingNames = uniqueFamilyNames.filter(name => {
                    const normalizedName = name.toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .trim();
                    const normalizedQuery = query.toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .trim();
                    return normalizedName.includes(normalizedQuery);
                });
                
                if (matchingNames.length > 0) {
                    displayFamilyNameResults(matchingNames, (familyName) => {
                        searchInput.value = familyName;
                        hideFamilyNameResults();
                        selectedFamilyName = familyName;
                        buildFamilyNameTree(data, familyName);
                    });
                } else {
                    hideFamilyNameResults();
                    // Clear tree if no match
                    if (AppState.network) {
                        AppState.network.destroy();
                        AppState.network = null;
                    }
                    document.getElementById('tree-container').innerHTML = '';
                    const resultDiv = document.getElementById('familyResult');
                    if (resultDiv) {
                        resultDiv.style.display = 'none';
                    }
                }
            }, 100);
        });
        
        searchInput.addEventListener('focus', () => {
            const query = searchInput.value.trim();
            if (query) {
                const matchingNames = uniqueFamilyNames.filter(name => {
                    const normalizedName = name.toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .trim();
                    const normalizedQuery = query.toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .trim();
                    return normalizedName.includes(normalizedQuery);
                });
                
                if (matchingNames.length > 0) {
                    displayFamilyNameResults(matchingNames, (familyName) => {
                        searchInput.value = familyName;
                        hideFamilyNameResults();
                        selectedFamilyName = familyName;
                        buildFamilyNameTree(data, familyName);
                    });
                }
            } else {
                // Show all family names when empty
                displayFamilyNameResults(uniqueFamilyNames.slice(0, 50), (familyName) => {
                    searchInput.value = familyName;
                    hideFamilyNameResults();
                    selectedFamilyName = familyName;
                    buildFamilyNameTree(data, familyName);
                });
            }
        });
    }
    
    // Hide results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#familySearchWrapper')) {
            hideFamilyNameResults();
        }
    });
}

function displayFamilyNameResults(results, onSelect) {
    const resultsDiv = document.getElementById('familyNameResults');
    if (!resultsDiv) return;
    
    if (results.length === 0) {
        resultsDiv.innerHTML = '<div class="search-result-item">Aucun nom de famille trouvé</div>';
        resultsDiv.classList.add('active');
        return;
    }
    
    resultsDiv.innerHTML = results.map(familyName => `
        <div class="search-result-item" data-family-name="${familyName}">
            <div class="search-result-name">${escapeHtml(familyName)}</div>
        </div>
    `).join('');
    
    resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const familyName = item.getAttribute('data-family-name');
            if (familyName && onSelect) {
                onSelect(familyName);
            }
        });
    });
    
    resultsDiv.classList.add('active');
}

function hideFamilyNameResults() {
    const resultsDiv = document.getElementById('familyNameResults');
    if (resultsDiv) {
        resultsDiv.classList.remove('active');
    }
}

/** @param {{ count?: number, emptyMessage?: string }} state */
function setFamilyResultPanel(state) {
    const resultDiv = document.getElementById('familyResult');
    const okLine = document.getElementById('familyResultOk');
    const emptyLine = document.getElementById('familyResultEmpty');
    const countSpan = document.getElementById('familyCount');
    if (!resultDiv) return;
    resultDiv.style.display = 'block';
    if (state.emptyMessage != null && state.emptyMessage !== '') {
        if (okLine) okLine.classList.add('hidden');
        if (emptyLine) {
            emptyLine.textContent = state.emptyMessage;
            emptyLine.classList.remove('hidden');
        }
    } else {
        if (emptyLine) emptyLine.classList.add('hidden');
        if (okLine) okLine.classList.remove('hidden');
        if (countSpan != null && typeof state.count === 'number') {
            countSpan.textContent = String(state.count);
        }
    }
}

function buildFamilyNameTree(data, familyName) {
    if (!data || !familyName) {
        return;
    }

    familyNameBuildGeneration += 1;
    const buildId = familyNameBuildGeneration;

    showLoading();

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            setTimeout(() => {
                (async () => {
                    const normalizeString = (str) => {
                        if (!str) return '';
                        return str
                            .toLowerCase()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .trim();
                    };

                    try {
                        await new Promise((r) => requestAnimationFrame(r));
                        if (buildId !== familyNameBuildGeneration) return;

                        const individuals = data.individuals || [];
                        const relationships = data.relationships || [];
                        const normalizedFamilyName = normalizeString(familyName);

                        const matchingIndividuals = individuals.filter((person) => {
                            const personLastName = normalizeString(person.lastName || '');
                            return personLastName === normalizedFamilyName;
                        });

                        if (matchingIndividuals.length === 0) {
                            hideLoading();
                            if (buildId !== familyNameBuildGeneration) return;
                            setFamilyResultPanel({ emptyMessage: 'Aucune personne avec ce nom de famille' });
                            return;
                        }

                        const matchingIds = new Set(matchingIndividuals.map((p) => p.id));

                        /**
                         * Sous-graphe strict : uniquement les relations dont les deux extrémités
                         * portent ce nom. Sinon une chaîne « un homonyme connaît X » ramenait tout le fichier.
                         */
                        const filteredRelationships = relationships.filter(
                            (rel) => matchingIds.has(rel.from) && matchingIds.has(rel.to)
                        );

                        const filteredIndividuals = matchingIndividuals;

                        const n = matchingIndividuals.length;
                        if (buildId !== familyNameBuildGeneration) return;
                        setFamilyResultPanel({ count: n });

                        const loadingEl = document.getElementById('loading');
                        if (loadingEl) {
                            const firstP = loadingEl.querySelector('p');
                            if (firstP) {
                                firstP.textContent = `Traitement : ${n.toLocaleString('fr-FR')} personnes…`;
                            }
                        }

                        if (AppState.network && !(AppState.currentMenu === 'link' && AppState.linkTreeBuilt)) {
                            AppState.network.destroy();
                            AppState.network = null;
                        }
                        document.getElementById('tree-container').innerHTML = '';

                        await new Promise((r) => setTimeout(r, 0));
                        if (buildId !== familyNameBuildGeneration) return;

                        let nodeLevels;
                        let marriages;
                        if (typeof calculateLevelsAsync === 'function') {
                            const result = await calculateLevelsAsync(
                                filteredIndividuals,
                                filteredRelationships,
                                () => {}
                            );
                            nodeLevels = result.nodeLevels;
                            marriages = result.marriages;
                        } else {
                            const result = calculateLevels(filteredIndividuals, filteredRelationships);
                            nodeLevels = result.nodeLevels;
                            marriages = result.marriages;
                        }

                        await new Promise((r) => setTimeout(r, 0));
                        if (buildId !== familyNameBuildGeneration) return;

                        let coupleGroups;
                        let personToCoupleGroup;
                        if (typeof groupCouplesAsync === 'function') {
                            const result = await groupCouplesAsync(filteredRelationships, () => {});
                            coupleGroups = result.coupleGroups;
                            personToCoupleGroup = result.personToCoupleGroup;
                        } else {
                            const result = groupCouples(filteredRelationships);
                            coupleGroups = result.coupleGroups;
                            personToCoupleGroup = result.personToCoupleGroup;
                        }

                        const parentPairToChildren = groupParentChildren(filteredRelationships, marriages);

                        await new Promise((r) => setTimeout(r, 0));
                        if (buildId !== familyNameBuildGeneration) return;

                        if (typeof createNodesAsync === 'function') {
                            AppState.nodes = await createNodesAsync(
                                filteredIndividuals,
                                nodeLevels,
                                personToCoupleGroup,
                                () => {}
                            );
                        } else {
                            AppState.nodes = createNodes(
                                filteredIndividuals,
                                nodeLevels,
                                personToCoupleGroup
                            );
                        }

                        await new Promise((r) => setTimeout(r, 0));
                        if (buildId !== familyNameBuildGeneration) return;

                        AppState.edges = createEdges(filteredRelationships, parentPairToChildren);

                        const updatePosProgress = () => {};
                        let positions;
                        if (typeof calculateLinkPositionsAsync === 'function') {
                            const positionBundle = await calculateLinkPositionsAsync(
                                AppState.nodes,
                                coupleGroups,
                                personToCoupleGroup,
                                parentPairToChildren,
                                updatePosProgress,
                                { familyNameLayout: true }
                            );
                            positions = positionBundle.positions;
                        } else {
                            const positionBundle = calculateLinkPositions(
                                AppState.nodes,
                                coupleGroups,
                                personToCoupleGroup,
                                parentPairToChildren,
                                { familyNameLayout: true }
                            );
                            positions = positionBundle.positions;
                        }

                        await new Promise((r) => setTimeout(r, 0));
                        if (buildId !== familyNameBuildGeneration) return;

                        AppState.positions = positions;

                        if (AppState.currentMenu === 'family') {
                            createNetwork(AppState.nodes, AppState.edges, positions);
                            persistMenuGraph('family');
                        }
                    } catch (error) {
                        console.error('[buildFamilyNameTree] Error:', error);
                        if (buildId === familyNameBuildGeneration) {
                            showError('Erreur (nom de famille) : ' + error.message);
                        }
                    } finally {
                        if (buildId === familyNameBuildGeneration) {
                            hideLoading();
                        }
                    }
                })();
            }, 0);
        });
    });
}

function centerAndZoomOnPerson(personId) {
    if (!AppState.network || !AppState.positions) {
        console.warn('[centerAndZoomOnPerson] Network or positions not available');
        return;
    }
    
    const position = AppState.positions[personId];
    if (!position) {
        console.warn('[centerAndZoomOnPerson] Position not found for person:', personId);
        return;
    }
    
    // Check if node exists in network
    const node = AppState.nodes.get(personId);
    if (!node) {
        console.warn('[centerAndZoomOnPerson] Node not found in network for person:', personId);
        return;
    }
    
    // Use focus method to center and zoom on the person
    // This will center the node and zoom to a comfortable level
    AppState.network.focus(personId, {
        scale: 1.5, // Zoom level (1.5x)
        animation: {
            duration: 500, // Animation duration in ms
            easingFunction: 'easeInOutQuad'
        }
    });
}

function hideLinkLoadPrompt() {
    const el = document.getElementById('linkLoadPrompt');
    if (el) {
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
    }
}

function showLinkLoadPrompt() {
    const el = document.getElementById('linkLoadPrompt');
    if (el) {
        el.classList.remove('hidden');
        el.setAttribute('aria-hidden', 'false');
    }
}

/** Affiche le chargement quand on revient sur l’arbre complet pendant le calcul en arrière-plan. */
function showLinkTreeLoadingResume() {
    showLoading();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.innerHTML = `
            <div class="loading-spinner"></div>
            <p><strong>Chargement de l’arbre complet…</strong></p>
            <p style="font-size: 0.85em; color: #666; margin-top: 0.5rem;">Vous pouvez continuer à naviguer pendant ce temps.</p>
        `;
    }
}

/** Lance le calcul lourd (bouton central). */
function launchLinkTreeBuild(data) {
    if (!data || AppState.linkTreeLoading || AppState.linkTreeBuilt) return;
    hideLinkLoadPrompt();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            setTimeout(() => buildLinkTree(data), 100);
        });
    });
}

function buildLinkTree(data) {
    console.log('[buildLinkTree] Starting...');
    if (!data) {
        console.log('[buildLinkTree] No data, returning');
        return;
    }
    if (AppState.linkTreeLoading) {
        console.log('[buildLinkTree] Already in progress');
        return;
    }
    AppState.linkTreeLoading = true;
    
    console.log('[buildLinkTree] Showing loading...');
    showLoading();
    const loadingEl = document.getElementById('loading');
    
    const totalIndividuals = (data.individuals || []).length;
    const totalRelationships = (data.relationships || []).length;
    
    if (loadingEl) {
        loadingEl.innerHTML = `
            <div class="loading-spinner"></div>
            <p><strong id="loadingMainText">Traitement : ${totalIndividuals.toLocaleString('fr-FR')} personnes…</strong></p>
            <p style="font-size: 0.85em; color: #666; margin-top: 0.5rem;" id="progressSubtext">Initialisation…</p>
            <div class="progress-bar-container link-mode-progress" id="progressBarContainer">
                <div class="progress-bar">
                    <div class="progress-bar-fill" id="progressBarFill" style="width: 0%;"></div>
                </div>
                <div class="progress-text" id="progressText">0%</div>
            </div>
        `;
    }
    
    console.log('[buildLinkTree] Forcing UI update...');
    // Force immediate UI update by triggering reflow
    if (loadingEl) {
        loadingEl.offsetHeight; // Force reflow
    }
    
    // Use multiple requestAnimationFrames to ensure UI is painted
    requestAnimationFrame(() => {
        console.log('[buildLinkTree] First RAF');
        requestAnimationFrame(() => {
            console.log('[buildLinkTree] Second RAF, starting async process');
            // Make entire process async
            (async () => {
                try {
                    // Get progressSubtext element once at the start
                    let progressSubtext = document.getElementById('progressSubtext');
                    
                    // Define progress ranges for each step (global 0-100%)
                    // Adjusted to better reflect actual processing time
                    // calculatePositions is the longest step, so it gets more range
                    const PROGRESS_RANGES = {
                        preparing: { start: 0, end: 2 },      // Initial preparation (very fast)
                        init: { start: 2, end: 5 },          // Initialization (fast)
                        calculateLevels: { start: 5, end: 15 },  // Calculate levels (moderate)
                        groupCouples: { start: 15, end: 20 },     // Group couples (fast)
                        createNodes: { start: 20, end: 30 },      // Create nodes (moderate)
                        createEdges: { start: 30, end: 35 },      // Create edges (fast)
                        calculatePositions: { start: 35, end: 90 }, // Calculate positions (LONGEST - 55% of total)
                        render: { start: 90, end: 100 }           // Render (fast)
                    };
                    
                    // Helper function to update global progress
                    // Get references to progress elements after innerHTML is set
                    const progressBarFillEl = document.getElementById('progressBarFill');
                    const progressTextEl = document.getElementById('progressText');
                    
                    const updateGlobalProgress = (step, stepProgress, message, subtext) => {
                        const range = PROGRESS_RANGES[step];
                        if (!range) return;
                        
                        const globalProgress = range.start + Math.round((stepProgress / 100) * (range.end - range.start));
                        
                        if (progressBarFillEl) {
                            progressBarFillEl.style.width = globalProgress + '%';
                        }
                        if (progressTextEl) {
                            progressTextEl.textContent = globalProgress + '%';
                        }
                        if (loadingEl) {
                            // Update main text without removing spinner
                            const mainText = document.getElementById('loadingMainText');
                            if (mainText && message) {
                                mainText.textContent = message;
                            }
                            // Update subtext
                            const progressSubtextEl = document.getElementById('progressSubtext');
                            if (progressSubtextEl && subtext) {
                                progressSubtextEl.textContent = subtext;
                            }
                        }
                    };
                    
                    console.log('[buildLinkTree] Getting individuals and relationships...');
        const individuals = data.individuals || [];
        const relationships = data.relationships || [];
                    console.log('[buildLinkTree] Got', individuals.length, 'individuals and', relationships.length, 'relationships');
        
        // Include ALL individuals in the link view
        const filteredIndividuals = individuals;
        const filteredRelationships = relationships;
        
                    // Yield control to browser - use longer delay to ensure UI paints
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // Start with preparing step
                    updateGlobalProgress('preparing', 100,
                        `Préparation : ${totalIndividuals.toLocaleString('fr-FR')} personnes…`,
                        'Initialisation des structures…'
                    );
                    await new Promise(resolve => setTimeout(resolve, 50));
                    
                    console.log('[buildLinkTree] Initializing...');
                    updateGlobalProgress('init', 100, 
                        `Traitement : ${totalIndividuals.toLocaleString('fr-FR')} personnes…`,
                        'Analyse des relations familiales…'
                    );
                    
                    // Force multiple UI updates to ensure message is visible
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    await new Promise(resolve => setTimeout(resolve, 200)); // Longer delay to ensure UI paints
                    
                    console.log('[buildLinkTree] Starting calculateLevels...');
                    updateGlobalProgress('calculateLevels', 0, 
                        'Calcul des générations et des niveaux…',
                        `Traitement : ${totalIndividuals.toLocaleString('fr-FR')} personnes…`
                    );
                    
                    // Force multiple UI updates before blocking operation - CRITICAL
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    await new Promise(resolve => setTimeout(resolve, 200)); // Delay to ensure UI paints and slow down initial progress
                    
                    console.log('[buildLinkTree] About to call calculateLevelsAsync...');
                    
                    // Declare variables in outer scope
                    let nodeLevels, marriages;
                    
                    // Check if async function is available, fallback to sync if not
                    if (typeof calculateLevelsAsync === 'undefined') {
                        console.warn('[buildLinkTree] calculateLevelsAsync not found, using sync version');
                        updateGlobalProgress('calculateLevels', 50, 
                            'Calcul des générations et des niveaux…',
                            'Traitement…'
                        );
                        console.time('[buildLinkTree] calculateLevels');
                        const result = calculateLevels(filteredIndividuals, filteredRelationships);
                        nodeLevels = result.nodeLevels;
                        marriages = result.marriages;
                        updateGlobalProgress('calculateLevels', 100, 
                            'Calcul des générations et des niveaux…',
                            'Terminé'
                        );
                        console.timeEnd('[buildLinkTree] calculateLevels');
                        console.log('[buildLinkTree] calculateLevels complete');
                    } else {
                        const updateCalculateLevelsProgress = (progress, message) => {
                            updateGlobalProgress('calculateLevels', progress,
                                'Calcul des générations et des niveaux…',
                                ''
                            );
                        };
                        
                        console.time('[buildLinkTree] calculateLevelsAsync');
                        const result = await calculateLevelsAsync(
                            filteredIndividuals, 
                            filteredRelationships,
                            updateCalculateLevelsProgress
                        );
                        nodeLevels = result.nodeLevels;
                        marriages = result.marriages;
                        console.timeEnd('[buildLinkTree] calculateLevelsAsync');
                        console.log('[buildLinkTree] calculateLevelsAsync complete');
                    }
                    
                    // Yield control
                    await new Promise(resolve => setTimeout(resolve, 50));
                    
                    console.log('[buildLinkTree] Starting groupCouplesAsync...');
                    updateGlobalProgress('groupCouples', 0,
                        'Regroupement des couples et mariages…',
                        'Identification des liens familiaux…'
                    );
                    
                    // Force UI update
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    
                    let coupleGroups, personToCoupleGroup;
                    if (typeof groupCouplesAsync === 'undefined') {
                        console.warn('[buildLinkTree] groupCouplesAsync not found, using sync version');
                        updateGlobalProgress('groupCouples', 50,
                            'Regroupement des couples et mariages…',
                            'Traitement…'
                        );
                        console.time('[buildLinkTree] groupCouples');
                        const result = groupCouples(filteredRelationships);
                        coupleGroups = result.coupleGroups;
                        personToCoupleGroup = result.personToCoupleGroup;
                        updateGlobalProgress('groupCouples', 100,
                            'Regroupement des couples et mariages…',
                            'Terminé'
                        );
                        console.timeEnd('[buildLinkTree] groupCouples');
                    } else {
                        const updateGroupCouplesProgress = (progress, message) => {
                            updateGlobalProgress('groupCouples', progress,
                                'Regroupement des couples et mariages…',
                                ''
                            );
                        };
                        
                        console.time('[buildLinkTree] groupCouplesAsync');
                        const result = await groupCouplesAsync(filteredRelationships, updateGroupCouplesProgress);
                        coupleGroups = result.coupleGroups;
                        personToCoupleGroup = result.personToCoupleGroup;
                        console.timeEnd('[buildLinkTree] groupCouplesAsync');
                    }
                    
                    console.time('[buildLinkTree] groupParentChildren');
        const parentPairToChildren = groupParentChildren(filteredRelationships, marriages);
                    console.timeEnd('[buildLinkTree] groupParentChildren');
                    
                    // Yield control
                    await new Promise(resolve => setTimeout(resolve, 50));
                    
                    console.log('[buildLinkTree] Starting createNodesAsync...');
                    updateGlobalProgress('createNodes', 0,
                        'Création des nœuds…',
                        `Préparation de ${totalIndividuals.toLocaleString('fr-FR')} personnes…`
                    );
                    
                    // Force UI update
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    
                    if (typeof createNodesAsync === 'undefined') {
                        console.warn('[buildLinkTree] createNodesAsync not found, using sync version');
                        updateGlobalProgress('createNodes', 50,
                            'Création des nœuds…',
                            'Traitement…'
                        );
                        console.time('[buildLinkTree] createNodes');
        AppState.nodes = createNodes(filteredIndividuals, nodeLevels, personToCoupleGroup);
                        updateGlobalProgress('createNodes', 100,
                            'Création des nœuds…',
                            'Terminé'
                        );
                        console.timeEnd('[buildLinkTree] createNodes');
                        console.log('[buildLinkTree] createNodes complete');
                    } else {
                        const updateCreateNodesProgress = (progress, message) => {
                            updateGlobalProgress('createNodes', progress,
                                'Création des nœuds…',
                                ''
                            );
                        };
                        
                        console.time('[buildLinkTree] createNodesAsync');
                        AppState.nodes = await createNodesAsync(filteredIndividuals, nodeLevels, personToCoupleGroup, updateCreateNodesProgress);
                        console.timeEnd('[buildLinkTree] createNodesAsync');
                        console.log('[buildLinkTree] createNodesAsync complete');
                    }
                    
                    console.time('[buildLinkTree] createLinkEdges');
                    updateGlobalProgress('createEdges', 0,
                        'Création des liaisons…',
                        `${totalRelationships.toLocaleString('fr-FR')} relations…`
                    );
                    // Force UI update
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    AppState.edges = createLinkEdges(filteredRelationships, parentPairToChildren);
                    updateGlobalProgress('createEdges', 100,
                        'Création des liaisons…',
                        'Liaisons créées'
                    );
                    console.timeEnd('[buildLinkTree] createLinkEdges');
                    
                    // Yield control
                    await new Promise(resolve => setTimeout(resolve, 50));
                    
                    console.log('[buildLinkTree] Starting calculateLinkPositionsAsync...');
                    updateGlobalProgress('calculatePositions', 0,
                        'Calcul des positions…',
                        'Étape la plus longue, merci de patienter…'
                    );
                    
                    // Force UI update
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    
                    // Use async version with progress updates
                    const updateProgress = (progress, message) => {
                        updateGlobalProgress('calculatePositions', progress,
                            'Calcul des positions…',
                            ''
                        );
                    };
                    
                    console.time('[buildLinkTree] calculateLinkPositionsAsync');
        const { positions, generationYRange, generationYears, generationNumbers } = 
                        await calculateLinkPositionsAsync(
                            AppState.nodes, 
                            coupleGroups, 
                            personToCoupleGroup, 
                            parentPairToChildren,
                            updateProgress
                        );
                    console.timeEnd('[buildLinkTree] calculateLinkPositionsAsync');
        
        // Store positions
        AppState.positions = positions;
                    
                    // Yield control
                    await new Promise(resolve => setTimeout(resolve, 50));
                    
                    console.log('[buildLinkTree] Rendering network...');
                    updateGlobalProgress('render', 100,
                        'Rendu de la visualisation…',
                        'Finalisation…'
                    );
        
                    AppState.linkTreeBuilt = true;
                    AppState.menuGraphCache.link = {
                        nodes: AppState.nodes,
                        edges: AppState.edges,
                        positions: AppState.positions,
                        rootPersonId: AppState.rootPersonId
                    };

                    const progressBarContainerEl = document.getElementById('progressBarContainer');
                    if (progressBarContainerEl) {
                        progressBarContainerEl.classList.remove('link-mode-progress');
                        progressBarContainerEl.classList.add('hidden');
                    }

                    hideLinkLoadPrompt();
                    // Ne montrer l’arbre complet que si l’utilisateur est encore sur le menu Arbre
                    if (AppState.currentMenu === 'link') {
                        createNetwork(AppState.nodes, AppState.edges, positions);
                        console.log('[buildLinkTree] Complete!');
                        hideLoading();
                    } else {
                        console.log('[buildLinkTree] Complete (menu Arbre inactif — pas d’affichage)');
                        hideLoading();
                    }
    } catch (error) {
                    console.error('[buildLinkTree] Error:', error);
        showError('Erreur (arbre complet) : ' + error.message);
        hideLoading();
    } finally {
                    AppState.linkTreeLoading = false;
    }
            })();
        });
    });
}

// Helper function to update progress
function updateProgress(percent, progressBarFill, progressText) {
    if (progressBarFill) progressBarFill.style.width = percent + '%';
    if (progressText) progressText.textContent = Math.round(percent) + '%';
}

// Removed: buildTree1, buildTree2, buildTree3, buildHorizontalTree functions

function switchMenu(menuName) {
    console.log('[switchMenu] Called with menuName:', menuName);

    const previousMenu = AppState.currentMenu;
    persistMenuGraph(previousMenu);

    AppState.currentMenu = menuName;
    console.log('[switchMenu] State updated, currentMenu:', AppState.currentMenu);

    if (AppState.network) {
        console.log('[switchMenu] Destroying network (switching menus)');
        AppState.network.destroy();
        AppState.network = null;
    }

    const treeContainerEl = document.getElementById('tree-container');
    if (treeContainerEl) {
        treeContainerEl.innerHTML = '';
    }

    restoreMenuGraph(menuName);

    hideLoading();
    const progressBarContainer = document.getElementById('progressBarContainer');
    if (progressBarContainer) {
        progressBarContainer.classList.add('hidden');
        progressBarContainer.classList.remove('link-mode-progress');
    }
    
    // Update menu button states
    document.querySelectorAll('.menu-item').forEach(btn => {
        if (btn.dataset.menu === menuName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Show/hide control sections
    const treeControlsEl = document.getElementById('treeControls');
    if (treeControlsEl) treeControlsEl.classList.remove('hidden');
    
    const personSearchEl = document.getElementById('personSearch');
    const descendantsSearchInput = document.getElementById('descendantsPersonSearch');
    if (previousMenu === 'tree' && menuName !== 'tree') {
        if (personSearchEl) personSearchEl.value = '';
        hideSearchResults();
    }
    if (previousMenu === 'lca' && menuName !== 'lca') {
        lcaPerson1 = null;
        lcaPerson2 = null;
        const lcaPerson1Search = document.getElementById('lcaPerson1Search');
        const lcaPerson2Search = document.getElementById('lcaPerson2Search');
        if (lcaPerson1Search) lcaPerson1Search.value = '';
        if (lcaPerson2Search) lcaPerson2Search.value = '';
        const lcaResult = document.getElementById('lcaResult');
        if (lcaResult) lcaResult.style.display = 'none';
    }
    if (previousMenu === 'family' && menuName !== 'family') {
        selectedFamilyName = null;
        const familyNameSearch = document.getElementById('familyNameSearch');
        if (familyNameSearch) familyNameSearch.value = '';
        const familyResult = document.getElementById('familyResult');
        if (familyResult) familyResult.style.display = 'none';
    }
    if (previousMenu === 'descendants' && menuName !== 'descendants') {
        if (descendantsSearchInput) descendantsSearchInput.value = '';
        hideDescendantsSearchResults();
    }
    
    // Show/hide the appropriate search wrapper based on menu
    const searchWrapper = document.getElementById('searchWrapper');
    const linkSearchWrapper = document.getElementById('linkSearchWrapper');
    const lcaSearchWrapper = document.getElementById('lcaSearchWrapper');
    const familySearchWrapper = document.getElementById('familySearchWrapper');
    const descendantsSearchWrapper = document.getElementById('descendantsSearchWrapper');
    
    const hideAllSearchWrappers = () => {
        if (searchWrapper) searchWrapper.classList.add('hidden');
        if (linkSearchWrapper) linkSearchWrapper.classList.add('hidden');
        if (lcaSearchWrapper) lcaSearchWrapper.classList.add('hidden');
        if (familySearchWrapper) familySearchWrapper.classList.add('hidden');
        if (descendantsSearchWrapper) descendantsSearchWrapper.classList.add('hidden');
    };
    
    if (menuName === 'tree') {
        hideAllSearchWrappers();
        if (searchWrapper) searchWrapper.classList.remove('hidden');
    } else if (menuName === 'link') {
        hideAllSearchWrappers();
        if (linkSearchWrapper) linkSearchWrapper.classList.remove('hidden');
    } else if (menuName === 'lca') {
        hideAllSearchWrappers();
        if (lcaSearchWrapper) lcaSearchWrapper.classList.remove('hidden');
    } else if (menuName === 'family') {
        hideAllSearchWrappers();
        if (familySearchWrapper) familySearchWrapper.classList.remove('hidden');
    } else if (menuName === 'descendants') {
        hideAllSearchWrappers();
        if (descendantsSearchWrapper) descendantsSearchWrapper.classList.remove('hidden');
    } else {
        hideAllSearchWrappers();
    }

    const individualsList = (AppState.treeData && AppState.treeData.individuals) ? AppState.treeData.individuals : [];
    if (menuName === 'tree') {
        const ct = AppState.menuGraphCache.tree;
        if (personSearchEl && ct && typeof ct.personSearchDisplay === 'string') {
            personSearchEl.value = ct.personSearchDisplay;
        }
    }
    if (menuName === 'descendants') {
        const cd = AppState.menuGraphCache.descendants;
        if (descendantsSearchInput && cd && typeof cd.descendantsSearchDisplay === 'string') {
            descendantsSearchInput.value = cd.descendantsSearchDisplay;
        }
    }
    if (menuName === 'lca') {
        const cl = AppState.menuGraphCache.lca;
        const lcaPerson1Search = document.getElementById('lcaPerson1Search');
        const lcaPerson2Search = document.getElementById('lcaPerson2Search');
        if (cl && cl.lcaPerson1Id) {
            lcaPerson1 = individualsList.find((p) => p.id === cl.lcaPerson1Id) || null;
            if (lcaPerson1Search && lcaPerson1) {
                lcaPerson1Search.value = lcaPerson1.fullName || `${lcaPerson1.firstName || ''} ${lcaPerson1.lastName || ''}`.trim();
            }
        }
        if (cl && cl.lcaPerson2Id) {
            lcaPerson2 = individualsList.find((p) => p.id === cl.lcaPerson2Id) || null;
            if (lcaPerson2Search && lcaPerson2) {
                lcaPerson2Search.value = lcaPerson2.fullName || `${lcaPerson2.firstName || ''} ${lcaPerson2.lastName || ''}`.trim();
            }
        }
    }
    if (menuName === 'family') {
        const cf = AppState.menuGraphCache.family;
        const familyNameSearch = document.getElementById('familyNameSearch');
        if (cf && cf.familyName) {
            selectedFamilyName = cf.familyName;
            if (familyNameSearch) familyNameSearch.value = cf.familyName;
        } else {
            selectedFamilyName = null;
            if (familyNameSearch) familyNameSearch.value = '';
        }
    }
    
    // Show mode-specific controls
    const linkControls = document.getElementById('linkControls');
    const lcaControls = document.getElementById('lcaControls');
    const familyControls = document.getElementById('familyControls');
    const descendantsControls = document.getElementById('descendantsControls');
    
    // Hide all controls first
    if (linkControls) linkControls.classList.add('hidden');
    if (lcaControls) lcaControls.classList.add('hidden');
    if (familyControls) familyControls.classList.add('hidden');
    if (descendantsControls) descendantsControls.classList.add('hidden');
    
    // Show appropriate controls
    if (menuName === 'descendants') {
        if (descendantsControls) descendantsControls.classList.remove('hidden');
    } else if (menuName === 'link') {
        if (linkControls) linkControls.classList.remove('hidden');
        // Update clear locks button visibility
        if (typeof updateClearLocksButton === 'function') {
            updateClearLocksButton();
        }
    } else if (menuName === 'lca') {
        if (lcaControls) lcaControls.classList.remove('hidden');
    } else if (menuName === 'family') {
        if (familyControls) familyControls.classList.remove('hidden');
    }
    
    // Show/hide main content areas
    const treeContainer = document.getElementById('tree-container');
    if (menuName === 'tree' || menuName === 'link' || menuName === 'lca' || menuName === 'family' || menuName === 'descendants') {
        if (treeContainer) treeContainer.classList.remove('hidden');
        
        // Hide progress bar if not in Link mode
        if (menuName !== 'link') {
            const progressBarContainer = document.getElementById('progressBarContainer');
            if (progressBarContainer) {
                progressBarContainer.classList.add('hidden');
            }
        }
        
        // Menu Arbre complet : chargement uniquement via le bouton central (ou retour avec données prêtes)
        if (menuName === 'link' && AppState.treeData) {
            console.log('[switchMenu] Link menu:', {
                linkTreeBuilt: AppState.linkTreeBuilt,
                linkTreeLoading: AppState.linkTreeLoading,
                hasCachedLink: !!(AppState.menuGraphCache.link && AppState.menuGraphCache.link.nodes)
            });
            
            if (AppState.linkTreeBuilt && AppState.nodes && AppState.edges && AppState.positions) {
                hideLinkLoadPrompt();
                hideLoading();
                createNetwork(AppState.nodes, AppState.edges, AppState.positions);
                if (treeContainer) treeContainer.classList.remove('hidden');
            } else if (AppState.linkTreeLoading) {
                hideLinkLoadPrompt();
                showLinkTreeLoadingResume();
                if (treeContainer) treeContainer.classList.remove('hidden');
            } else {
                hideLoading();
                showLinkLoadPrompt();
                if (treeContainer) treeContainer.classList.remove('hidden');
            }
            const clearAllLocksBtn = document.getElementById('clearAllLocks');
            if (clearAllLocksBtn) {
                clearAllLocksBtn.onclick = () => {
                    if (typeof clearAllLocks === 'function') {
                        clearAllLocks();
                    }
                };
            }
        } else if (menuName !== 'link' && MENU_GRAPH_KEYS.includes(menuName)) {
            if (AppState.nodes && AppState.edges && AppState.positions &&
                Object.keys(AppState.positions).length > 0) {
                hideLoading();
                createNetwork(AppState.nodes, AppState.edges, AppState.positions);
            }
        }
    } else {
        if (treeContainer) treeContainer.classList.add('hidden');
        const sidebarEl = document.getElementById('sidebar');
        if (sidebarEl) sidebarEl.classList.remove('active');
    }
    
    // Hide popup when switching menus
    hidePersonDetails();
    
    if (menuName !== 'link') {
        hideLinkLoadPrompt();
    }
}

// Zoom functionality
function setupZoomControls() {
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomResetBtn = document.getElementById('zoomResetBtn');
    
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            if (AppState.network) {
                const currentScale = AppState.network.getScale();
                AppState.network.moveTo({
                    scale: currentScale * 1.2,
                    animation: {
                        duration: 300,
                        easingFunction: 'easeInOutQuad'
                    }
                });
            }
        });
    }
    
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            if (AppState.network) {
                const currentScale = AppState.network.getScale();
                AppState.network.moveTo({
                    scale: currentScale / 1.2,
                    animation: {
                        duration: 300,
                        easingFunction: 'easeInOutQuad'
                    }
                });
            }
        });
    }
    
    if (zoomResetBtn) {
        zoomResetBtn.addEventListener('click', () => {
            if (AppState.network && AppState.positions) {
                // Aligner avec createNetwork (miroir horizontal des coords d’affichage)
                const visPos = typeof mirrorPositionsX === 'function'
                    ? mirrorPositionsX(AppState.positions)
                    : AppState.positions;
                const nodePositions = Object.values(visPos);
                if (nodePositions.length > 0) {
                    const avgX = nodePositions.reduce((sum, pos) => sum + pos.x, 0) / nodePositions.length;
                    const avgY = nodePositions.reduce((sum, pos) => sum + pos.y, 0) / nodePositions.length;
                    
                    AppState.network.moveTo({
                        position: { x: -avgX, y: -avgY },
                        scale: 1,
                        animation: {
                            duration: 500,
                            easingFunction: 'easeInOutQuad'
                        }
                    });
                } else {
                    AppState.network.fit({
                        animation: {
                            duration: 500,
                            easingFunction: 'easeInOutQuad'
                        }
                    });
                }
            }
        });
    }
}

/** Textes d’aide du bouton « ? » (un contenu par menu actif). */
const MENU_HELP_CONTENT = {
    tree: {
        title: 'Menu Ancêtres',
        html: `
<p>Affiche la <strong>ligne ascendante</strong> de la personne choisie (parents, grands-parents, etc.).</p>
<ul>
<li>Tapez un nom dans la barre de recherche puis choisissez une personne dans la liste.</li>
<li><strong>Zoom</strong> : molette ou boutons en bas à droite ; <strong>déplacer</strong> la vue : glisser le fond.</li>
<li>Survol d’une carte : après environ une seconde, une fiche détail peut s’ouvrir ; elle se ferme vite en quittant la carte.</li>
</ul>`
    },
    descendants: {
        title: 'Menu Descendants',
        html: `
<p>Montre jusqu’à <strong>trois générations de descendants</strong> sous la personne de départ (enfants, petits-enfants, arrière-petits-enfants).</p>
<ul>
<li>Choisissez la <strong>personne de départ</strong> via la recherche.</li>
<li>Les <strong>parents</strong> restent visibles au-dessus pour remonter sans bloquer la navigation.</li>
<li>Cliquez sur une personne dans le graphe pour en faire la nouvelle racine.</li>
</ul>`
    },
    link: {
        title: 'Menu Arbre complet',
        html: `
<p>Vue de <strong>toutes les personnes</strong> du fichier, organisées par génération. Le chargement peut être long.</p>
<ul>
<li>Utilisez le bouton <strong>« Charger l’arbre complet »</strong> au centre de la zone (vous pouvez changer de menu pendant le calcul).</li>
<li>La recherche permet de retrouver quelqu’un ; le <strong>survol</strong> met en évidence une lignée (lignes vertes).</li>
<li>Cliquez sur un nœud pour <strong>verrouiller</strong> ou déverrouiller l’affichage de cette lignée.</li>
</ul>`
    },
    lca: {
        title: 'Menu Ancêtre commun',
        html: `
<p>Trouve un <strong>ancêtre commun</strong> entre deux personnes (chemin affiché dans le graphe).</p>
<ul>
<li>Saisissez <strong>deux personnes</strong> dans les deux champs de recherche.</li>
<li>Validez votre sélection : le graphe se met à jour avec le chemin entre les deux branches.</li>
</ul>`
    },
    family: {
        title: 'Menu Nom de famille',
        html: `
<p>Affiche les liens entre personnes qui portent <strong>exactement le même nom de famille</strong> (tel qu’enregistré dans les données).</p>
<ul>
<li>Recherchez un nom dans la liste puis sélectionnez-le.</li>
<li>Seules les relations dont <strong>les deux extrémités</strong> ont ce nom sont affichées (sinon le graphe pourrait inclure toute la base).</li>
<li>Un seul homonyme apparaît centré à l’écran.</li>
</ul>`
    }
};

function setupDownloadModal() {
    const modal = document.getElementById('downloadModal');
    const body = document.getElementById('downloadModalBody');
    const openBtn = document.getElementById('downloadBtn');
    const closeBtn = document.getElementById('downloadCloseBtn');
    if (!modal || !body || !openBtn) {
        return;
    }

    const rows = [
        {
            key: 'macArm64',
            label: 'macOS — Apple Silicon (M1, M2, M3…)',
            hint: 'Image disque .dmg — Mac récents à processeur ARM.'
        },
        {
            key: 'macX64',
            label: 'macOS — Intel (x64)',
            hint: 'Image disque .dmg — Mac Intel (Core i5, i7, i9…).'
        },
        {
            key: 'winNsis',
            label: 'Windows — installateur (64 bits)',
            hint: 'Fichier .exe — installation classique (Windows 10 / 11 64 bits).'
        },
        {
            key: 'winZip',
            label: 'Windows — archive ZIP (64 bits)',
            hint: 'Sans installateur : dézipper puis lancer l’exécutable (usage type portable).'
        }
    ];

    function buildBody() {
        const names = getDownloadFilenames();
        let html =
            '<p class="download-intro">Choisissez la version correspondant à votre ordinateur.</p>';
        rows.forEach(function (row) {
            const url = getDownloadUrl(row.key);
            const fname = names[row.key];
            const linkHtml = url
                ? '<a href="' +
                  url.replace(/&/g, '&amp;').replace(/"/g, '&quot;') +
                  '" rel="noopener noreferrer">' +
                  fname.replace(/</g, '&lt;') +
                  '</a>'
                : '<span class="download-filename">' + fname.replace(/</g, '&lt;') + '</span>';
            html += '<div class="download-row">';
            html += '<div class="download-row-title">' + row.label + '</div>';
            html += '<div class="download-row-file">' + linkHtml + '</div>';
            html += '<div class="download-hint">' + row.hint + '</div>';
            html += '</div>';
        });
        if (!DOWNLOAD_LINKS.baseUrl || !String(DOWNLOAD_LINKS.baseUrl).trim()) {
            html +=
                '<p class="download-notice">Les liens seront actifs lorsque <code>DOWNLOAD_LINKS.baseUrl</code> sera défini dans <code>js/modules/core/config.js</code> (URL du dossier de release, par ex. une release GitHub).</p>';
        }
        body.innerHTML = html;
    }

    function openDownload() {
        buildBody();
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeDownload() {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    openBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openDownload();
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', closeDownload);
    }

    const backdrop = modal.querySelector('[data-download-close]');
    if (backdrop) {
        backdrop.addEventListener('click', closeDownload);
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeDownload();
        }
    });
}

function setupMenuHelpModal() {
    const modal = document.getElementById('menuHelpModal');
    const body = document.getElementById('menuHelpBody');
    const titleEl = document.getElementById('menuHelpTitle');
    const helpBtn = document.getElementById('menuHelpBtn');
    const closeBtn = document.getElementById('menuHelpCloseBtn');
    if (!modal || !body || !titleEl || !helpBtn) {
        return;
    }

    function openMenuHelp() {
        const key = AppState.currentMenu || 'tree';
        const block = MENU_HELP_CONTENT[key] || MENU_HELP_CONTENT.tree;
        titleEl.textContent = block.title;
        body.innerHTML = block.html;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeMenuHelp() {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    helpBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openMenuHelp();
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', closeMenuHelp);
    }

    const backdrop = modal.querySelector('[data-menu-help-close]');
    if (backdrop) {
        backdrop.addEventListener('click', closeMenuHelp);
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeMenuHelp();
        }
    });
}

// Initialize - automatically load the data on page load
document.addEventListener('DOMContentLoaded', function() {
    window.addEventListener(
        'error',
        function (ev) {
            console.error(ev.error || ev.message || 'error');
            try {
                if (typeof hideLoading === 'function') hideLoading();
            } catch (_) {}
        },
        true
    );
    window.addEventListener('unhandledrejection', function (ev) {
        console.error(ev.reason);
        try {
            if (typeof hideLoading === 'function') hideLoading();
        } catch (_) {}
    });

    // Setup menu switching
    document.querySelectorAll('.menu-item').forEach(btn => {
        btn.addEventListener('click', function() {
            console.log('[Menu Click] Button clicked, dataset.menu:', this.dataset.menu);
            try {
            const menuName = this.dataset.menu;
                console.log('[Menu Click] Calling switchMenu with:', menuName);
            switchMenu(menuName);
                console.log('[Menu Click] switchMenu returned');
            } catch (error) {
                console.error('[Menu Click] Error in click handler:', error);
            }
        });
    });

    setupMenuHelpModal();
    setupDownloadModal();

    // Setup zoom controls
    setupZoomControls();
    
    const linkLoadBtn = document.getElementById('linkLoadFullTreeBtn');
    if (linkLoadBtn) {
        linkLoadBtn.addEventListener('click', () => {
            if (AppState.treeData) {
                launchLinkTreeBuild(AppState.treeData);
            }
        });
    }
    
    // Initialize with tree menu
    switchMenu('tree');
    
    // Data is already loaded via js/data.js script tag
    // TREE_DATA is available as a global variable
    if (typeof TREE_DATA !== 'undefined') {
        loadTreeData(TREE_DATA);
    } else {
        showError('Données absentes : chargez js/data.js ou un fichier JSON.');
        hideLoading();
    }
    
    const jsonFileEl = document.getElementById('jsonFile');
    if (jsonFileEl) {
        jsonFileEl.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (event) {
                    try {
                        const data = JSON.parse(event.target.result);
                        loadTreeData(data);
                    } catch (error) {
                        showError('Erreur d’analyse JSON : ' + error.message);
                    }
                };
                reader.readAsText(file);
            }
        });
    }
});

