import logger from "./logger.js";

let testModeActive = false;

export function initializeTestMode() {
    logger.debug("Initializing test mode functionality");
    
    const testModeBtn = document.getElementById("testModeToggle");
    
    if (!testModeBtn) {
        logger.error("Test mode toggle button not found");
        return;
    }
    
    // Load saved state from localStorage
    const savedState = localStorage.getItem("testModeActive");
    if (savedState !== null) {
        testModeActive = savedState === "true";
        logger.debug(`Loaded test mode state from localStorage: ${testModeActive}`);
    }
    
    // Enable the button and add event listener
    testModeBtn.disabled = false;
    testModeBtn.addEventListener("click", toggleTestMode);
    
    // Update button appearance
    updateTestModeButton();
    
    logger.debug("Test mode button initialized and enabled");
}

export function toggleTestMode() {
    testModeActive = !testModeActive;
    updateTestModeButton();
    
    // Store in localStorage for persistence
    localStorage.setItem("testModeActive", testModeActive.toString());
    
    logger.debug(`Test mode ${testModeActive ? 'activated' : 'deactivated'}`);
    
    // Show immediate feedback to user
    const actionMessage = testModeActive 
        ? "🧪 TESTMODUS AKTIV - Alle neuen Transponder werden als Testschlüssel markiert!" 
        : "✅ Testmodus deaktiviert - Normale Transponder-Erstellung";
    
    // Update UI to show the current state
    if (window.updateSessionInfo) {
        window.updateSessionInfo("action", actionMessage);
    }
}

function updateTestModeButton() {
    const testModeBtn = document.getElementById("testModeToggle");
    
    if (testModeActive) {
        testModeBtn.classList.add("active");
        testModeBtn.textContent = "🧪 TESTMODUS: AKTIV";
        testModeBtn.setAttribute("data-test-mode", "on");
        testModeBtn.setAttribute("aria-pressed", "true");
        testModeBtn.style.backgroundColor = "#ff6b6b";
        testModeBtn.style.color = "white";
        testModeBtn.style.borderColor = "#ff4757";
        testModeBtn.style.fontWeight = "bold";
        testModeBtn.style.boxShadow = "0 0 10px rgba(255, 107, 107, 0.5)";
    } else {
        testModeBtn.classList.remove("active");
        testModeBtn.textContent = "🧪 Testmodus: AUS";
        testModeBtn.setAttribute("data-test-mode", "off");
        testModeBtn.setAttribute("aria-pressed", "false");
        testModeBtn.style.backgroundColor = "";
        testModeBtn.style.color = "";
        testModeBtn.style.borderColor = "";
        testModeBtn.style.fontWeight = "";
        testModeBtn.style.boxShadow = "";
    }
}

export function isTestModeActive() {
    return testModeActive;
}

export function setTestMode(active) {
    testModeActive = active;
    updateTestModeButton();
    localStorage.setItem("testModeActive", testModeActive.toString());
    logger.debug(`Test mode set to: ${active}`);
} 