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
    descendantsRootId: null, // Focal person for descendants view
    descendantsMaxGenerations: 3, // Depth of descendant generations (2–5)
    lockedFamilyTrees: new Set() // Set of personIds whose family trees are locked (link mode only)
};

