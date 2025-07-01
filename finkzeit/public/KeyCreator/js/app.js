import * as api from "./api.js";
import { ErpRestApi } from "./handler/erpRestApi.js";
import numberHandler from "./handler/numberHandler.js";
import { initializeUI, addEventListeners, updateSessionInfo } from "./ui.js";
import { executeScriptsBasedOnConfig } from "./scripts.js";
import { verifyKey } from "./verifyKey.js";
import logger from "./logger.js";
import { initializeKeyFormatting } from "./formatKey.js";
import { initializeKeyReading } from "./readKey.js";
import { initializeCountrySelector } from "./countrySelector.js";

import { resetApp, startNewSession, isSessionValid, addAppStateListener } from "./state.js";

// Application state
let elements;
let transponderConfig;
let erpRestApi;

document.addEventListener("DOMContentLoaded", setup);

async function setup() {
    logger.debug("Setup starting");
    elements = initializeUI();
    addEventListeners(elements, startSession, handleManualNumberChange, handleConnectReader);
    await handleConnectReader();

    try {
        logger.debug("Creating ERP API instance...");
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
    }

    logger.debug("Initializing key formatting...");
    initializeKeyFormatting();
    
    logger.debug("Initializing key reading...");
    initializeKeyReading();
    
    logger.debug("Initializing country selector...");
    initializeCountrySelector();
    


    // Listen for app reset events to clear UI
    addAppStateListener("appReset", clearUI);
    addAppStateListener("appReactivated", () => {
        logger.debug("App reactivated, ready for new operations");
    });

    logger.debug("Setup completed");
    if (window.env.NODE_ENV === "development") {
        logger.debug("Running in development mode");
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
    const sessionId = startNewSession();
    logger.debug(`Recurring session ${sessionId} starting`);
    
    while (isSessionValid(sessionId)) {
        try {
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
    
    logger.debug(`Session ${sessionId} ended`);
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
