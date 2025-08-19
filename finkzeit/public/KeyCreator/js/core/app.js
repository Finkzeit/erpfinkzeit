// Core imports
import logger from "./logger.js";
import {
    resetApp,
    startNewSession,
    isSessionValid,
    addAppStateListener,
    getIsFormatting,
    getIsReading,
    addFormattingChangeListener,
    addReadingChangeListener,
} from "./state.js";

// API and handler imports
import * as api from "../handler/api.js";
import { ErpRestApi } from "../api/erpRestApi.js";
import numberHandler from "../handler/numberHandler.js";

// UI imports
import { initializeUI, addEventListeners, updateSessionInfo } from "../ui/ui.js";
import { initializeTestMode } from "../ui/testMode.js";
import { initializeMuteToggle } from "../ui/muteHandler.js";

// Key operation imports
import { executeScriptsBasedOnConfig } from "../key-operations/scripts.js";
import { verifyKey } from "../key-operations/verifyKey.js";
import { initializeKeyFormatting } from "../key-operations/formatKey.js";
import { initializeKeyReading } from "../key-operations/readKey.js";

// Environment imports
import { updateEnvironmentDisplay } from "../api/environmentDetector.js";

// Application state
let elements;
let transponderConfig;
let erpRestApi;
let currentSessionId = null;

document.addEventListener("DOMContentLoaded", setup);

export async function setup() {
    logger.debug("Setup starting");

    try {
        await initializeElements();
        await setupEventListeners();
        await initializeKeyCreator();
        await setupTestMode();
        await initializeErpApi();
        await initializeKeyFormatting();
        await initializeKeyReading();
        await initializeMuteToggle();
        await updateEnvironmentDisplay();

        // Listen for app reset events to clear UI
        addAppStateListener("appReset", clearUI);
        addAppStateListener("appReactivated", () => {
            logger.debug("App reactivated, ready for new operations");
        });

        logger.debug("Setup completed");
        logger.debug("Running in development mode");
    } catch (error) {
        logger.error("Setup failed:", error);
    }
}

// ============================================================================
// Initialization Functions
// ============================================================================

async function initializeElements() {
    logger.debug("Initializing elements");
    elements = initializeUI();
    logger.debug("Elements initialized:", elements);
}

async function setupEventListeners() {
    logger.debug("Adding event listeners");
    addEventListeners(elements, startSession, handleManualNumberChange, handleConnectReader);
    logger.debug("Event listeners added");
}

async function initializeKeyCreator() {
    logger.debug("Initializing key creator");
    await handleConnectReader();
}

async function setupTestMode() {
    logger.debug("Initializing test mode functionality");
    initializeTestMode();
    logger.debug("Test mode button initialized and enabled");
}

async function initializeErpApi() {
    logger.debug("Creating ERP API instance...");
    try {
        erpRestApi = new ErpRestApi();
        window.erpRestApi = erpRestApi;
        await erpRestApi.getTransponderConfigurationList(elements.firmenSelect);
        logger.debug("ERP API initialized successfully");
    } catch (error) {
        logger.error("Failed to initialize ERP API:", error);
        if (!erpRestApi) {
            logger.debug("Creating fallback ERP API instance...");
            erpRestApi = new ErpRestApi();
            window.erpRestApi = erpRestApi;
            logger.debug("Fallback ERP API instance created and set globally");
        }
        updateSessionInfo("action", "ERP API Initialisierung fehlgeschlagen. Bitte überprüfen Sie Ihre Verbindung.");
    }
}

// ============================================================================
// UI Management Functions
// ============================================================================

function clearUI() {
    logger.debug("Clearing UI due to app reset");

    // Reset UI elements
    if (elements) {
        if (elements.firmenSelect) {
            elements.firmenSelect.innerHTML = '<option value="">Firma auswählen...</option>';
        }
        if (elements.numberInput) {
            elements.numberInput.value = "";
        }
    }

    // Reset session info
    updateSessionInfo("reset");
    updateSessionInfo("status", "Anwendung zurückgesetzt. Bitte Firma auswählen.");
    updateSessionInfo("action", "Anwendung wurde zurückgesetzt");

    // Clear any detected keys
    if (window.clearKeys) {
        window.clearKeys();
    }

    // Clear transponder config
    transponderConfig = null;
}

