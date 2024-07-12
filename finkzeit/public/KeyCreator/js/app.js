import * as api from "./api.js";
import { ErpRestApi } from "./handler/erpRestApi.js";
import numberHandler from "./handler/numberHandler.js";
import { initializeUI, addEventListeners, updateSessionInfo } from "./ui.js";
import { executeScriptsBasedOnConfig } from "./scripts.js";
import { verifyKey } from "./verifyKey.js";
import logger from "./logger.js";
import { initializeKeyFormatting } from "./formatKey.js";

let elements;
let transponderConfig;
let erpRestApi; // Declare this at the top level

document.addEventListener("DOMContentLoaded", setup);

async function setup() {
    logger.debug("Setup starting");
    elements = initializeUI();
    addEventListeners(elements, startSession, handleManualNumberChange, handleConnectReader);
    await handleConnectReader();

    erpRestApi = new ErpRestApi(); // Create a single instance
    await erpRestApi.getTransponderConfigurationList(elements.firmenSelect);

    initializeKeyFormatting();

    logger.debug("Setup completed");
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
    logger.debug("Recurring session starting");
    while (true) {
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

export { transponderConfig };
