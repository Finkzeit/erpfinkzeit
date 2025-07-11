import * as api from "../handler/api.js";
import { ErpRestApi } from "../api/erpRestApi.js";
import numberHandler from "../handler/numberHandler.js";
import { initializeUI, addEventListeners, updateSessionInfo } from "../ui/ui.js";
import { executeScriptsBasedOnConfig } from "../key-operations/scripts.js";
import { verifyKey } from "../key-operations/verifyKey.js";
import logger from "./logger.js";
import { initializeKeyFormatting } from "../key-operations/formatKey.js";
import { initializeKeyReading } from "../key-operations/readKey.js";
import { updateEnvironmentDisplay } from "../api/environmentDetector.js";
import { initializeTestMode } from "../ui/testMode.js";
import { initializeMuteToggle } from "../ui/muteHandler.js";

import {
    resetApp,
    startNewSession,
    isSessionValid,
    addAppStateListener,
    getIsFormatting,
    getIsReading,
    setIsFormatting,
    setIsReading,
    addFormattingChangeListener,
    addReadingChangeListener,
} from "./state.js";

// Application state
let elements;
let transponderConfig;
let erpRestApi;
let currentSessionPromise = null;
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
        logger.debug("ERP API instance created, setting global...");
        window.erpRestApi = erpRestApi;
        logger.debug("Global ERP API set, loading configuration list...");
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

async function handleConnectReader() {
    logger.debug("handleConnectReader called");
    try {
        await api.startKeyCreator();
        elements.connectReaderButton.style.display = "none";
        logger.debug("Key creator started");

        const version = await api.getVersion();
        logger.debug(`Version: ${version}`);
        updateSessionInfo("action", `Leser Version: ${version}`);
    } catch (error) {
        handleError(error);
        updateSessionInfo("action", "Leser nicht verbunden. Klicken Sie auf 'Leser verbinden', um zu starten.");
    }
}

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

        await recurringSession(requiredKeys);
    } catch (error) {
        logger.error("Error in startSession:", error);
    }
}

async function recurringSession(requiredKeys) {
    currentSessionId = startNewSession();
    logger.debug(`Recurring session ${currentSessionId} starting`);

    // Set up state change listeners for this session
    let sessionPaused = false;
    let pauseResolve = null;

    const onFormattingChange = (isFormatting) => {
        if (isFormatting && !sessionPaused) {
            logger.debug("Formatting started, pausing main session loop");
            sessionPaused = true;
        } else if (!isFormatting && sessionPaused) {
            logger.debug("Formatting ended, resuming main session loop");
            sessionPaused = false;
            if (pauseResolve) {
                pauseResolve();
                pauseResolve = null;
            }
        }
    };

    const onReadingChange = (isReading) => {
        if (isReading && !sessionPaused) {
            logger.debug("Reading started, pausing main session loop");
            sessionPaused = true;
        } else if (!isReading && sessionPaused) {
            logger.debug("Reading ended, resuming main session loop");
            sessionPaused = false;
            if (pauseResolve) {
                pauseResolve();
                pauseResolve = null;
            }
        }
    };

    // Add listeners
    addFormattingChangeListener(onFormattingChange);
    addReadingChangeListener(onReadingChange);

    while (isSessionValid(currentSessionId)) {
        try {
            // Check if session should be paused
            if (getIsFormatting() || getIsReading()) {
                if (!sessionPaused) {
                    logger.debug("Formatting or reading mode active, pausing main loop");
                    sessionPaused = true;
                }

                // Wait for state to change back
                await new Promise((resolve) => {
                    pauseResolve = resolve;
                });
                continue;
            }

            numberHandler.readFromInput();

            const keyVerified = await verifyKey(transponderConfig, numberHandler);
            if (!keyVerified) {
                logger.warn("Key verification failed, restarting session");
                updateSessionInfo("status", "Verifizierung fehlgeschlagen");
                updateSessionInfo("action", "Schlüsselverifizierung fehlgeschlagen. Bitte versuchen Sie es erneut.");
                continue;
            }

            updateSessionInfo("number", transponderConfig.getNumber());
            requiredKeys.forEach((key) => {
                updateSessionInfo("tag", {
                    type: key,
                    uid: transponderConfig.tags[key]?.uid || "N/A",
                    status: "Erkannt",
                });
            });

            const { allScriptsExecuted, sessionResult, errors } = await executeScriptsBasedOnConfig(
                transponderConfig,
                requiredKeys,
                erpRestApi
            );

            if (allScriptsExecuted && sessionResult === "success") {
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
        } catch (error) {
            logger.error("Error in recurring session:", error);
            updateSessionInfo("status", "Fehler");
            updateSessionInfo("action", `Fehler aufgetreten: ${error.message}`);
            break;
        }
    }

    logger.debug(`Session ${currentSessionId} ended`);
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

// Make global variables available for other modules
window.transponderConfig = () => transponderConfig;
window.erpRestApi = () => erpRestApi;
window.updateSessionInfo = updateSessionInfo;
window.resetApplication = resetApplication;

export { transponderConfig, erpRestApi };