function resetApplication() {
    resetApp();
}

function handleManualNumberChange() {
    numberHandler.readFromInput();
}

function handleError(error) {
    if (error instanceof DOMException && error.message.includes("Must be handling a user gesture to show a permission request")) {
        elements.connectReaderButton.style.display = "block";
    } else {
        logger.error("Error:", error);
    }
}

// ============================================================================
// Reader Connection Functions
// ============================================================================

function handleConnectionStateChange(isConnected) {
    if (!elements || !elements.connectReaderButton) {
        return;
    }

    if (isConnected) {
        elements.connectReaderButton.style.display = "none";
        updateSessionInfo("action", "Leser verbunden");
    } else {
        elements.connectReaderButton.style.display = "block";
        updateSessionInfo("action", "Leser nicht verbunden. Klicken Sie auf 'Leser verbinden', um zu starten.");
    }
}

async function handleConnectReader() {
    logger.debug("handleConnectReader called");
    try {
        await api.startKeyCreator(handleConnectionStateChange);
        logger.debug("Key creator started");

        const version = await api.getVersion();
        logger.debug(`Version: ${version}`);
        updateSessionInfo("action", `Leser Version: ${version}`);
    } catch (error) {
        handleError(error);
        updateSessionInfo("action", "Leser nicht verbunden. Klicken Sie auf 'Leser verbinden', um zu starten.");
    }
}

// ============================================================================
// Session Management Functions
// ============================================================================

async function startSession() {
    logger.debug("startSession starting");
    const selectedFirmaId = elements.firmenSelect.value;
    if (!selectedFirmaId) {
        logger.warn("No valid company selected");
        return;
    }

    try {
        logger.debug(`Selected Firma ID: ${selectedFirmaId}`);
        transponderConfig = await erpRestApi.getTransponderConfiguration(selectedFirmaId);
        logger.debug("Transponder configuration retrieved:", transponderConfig);

        numberHandler.reset();
        await numberHandler.initialize(transponderConfig);

        const requiredKeys = await transponderConfig.getRequiredKeys();
        initializeSessionUI(requiredKeys);

        await recurringSession(requiredKeys);
    } catch (error) {
        logger.error("Error in startSession:", error);
    }
}

function initializeSessionUI(requiredKeys) {
    updateSessionInfo("reset");
    updateSessionInfo("status", "Suche");
    updateSessionInfo("requiredTech", requiredKeys);

    requiredKeys.forEach((key) =>
        updateSessionInfo("tag", {
            type: key,
            uid: transponderConfig.tags[key]?.uid || "N/A",
            status: "Suche",
        })
    );
}

async function recurringSession(requiredKeys) {
    currentSessionId = startNewSession();
    logger.debug(`Recurring session ${currentSessionId} starting`);

    const sessionState = createSessionState();
    setupSessionStateListeners(sessionState);

    while (isSessionValid(currentSessionId)) {
        try {
            const wasPaused = await handleSessionPause(sessionState);
            if (wasPaused) {
                continue; // Skip the rest of the loop iteration if session was paused
            }

            numberHandler.readFromInput();

            const keyVerified = await verifyKey(transponderConfig, numberHandler);
            if (!keyVerified) {
                handleKeyVerificationFailure();
                continue;
            }

            updateSessionInfo("number", transponderConfig.getNumber());
            updateDetectedKeys(requiredKeys);

            const scriptResult = await executeSessionScripts(requiredKeys);
            await handleSessionResult(scriptResult, requiredKeys);
        } catch (error) {
            logger.error("Error in recurring session:", error);
            updateSessionInfo("status", "Fehler");
            updateSessionInfo("action", `Fehler aufgetreten: ${error.message}`);
            break;
        }
    }

    logger.debug(`Session ${currentSessionId} ended`);
}

function createSessionState() {
    return {
        sessionPaused: false,
        pauseResolve: null,
    };
}

