import * as api from "./api.js";
import { ErpRestApi } from "./handler/erpRestApi.js";
import numberHandler from "./handler/numberHandler.js";
import { initializeUI, addEventListeners, updateSessionInfo } from "./ui.js";
import { executeScriptsBasedOnConfig } from "./scripts.js";
import { verifyKey } from "./verifyKey.js";
import logger from "./logger.js";
import { initializeKeyOperation } from "./keyOperation.js";

let elements;
let transponderConfig;
let erpRestApi; // Declare this at the top level
let sessionActive = false;

let timeStart;
let timeStop;

document.addEventListener("DOMContentLoaded", setup);

export function inSession() {
    return sessionActive;
}

async function setup() {
    logger.debug("Setup starting");
    elements = initializeUI();
    addEventListeners(elements, startSession, handleManualNumberChange, handleConnectReader);
    await handleConnectReader();

    erpRestApi = new ErpRestApi(); // Create a single instance
    await erpRestApi.getTransponderConfigurationList(elements.firmenSelect);

    initializeKeyOperation(erpRestApi); // Pass erpRestApi instance

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
    // If a session is already running, stop it first
    if (sessionActive) {
        sessionActive = false;
        timeStart = Date.now();
        logger.debug("Session already active, stopping it");
        // Wait for ongoing operations to complete
        await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    logger.debug("startSession starting");
    try {
        logger.debug(`Selected Firma ID: ${elements.firmenSelect.value}`);
        transponderConfig = await erpRestApi.getTransponderConfiguration(elements.firmenSelect.value);
        logger.debug("Transponder configuration retrieved:", transponderConfig);

        numberHandler.reset();
        await numberHandler.initialize(transponderConfig);

        const requiredKeys = transponderConfig.getRequiredKeys();
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

        // Set sessionActive to true only after all setup is complete
        sessionActive = true;

        await recurringSession(transponderConfig);
    } catch (error) {
        logger.error("Error in startSession:", error);
    } finally {
        sessionActive = false;
    }
}

async function recurringSession(transponderConfig) {
    logger.debug("Recurring session starting");
    while (sessionActive) {
        try {
            numberHandler.readFromInput();

            const keyVerified = await verifyKey(transponderConfig, numberHandler);
            if (!keyVerified) {
                if (!sessionActive) {
                    timeStop = Date.now() - timeStart;
                    logger.debug(`Session cancelled, stopping recurring session after ${timeStop}ms`);
                    break;
                }
                logger.warn("Key verification failed, restarting session");
                updateSessionInfo("status", "Verifizierung fehlgeschlagen");
                updateSessionInfo("action", "Schlüsselverifizierung fehlgeschlagen. Bitte versuchen Sie es erneut.");
                continue;
            }

            updateSessionInfo("number", transponderConfig.getNumber());
            const requiredKeys = transponderConfig.getRequiredKeys();
            requiredKeys.forEach((key) => {
                updateSessionInfo("tag", {
                    type: key,
                    uid: transponderConfig.tags[key]?.uid || "N/A",
                    status: "Erkannt",
                });
            });

            const { allScriptsExecuted, sessionResult, errors } = await executeScriptsBasedOnConfig(transponderConfig, erpRestApi);

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
    logger.debug("Session has ended");
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
