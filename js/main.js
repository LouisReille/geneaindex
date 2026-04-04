// Main entry point - orchestrates the application

/** Incrémenté à chaque rebuild descendants : annule les builds obsolètes (ex. changement rapide du select). */
let descendantsBuildGeneration = 0;

function loadTreeData(data) {
    AppState.treeData = data;
    showLoading();
    
    try {
        // Show search wrappers after data is loaded (will be shown/hidden based on menu)
        // Don't build tree automatically - wait for user to search
        updateStats(data);
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
        
        hideLoading();
    } catch (error) {
        showError('Erreur lors de la construction de l’arbre : ' + error.message);
        console.error(error);
        hideLoading();
    }
}

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
    let changed = true;
    while (changed) {
        changed = false;
        relationships.forEach((rel) => {
            if (rel.type === 'marriage') {
                const a = rel.from;
                const b = rel.to;
                if (ids.has(a) && !ids.has(b)) {
                    ids.add(b);
                    changed = true;
                } else if (ids.has(b) && !ids.has(a)) {
                    ids.add(a);
                    changed = true;
                }
            }
        });
    }
    return ids;
}

function buildDescendantsTree(data, rootPersonId, maxGenerations) {
    const genSelectEl = document.getElementById('descendantsGenSelect');

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
        if (genSelectEl) genSelectEl.disabled = false;
        return;
    }

    const n = Math.min(5, Math.max(2, parseInt(maxGenerations, 10) || 3));
    AppState.descendantsMaxGenerations = n;
    AppState.descendantsRootId = rootPersonId;

    descendantsBuildGeneration += 1;
    const buildId = descendantsBuildGeneration;

    showLoading();
    if (genSelectEl) genSelectEl.disabled = true;

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
            const peopleToShow = collectDescendantPersonIds(rootPersonId, n, relationships);

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
        } catch (error) {
            if (buildId === descendantsBuildGeneration) {
                showError('Erreur (descendants) : ' + error.message);
                console.error(error);
            }
        } finally {
            if (buildId === descendantsBuildGeneration) {
                hideLoading();
                if (genSelectEl) genSelectEl.disabled = false;
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

function getDescendantsMaxGenerationsSelect() {
    const sel = document.getElementById('descendantsGenSelect');
    if (!sel) return 3;
    const v = parseInt(sel.value, 10);
    return Number.isFinite(v) ? Math.min(5, Math.max(2, v)) : 3;
}

function setupDescendantsSearch(data) {
    const searchInput = document.getElementById('descendantsPersonSearch');
    const genSelect = document.getElementById('descendantsGenSelect');
    if (!searchInput) return;

    const individuals = data.individuals || [];
    let searchTimeout = null;

    const runBuild = (personId) => {
        if (!personId || !AppState.treeData) return;
        const maxG = getDescendantsMaxGenerationsSelect();
        buildDescendantsTree(AppState.treeData, personId, maxG);
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

    if (genSelect) {
        genSelect.addEventListener('change', () => {
            if (AppState.descendantsRootId && AppState.treeData) {
                runBuild(AppState.descendantsRootId);
            }
        });
    }
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
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = '<strong style="color: #e74c3c;">Aucun ancêtre commun trouvé</strong>';
            }
            return;
        }
        
        // Display LCA result
        const lcaPerson = individuals.find(p => p.id === lcaResult.lcaId);
        const resultDiv = document.getElementById('lcaResult');
        const resultNameDiv = document.getElementById('lcaResultName');
        if (resultDiv && resultNameDiv && lcaPerson) {
            resultDiv.style.display = 'block';
            resultNameDiv.textContent = lcaPerson.fullName || `${lcaPerson.firstName || ''} ${lcaPerson.lastName || ''}`.trim();
            resultDiv.innerHTML = `
                <strong>Ancêtre commun :</strong> <span id="lcaResultName">${resultNameDiv.textContent}</span><br>
                <small style="color: #666;">Distance : ${lcaResult.distance1} génération(s) depuis la personne 1, ${lcaResult.distance2} génération(s) depuis la personne 2</small>
            `;
        }
        
        // Collect all people to show (both paths + LCA)
        const peopleToShow = new Set();
        lcaResult.path1.forEach(id => peopleToShow.add(id));
        lcaResult.path2.forEach(id => peopleToShow.add(id));
        
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
            person2Id
        );
        
        AppState.positions = positions;
        
        // Create network
        createNetwork(AppState.nodes, AppState.edges, positions);
        
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

function buildFamilyNameTree(data, familyName) {
    if (!data || !familyName) {
        return;
    }
    
    showLoading();
    
    try {
        const individuals = data.individuals || [];
        const relationships = data.relationships || [];
        
        // Normalize family name for comparison
        const normalizeString = (str) => {
            if (!str) return '';
            return str.toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim();
        };
        
        const normalizedFamilyName = normalizeString(familyName);
        
        // Filter individuals with matching family name
        const matchingIndividuals = individuals.filter(person => {
            const personLastName = normalizeString(person.lastName || '');
            return personLastName === normalizedFamilyName;
        });
        
        if (matchingIndividuals.length === 0) {
            hideLoading();
            const resultDiv = document.getElementById('familyResult');
            if (resultDiv) {
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = '<strong style="color: #e74c3c;">Aucune personne avec ce nom de famille</strong>';
            }
            return;
        }
        
        // Display count
        const resultDiv = document.getElementById('familyResult');
        const countDiv = document.getElementById('familyCount');
        if (resultDiv && countDiv) {
            resultDiv.style.display = 'block';
            countDiv.textContent = matchingIndividuals.length;
        }
        
        // Get IDs of matching individuals
        const matchingIds = new Set(matchingIndividuals.map(p => p.id));
        
        // Filter relationships to only include those between matching individuals
        // Also include relationships where at least one person has the family name
        const filteredRelationships = relationships.filter(rel => {
            // Include if both people have the family name
            if (matchingIds.has(rel.from) && matchingIds.has(rel.to)) {
                return true;
            }
            // Include if one person has the family name (to show connections)
            if (matchingIds.has(rel.from) || matchingIds.has(rel.to)) {
                return true;
            }
            return false;
        });
        
        // Get all individuals involved in these relationships
        const involvedIds = new Set();
        filteredRelationships.forEach(rel => {
            involvedIds.add(rel.from);
            involvedIds.add(rel.to);
        });
        
        const filteredIndividuals = individuals.filter(person => involvedIds.has(person.id));
        
        // Process data
        const { nodeLevels, marriages } = calculateLevels(filteredIndividuals, filteredRelationships);
        const { coupleGroups, personToCoupleGroup } = groupCouples(filteredRelationships);
        const parentPairToChildren = groupParentChildren(filteredRelationships, marriages);
        
        // Create nodes and edges
        AppState.nodes = createNodes(filteredIndividuals, nodeLevels, personToCoupleGroup);
        AppState.edges = createEdges(filteredRelationships, parentPairToChildren);
        
        // Calculate positions using link positioning (generation-based layout)
        // Use the synchronous version for smaller datasets
        const positionResult = calculateLinkPositions(
            AppState.nodes,
            coupleGroups,
            personToCoupleGroup,
            parentPairToChildren,
            { familyNameLayout: true }
        );
        // calculateLinkPositions returns { positions, generationYRange, generationYears, generationNumbers }
        const positions = positionResult.positions;
        
        AppState.positions = positions;
        
        // Create network
        createNetwork(AppState.nodes, AppState.edges, positions);
        
        hideLoading();
    } catch (error) {
        console.error('[buildFamilyNameTree] Error:', error);
        showError('Erreur (nom de famille) : ' + error.message);
        hideLoading();
    }
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
    
    // Update state FIRST so that any ongoing async operations can check and abort
    AppState.currentMenu = menuName;
    console.log('[switchMenu] State updated, currentMenu:', AppState.currentMenu);
    
    // Conserver les données de l’arbre complet pendant le chargement (arrière-plan) ou une fois terminé
    const shouldPreserveLinkData = AppState.linkTreeLoading ||
        (AppState.linkTreeBuilt && AppState.nodes && AppState.edges);
    const isReturningToLink = menuName === 'link' && shouldPreserveLinkData;
    
    console.log('[switchMenu] isReturningToLink:', isReturningToLink, 'linkTreeBuilt:', AppState.linkTreeBuilt, 'network:', !!AppState.network, 'nodes:', !!AppState.nodes, 'edges:', !!AppState.edges);
    
    // Always destroy the vis.js network when switching menus (it will be recreated if needed)
    if (AppState.network) {
        console.log('[switchMenu] Destroying network (switching menus)');
        AppState.network.destroy();
        AppState.network = null;
    }
    
    // Clear container
    const treeContainerEl = document.getElementById('tree-container');
    if (treeContainerEl) {
        treeContainerEl.innerHTML = '';
    }
    
    // Only clear data if not preserving Link menu data
    if (!shouldPreserveLinkData) {
        AppState.nodes = null;
        AppState.edges = null;
        AppState.positions = null;
    } else {
        console.log('[switchMenu] Preserving Link menu data (nodes, edges, positions)');
        // nodes, edges, and positions are preserved
    }
    
    // Hide loading and progress bar when switching menus
    hideLoading();
    const progressBarContainer = document.getElementById('progressBarContainer');
    if (progressBarContainer) {
        progressBarContainer.classList.add('hidden');
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
    // Always show tree controls (stats) and legend for all menus
    document.getElementById('treeControls').classList.remove('hidden');
    document.getElementById('treeLegend').classList.remove('hidden');
    
    // Clear search inputs when switching menus
    document.getElementById('personSearch').value = '';
    hideSearchResults();
    
    // Reset LCA selections when switching menus
    lcaPerson1 = null;
    lcaPerson2 = null;
    const lcaPerson1Search = document.getElementById('lcaPerson1Search');
    const lcaPerson2Search = document.getElementById('lcaPerson2Search');
    if (lcaPerson1Search) lcaPerson1Search.value = '';
    if (lcaPerson2Search) lcaPerson2Search.value = '';
    const lcaResult = document.getElementById('lcaResult');
    if (lcaResult) lcaResult.style.display = 'none';
    
    // Reset family name selection when switching menus
    selectedFamilyName = null;
    const familyNameSearch = document.getElementById('familyNameSearch');
    if (familyNameSearch) familyNameSearch.value = '';
    const familyResult = document.getElementById('familyResult');
    if (familyResult) familyResult.style.display = 'none';
    
    const descendantsSearchInput = document.getElementById('descendantsPersonSearch');
    if (descendantsSearchInput) descendantsSearchInput.value = '';
    hideDescendantsSearchResults();
    AppState.descendantsRootId = null;
    
    // Show/hide the appropriate search wrapper based on menu
    const searchWrapper = document.getElementById('searchWrapper');
    const linkSearchWrapper = document.getElementById('linkSearchWrapper');
    const lcaSearchWrapper = document.getElementById('lcaSearchWrapper');
    const familySearchWrapper = document.getElementById('familySearchWrapper');
    const descendantsSearchWrapper = document.getElementById('descendantsSearchWrapper');
    
    const hideAllSearchWrappers = () => {
        searchWrapper.classList.add('hidden');
        linkSearchWrapper.classList.add('hidden');
        if (lcaSearchWrapper) lcaSearchWrapper.classList.add('hidden');
        if (familySearchWrapper) familySearchWrapper.classList.add('hidden');
        if (descendantsSearchWrapper) descendantsSearchWrapper.classList.add('hidden');
    };
    
    if (menuName === 'tree') {
        hideAllSearchWrappers();
        searchWrapper.classList.remove('hidden');
    } else if (menuName === 'link') {
        hideAllSearchWrappers();
        linkSearchWrapper.classList.remove('hidden');
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
    
    // Show mode-specific controls
    const linkControls = document.getElementById('linkControls');
    const lcaControls = document.getElementById('lcaControls');
    const familyControls = document.getElementById('familyControls');
    const descendantsControls = document.getElementById('descendantsControls');
    
    // Hide all controls first
    linkControls.classList.add('hidden');
    if (lcaControls) lcaControls.classList.add('hidden');
    if (familyControls) familyControls.classList.add('hidden');
    if (descendantsControls) descendantsControls.classList.add('hidden');
    
    // Show appropriate controls
    if (menuName === 'descendants') {
        if (descendantsControls) descendantsControls.classList.remove('hidden');
    } else if (menuName === 'link') {
        linkControls.classList.remove('hidden');
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
        treeContainer.classList.remove('hidden');
        
        // Hide progress bar if not in Link mode
        if (menuName !== 'link') {
            const progressBarContainer = document.getElementById('progressBarContainer');
            if (progressBarContainer) {
                progressBarContainer.classList.add('hidden');
            }
        }
        
        // Menu Arbre complet : chargement uniquement via le bouton central (ou retour avec données prêtes)
        if (menuName === 'link' && AppState.treeData) {
            console.log('[switchMenu] Checking Link tree status:', {
                linkTreeBuilt: AppState.linkTreeBuilt,
                linkTreeLoading: AppState.linkTreeLoading,
                hasNetwork: !!AppState.network,
                hasNodes: !!AppState.nodes,
                hasEdges: !!AppState.edges
            });
            
            if (AppState.linkTreeBuilt && AppState.nodes && AppState.edges && AppState.positions) {
                hideLinkLoadPrompt();
                hideLoading();
                createNetwork(AppState.nodes, AppState.edges, AppState.positions);
                if (treeContainerEl) {
                    treeContainerEl.classList.remove('hidden');
                }
            } else if (AppState.linkTreeLoading) {
                hideLinkLoadPrompt();
                showLinkTreeLoadingResume();
                if (treeContainerEl) {
                    treeContainerEl.classList.remove('hidden');
                }
            } else {
                hideLoading();
                showLinkLoadPrompt();
                if (treeContainerEl) {
                    treeContainerEl.classList.remove('hidden');
                }
            }
            const clearAllLocksBtn = document.getElementById('clearAllLocks');
            if (clearAllLocksBtn) {
                clearAllLocksBtn.onclick = () => {
                    if (typeof clearAllLocks === 'function') {
                        clearAllLocks();
                    }
                };
            }
        }
    } else {
        treeContainer.classList.add('hidden');
        // Hide sidebar when not in a tree view menu
        document.getElementById('sidebar').classList.remove('active');
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
                // Calculate center of all nodes
                const nodePositions = Object.values(AppState.positions);
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

// Initialize - automatically load the data on page load
document.addEventListener('DOMContentLoaded', function() {
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
    
    // Keep file input as optional fallback (hidden by default)
    document.getElementById('jsonFile').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
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
});