function setupSessionStateListeners(sessionState) {
    const onFormattingChange = (isFormatting) => {
        handleStateChange(isFormatting, sessionState, "Formatting");
    };

    const onReadingChange = (isReading) => {
        handleStateChange(isReading, sessionState, "Reading");
    };

    addFormattingChangeListener(onFormattingChange);
    addReadingChangeListener(onReadingChange);
}

function handleStateChange(isActive, sessionState, operation) {
    if (isActive && !sessionState.sessionPaused) {
        logger.debug(`${operation} started, pausing main session loop`);
        sessionState.sessionPaused = true;
    } else if (!isActive && sessionState.sessionPaused) {
        logger.debug(`${operation} ended, resuming main session loop`);
        sessionState.sessionPaused = false;
        if (sessionState.pauseResolve) {
            sessionState.pauseResolve();
            sessionState.pauseResolve = null;
        }
    }
}

async function handleSessionPause(sessionState) {
    if (getIsFormatting() || getIsReading()) {
        if (!sessionState.sessionPaused) {
            logger.debug("Formatting or reading mode active, pausing main loop");
            sessionState.sessionPaused = true;
        }

        await new Promise((resolve) => {
            sessionState.pauseResolve = resolve;
        });
        return true; // Indicate that session was paused
    }
    return false; // Indicate that session was not paused
}

function handleKeyVerificationFailure() {
    logger.warn("Key verification failed, restarting session");
    updateSessionInfo("status", "Verifizierung fehlgeschlagen");
    updateSessionInfo("action", "Schlüsselverifizierung fehlgeschlagen. Bitte versuchen Sie es erneut.");
}

function updateDetectedKeys(requiredKeys) {
    requiredKeys.forEach((key) => {
        updateSessionInfo("tag", {
            type: key,
            uid: transponderConfig.tags[key]?.uid || "N/A",
            status: "Erkannt",
        });
    });
}

async function executeSessionScripts(requiredKeys) {
    return await executeScriptsBasedOnConfig(transponderConfig, requiredKeys, erpRestApi);
}

async function handleSessionResult(scriptResult, requiredKeys) {
    const { allScriptsExecuted, sessionResult: result, errors } = scriptResult;

    if (allScriptsExecuted && result === "success") {
        logger.debug("All scripts executed successfully");
        updateSessionInfo("status", "Abgeschlossen");
        updateSessionInfo("action", "Alle Operationen erfolgreich abgeschlossen");
        numberHandler.incrementNumber(elements.numberInput);
    } else {
        logger.warn("Some operations failed");
        updateSessionInfo("status", "Fehlgeschlagen");
        const errorMessage =
            errors.length > 0
                ? `Die folgenden Operationen sind fehlgeschlagen:\n${errors.join("\n")}`
                : "Einige Operationen sind fehlgeschlagen. Bitte versuchen Sie es erneut.";
        updateSessionInfo("action", errorMessage);
    }

    updateUIForNextSession(requiredKeys, allScriptsExecuted, result);
}

function updateUIForNextSession(requiredKeys, allScriptsExecuted, sessionResult) {
    if (elements.ui) {
        elements.ui.textContent = "Schlüssel wird gesucht";
    } else {
        logger.error("UI element not found");
    }

    updateSessionInfo("reset");
    updateSessionInfo("status", "Suche");
    updateSessionInfo("requiredTech", requiredKeys);

    requiredKeys.forEach((key) =>
        updateSessionInfo("tag", {
            type: key,
            uid: transponderConfig.tags[key]?.uid || "N/A",
            status: "Suche",
        })
    );

    logger.debug("Session restarted");
    const resultMessage =
        allScriptsExecuted && sessionResult === "success"
            ? `✅ Schlüssel ${transponderConfig.getNumber()} fertig, neuen Schlüssel auf den Leser legen`
            : "❌ Schlüssel fehlgeschlagen, bitte versuchen Sie es erneut";
    updateSessionInfo("action", resultMessage);
}

// ============================================================================
// Global Exports
// ============================================================================

window.transponderConfig = () => transponderConfig;
window.erpRestApi = () => erpRestApi;
window.updateSessionInfo = updateSessionInfo;
window.resetApplication = resetApplication;

export { transponderConfig, erpRestApi };
