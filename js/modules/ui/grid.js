// Generation grid creation and updates

let sortedGenerations = [];
let generationYRange = null;

function createGenerationGrid(generationNumbers, generationYRangeData, generationYears, positions) {
    generationYRange = generationYRangeData;
    sortedGenerations = Array.from(generationNumbers).sort((a, b) => a - b);
    
    const gridContainer = document.getElementById('generation-grid');
    gridContainer.innerHTML = '';
    
    const allYs = Object.values(positions || {}).map(pos => pos.y);
    const minY = allYs.length > 0 ? Math.min(...allYs) : 0;
    const maxY = allYs.length > 0 ? Math.max(...allYs) : 0;
    const totalHeight = maxY - minY || 1;
    const gridHeight = gridContainer.offsetHeight || window.innerHeight - 200;
    
    sortedGenerations.forEach((gen, idx) => {
        const yRange = generationYRange.get(gen);
        if (yRange !== undefined) {
            const label = document.createElement('div');
            label.className = 'generation-label';
            label.id = `gen-label-${gen}`;
            
            const yearRange = generationYears.get(gen);
            if (yearRange) {
                if (yearRange.min === yearRange.max) {
                    label.textContent = `${yearRange.min}`;
                } else {
                    label.textContent = `${yearRange.min}-${yearRange.max}`;
                }
            } else {
                label.textContent = `Gen ${gen}`;
            }
            
            const middleY = (yRange.min + yRange.max) / 2;
            const yPercent = (middleY - minY) / totalHeight;
            const screenY = 20 + (yPercent * (gridHeight - 40));
            
            label.style.top = `${screenY}px`;
            gridContainer.appendChild(label);
        }
    });
}

function updateGridPositions() {
    if (!AppState.network || !generationYRange) return;
    
    try {
        const allPositions = AppState.network.getPositions();
        if (Object.keys(allPositions).length === 0) return;
        
        const allYs = Object.values(allPositions).map(pos => pos.y);
        const minY = Math.min(...allYs);
        const maxY = Math.max(...allYs);
        const totalHeight = maxY - minY || 1;
        const gridContainer = document.getElementById('generation-grid');
        const gridHeight = gridContainer.offsetHeight || window.innerHeight - 200;
        
        sortedGenerations.forEach(gen => {
            const yRange = generationYRange.get(gen);
            if (yRange) {
                const middleY = (yRange.min + yRange.max) / 2;
                const yPercent = (middleY - minY) / totalHeight;
                const screenY = 20 + (yPercent * (gridHeight - 40));
                
                const label = document.getElementById(`gen-label-${gen}`);
                if (label) {
                    label.style.top = `${screenY}px`;
                }
            }
        });
    } catch (e) {
        console.error('Error updating grid positions:', e);
    }
}

