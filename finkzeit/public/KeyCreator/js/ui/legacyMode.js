import logger from "../core/logger.js";

let legacyModeActive = false;

export function initializeLegacyMode() {
    logger.debug("Initializing legacy mode functionality");
    
    const legacyModeBtn = document.getElementById("legacyModeToggle");
    
    if (!legacyModeBtn) {
        logger.error("Legacy mode toggle button not found");
        return;
    }
    
    // Load saved state from localStorage
    const savedState = localStorage.getItem("legacyModeActive");
    if (savedState !== null) {
        legacyModeActive = savedState === "true";
        logger.debug(`Loaded legacy mode state from localStorage: ${legacyModeActive}`);
    }
    
    // Enable the button and add event listener
    legacyModeBtn.disabled = false;
    legacyModeBtn.addEventListener("click", toggleLegacyMode);
    
    // Update button appearance
    updateLegacyModeButton();
    
    logger.debug("Legacy mode button initialized and enabled");
}

export function toggleLegacyMode() {
    legacyModeActive = !legacyModeActive;
    updateLegacyModeButton();
    
    // Store in localStorage for persistence
    localStorage.setItem("legacyModeActive", legacyModeActive.toString());
    
    logger.debug(`Legacy mode ${legacyModeActive ? 'activated' : 'deactivated'}`);
    
    // Show immediate feedback to user
    const actionMessage = legacyModeActive 
        ? "🔧 LEGACY-MODUS AKTIV - Extra Technologien im Schlüssel werden ignoriert" 
        : "✅ Legacy-Modus deaktiviert - Nur exakt passende Schlüssel erlaubt";
    
    // Update UI to show the current state
    if (window.updateSessionInfo) {
        window.updateSessionInfo("action", actionMessage);
    }
}

function updateLegacyModeButton() {
    const legacyModeBtn = document.getElementById("legacyModeToggle");
    
    if (!legacyModeBtn) return;
    
    if (legacyModeActive) {
        legacyModeBtn.classList.add("active");
        legacyModeBtn.innerHTML = `
            <span class="action-icon" aria-hidden="true">🔧</span>
            <span>LEGACY: AKTIV</span>
        `;
        legacyModeBtn.setAttribute("data-legacy-mode", "on");
        legacyModeBtn.setAttribute("aria-pressed", "true");
        legacyModeBtn.style.backgroundColor = "#f39c12";
        legacyModeBtn.style.color = "white";
        legacyModeBtn.style.borderColor = "#e67e22";
        legacyModeBtn.style.fontWeight = "bold";
        legacyModeBtn.style.boxShadow = "0 0 10px rgba(243, 156, 18, 0.5)";
    } else {
        legacyModeBtn.classList.remove("active");
        legacyModeBtn.innerHTML = `
            <span class="action-icon" aria-hidden="true">🔧</span>
            <span>Legacy: AUS</span>
        `;
        legacyModeBtn.setAttribute("data-legacy-mode", "off");
        legacyModeBtn.setAttribute("aria-pressed", "false");
        legacyModeBtn.style.backgroundColor = "";
        legacyModeBtn.style.color = "";
        legacyModeBtn.style.borderColor = "";
        legacyModeBtn.style.fontWeight = "";
        legacyModeBtn.style.boxShadow = "";
    }
}

export function isLegacyModeActive() {
    return legacyModeActive;
}

export function setLegacyMode(active) {
    legacyModeActive = active;
    updateLegacyModeButton();
    localStorage.setItem("legacyModeActive", legacyModeActive.toString());
    logger.debug(`Legacy mode set to: ${active}`);
}
