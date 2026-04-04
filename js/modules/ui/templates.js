// Template helper functions for loading and rendering HTML templates

/**
 * Load an HTML template file
 * @param {string} templatePath - Path to the template file
 * @returns {Promise<string>} - The template HTML content
 */
async function loadTemplate(templatePath) {
    try {
        const response = await fetch(templatePath);
        if (!response.ok) {
            throw new Error(`Failed to load template: ${templatePath}`);
        }
        return await response.text();
    } catch (error) {
        console.error('Error loading template:', error);
        return '';
    }
}

/**
 * Render a template with data
 * @param {string} template - Template HTML string
 * @param {Object} data - Data object to replace placeholders
 * @returns {string} - Rendered HTML
 */
function renderTemplate(template, data) {
    let rendered = template;
    for (const [key, value] of Object.entries(data)) {
        const placeholder = new RegExp(`{{${key}}}`, 'g');
        rendered = rendered.replace(placeholder, value || '');
    }
    return rendered;
}

/**
 * Create a search result item HTML
 * @param {Object} person - Person object
 * @returns {string} - HTML string for the search result item
 */
function createSearchResultItemHTML(person) {
    const fullName = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Inconnu(e)';
    const birthDate = person.birthDate
        ? `Né(e) : ${formatDateForDisplay(person.birthDate)}`
        : '';
    
    return `
        <div class="search-result-item" data-person-id="${person.id}">
            <div class="search-result-name">${escapeHtml(fullName)}</div>
            <div class="search-result-details">${escapeHtml(birthDate)}</div>
        </div>
    `;
}

/**
 * Create person popup content HTML
 * @param {Object} person - Person object
 * @param {Array} marriages - Array of marriage objects
 * @param {Array} parents - Array of parent objects
 * @param {Array} children - Array of child objects
 * @param {Array} siblings - Array of sibling objects
 * @returns {string} - HTML string for the popup content
 */
function createPersonPopupHTML(person, marriages, parents, children, siblings = []) {
    const fullName = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Inconnu(e)';
    let html = `<h3>${escapeHtml(fullName)}</h3>`;
    
    html += '<div class="info-section">';
    html += '<div class="info-section-title">Informations</div>';
    
    if (person.firstName) {
        html += `<div class="info-item"><span class="label">Prénom :</span>${escapeHtml(person.firstName)}</div>`;
    }
    if (person.lastName) {
        html += `<div class="info-item"><span class="label">Nom :</span>${escapeHtml(person.lastName)}</div>`;
    }
    if (person.birthDate) {
        html += `<div class="info-item"><span class="label">Naissance :</span>${escapeHtml(formatDateForDisplay(person.birthDate))}</div>`;
    }
    if (person.birthPlace) {
        html += `<div class="info-item"><span class="label">Lieu de naissance :</span>${escapeHtml(person.birthPlace)}</div>`;
    }
    if (person.deathDate) {
        html += `<div class="info-item"><span class="label">Décès :</span>${escapeHtml(formatDateForDisplay(person.deathDate))}</div>`;
    }
    if (person.deathPlace) {
        html += `<div class="info-item"><span class="label">Lieu de décès :</span>${escapeHtml(person.deathPlace)}</div>`;
    }
    if (person.titles) {
        html += `<div class="info-item"><span class="label">Titres :</span>${escapeHtml(person.titles)}</div>`;
    }
    if (person.property) {
        html += `<div class="info-item"><span class="label">Propriété :</span>${escapeHtml(person.property)}</div>`;
    }
    if (person.notes) {
        html += `<div class="info-item"><span class="label">Notes :</span>${escapeHtml(person.notes)}</div>`;
    }
    if (person.generation !== undefined && person.generation !== null) {
        html += `<div class="info-item"><span class="label">Génération :</span>${escapeHtml(String(person.generation))}</div>`;
    }
    if (person.planche) {
        const planches = Array.isArray(person.planche) ? person.planche : [person.planche];
        const planchesText = planches.join(', ');
        html += `<div class="info-item"><span class="label">Planche${planches.length > 1 ? 's' : ''} :</span>${escapeHtml(planchesText)}</div>`;
    }
    html += '</div>';
    
    if (marriages.length > 0) {
        html += '<div class="info-section">';
        html += '<div class="info-section-title">Mariages</div>';
        marriages.forEach(marriage => {
            const spouseName = marriage.spouse.fullName || 
                `${marriage.spouse.firstName || ''} ${marriage.spouse.lastName || ''}`.trim() || 
                'Inconnu(e)';
            html += '<div class="marriage-item">';
            html += `<div class="info-item"><span class="label">Conjoint :</span>${escapeHtml(spouseName)}</div>`;
            if (marriage.date) {
                html += `<div class="info-item"><span class="label">Date :</span>${escapeHtml(formatDateForDisplay(marriage.date))}</div>`;
            }
            if (marriage.place) {
                html += `<div class="info-item"><span class="label">Lieu :</span>${escapeHtml(marriage.place)}</div>`;
            }
            html += '</div>';
        });
        html += '</div>';
    }
    
    if (parents.length > 0) {
        html += '<div class="info-section">';
        html += '<div class="info-section-title">Parents</div>';
        parents.forEach(parent => {
            const parentName = parent.fullName || 
                `${parent.firstName || ''} ${parent.lastName || ''}`.trim() || 
                'Inconnu(e)';
            html += `<div class="info-item"><span class="label">Parent :</span>${escapeHtml(parentName)}</div>`;
        });
        html += '</div>';
    }
    
    if (siblings.length > 0) {
        html += '<div class="info-section">';
        html += '<div class="info-section-title">Fratrie</div>';
        html += `<div class="info-item"><span class="label">Nombre :</span>${siblings.length}</div>`;
        html += '<div class="child-list">';
        siblings.forEach(sibling => {
            const siblingName = sibling.fullName || 
                `${sibling.firstName || ''} ${sibling.lastName || ''}`.trim() || 
                'Inconnu(e)';
            html += `<div class="child-item">${escapeHtml(siblingName)}</div>`;
        });
        html += '</div>';
        html += '</div>';
    }
    
    if (children.length > 0) {
        html += '<div class="info-section">';
        html += '<div class="info-section-title">Enfants</div>';
        html += `<div class="info-item"><span class="label">Nombre :</span>${children.length}</div>`;
        html += '<div class="child-list">';
        children.forEach(child => {
            const childName = child.fullName || 
                `${child.firstName || ''} ${child.lastName || ''}`.trim() || 
                'Inconnu(e)';
            html += `<div class="child-item">${escapeHtml(childName)}</div>`;
        });
        html += '</div>';
        html += '</div>';
    }
    
    return html;
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

