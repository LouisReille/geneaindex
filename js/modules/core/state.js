// Global application state
const AppState = {
    network: null,
    treeData: null,
    nodes: null,
    edges: null,
    rootPersonId: null,
    positions: null,
    currentMenu: 'tree',
    linkTreeBuilt: false, // Whether the link tree has been built
    linkTreeLoading: false, // Full link tree build in progress (may continue in background)
    /**
     * Un graphe vis (nodes/edges/positions + méta) par menu — ne pas mélanger les vues.
     * Clés : tree | descendants | link | lca | family
     */
    menuGraphCache: {
        tree: null,
        descendants: null,
        link: null,
        lca: null,
        family: null
    },
    descendantsRootId: null, // Focal person for descendants view
    descendantsMaxGenerations: 3, // Toujours plafonné à 3 (enfants → arrière-petits-enfants)
    lockedFamilyTrees: new Set() // Set of personIds whose family trees are locked (link mode only)
};

