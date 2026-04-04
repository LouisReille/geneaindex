// Utility functions

/**
 * Bounding box for {x,y} points without spread (évite RangeError / stack avec 10k+ nœuds).
 * @param {{x:number,y:number}[]} points
 * @returns {{minX:number,maxX:number,minY:number,maxY:number}}
 */
function boundsXY(points) {
    if (!points || points.length === 0) {
        return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p == null || typeof p.x !== 'number' || typeof p.y !== 'number') {
            continue;
        }
        if (p.x < minX) {
            minX = p.x;
        }
        if (p.x > maxX) {
            maxX = p.x;
        }
        if (p.y < minY) {
            minY = p.y;
        }
        if (p.y > maxY) {
            maxY = p.y;
        }
    }
    if (!Number.isFinite(minX)) {
        return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }
    return { minX, maxX, minY, maxY };
}

/**
 * Display dates in French style: ISO yyyy-mm-dd → dd/mm/yyyy.
 * Other values (year only, "vers …", text) are returned unchanged.
 * @param {string} dateStr
 * @returns {string}
 */
function formatDateForDisplay(dateStr) {
    if (dateStr == null || typeof dateStr !== 'string') return dateStr;
    const s = dateStr.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
    const m = s.match(iso);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return s;
}

function getPlancheColor(planche) {
    if (!planche) return CONFIG.defaultPlancheColor;
    const index = planche.charCodeAt(0) % CONFIG.plancheColors.length;
    return CONFIG.plancheColors[index];
}

