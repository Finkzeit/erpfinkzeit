import logger from "./logger.js";

let testModeActive = false;

export function initializeTestMode() {
    logger.debug("Test mode functionality disabled - button remains for future use");
    
    const testModeBtn = document.getElementById("testModeToggle");
    
    if (!testModeBtn) {
        logger.error("Test mode toggle button not found");
        return;
    }
    
    // Set button to disabled state
    testModeBtn.disabled = true;
    testModeBtn.textContent = "Testmodus: DEAKTIVIERT";
    testModeBtn.setAttribute("data-test-mode", "disabled");
    testModeBtn.title = "Testmodus-Funktionalität wird später hinzugefügt";
    
    logger.debug("Test mode button disabled");
}

export function toggleTestMode() {
    testModeActive = !testModeActive;
    updateTestModeButton();
    
    // Store in localStorage for persistence
    localStorage.setItem("testModeActive", testModeActive.toString());
    
    logger.debug(`Test mode ${testModeActive ? 'activated' : 'deactivated'}`);
    
    // You can add additional logic here based on test mode
    // For example, different API endpoints, debug logging, etc.
}

function updateTestModeButton() {
    const testModeBtn = document.getElementById("testModeToggle");
    
    if (testModeActive) {
        testModeBtn.classList.add("active");
        testModeBtn.textContent = "Testmodus: AKTIV";
        testModeBtn.setAttribute("data-test-mode", "on");
    } else {
        testModeBtn.classList.remove("active");
        testModeBtn.textContent = "Testmodus: AUS";
        testModeBtn.setAttribute("data-test-mode", "off");
    }
}

export function isTestModeActive() {
    // Test mode is always disabled for now
    return false;
}

export function setTestMode(active) {
    testModeActive = active;
    updateTestModeButton();
    localStorage.setItem("testModeActive", testModeActive.toString());
    logger.debug(`Test mode set to: ${active}`);
} 