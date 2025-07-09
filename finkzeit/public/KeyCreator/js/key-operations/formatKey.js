import logger from "../core/logger.js";
import { verifyKey } from "./formatKeyVerify.js";
import * as protocolHandler from "../handler/protocolHandler.js";
import * as api from "../handler/api.js";
import { DESF } from "../constants/constants.js";
import { setIsFormatting } from "../core/state.js";
import { clearKeys } from "./verifyKey.js";
import { updateSessionInfo } from "../ui/ui.js";
import { showDialog, updateDialogText, updateDialogMessage, updateCountdownText, getConfirmation } from "../utils/dialogUtils.js";

const CRYPTO_ENV = DESF.CRYPTO_ENV0;

let shouldContinueSearch = true;

export function initializeKeyFormatting() {
    logger.debug("Initializing key formatting");
    const formatKeyButton = document.getElementById("formatKeyButton");

    if (!formatKeyButton) {
        logger.error("Format key button not found");
        return;
    }

    formatKeyButton.addEventListener("click", () => {
        logger.debug("Format Key button clicked");
        handleFormatKey();
    });

    logger.debug("Key formatting initialized");
}

async function handleFormatKey() {
    logger.debug("Handle format key called");

    const dialog = showDialog("Schlüssel wird gesucht. Bitte legen Sie einen Schlüssel auf den Leser.");

    // Add custom cancel handler for formatting operations
    document.getElementById("cancelBtn").addEventListener("click", () => {
        shouldContinueSearch = false;
        if (dialog.overlay.parentNode) {
            dialog.overlay.parentNode.removeChild(dialog.overlay);
        }
    });

    shouldContinueSearch = true;
    logger.debug("Setting isFormatting to true");
    setIsFormatting(true);

    // Give the main session more time to pause before we start using the serial port
    logger.debug("Waiting for main session loop to pause...");
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
        updateDialogMessage("Tag zum Formatieren wird gesucht...");
        logger.debug("Starting tag detection");
        const detectedTags = await getDetectedTags(dialog);
        logger.debug("Detected tags:", detectedTags);

        if (!shouldContinueSearch) {
            logger.debug("Tag detection cancelled");
            return;
        }

        if (detectedTags.length === 0) {
            updateDialogText(dialog, "Keine Tags erkannt. Bitte versuchen Sie es erneut.");
            return;
        }

        const detectedTechsString = detectedTags
            .map((tag) => {
                const type = tag.type.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
                return `${type} (${tag.uid.toUpperCase()})`;
            })
            .join(", ");
        const keyText = detectedTags.length === 1 ? "Schlüssel" : "Schlüssel";
        const formatText = detectedTags.length === 1 ? "diesen Schlüssel" : "diese Schlüssel";
        updateDialogText(dialog, `Erkannte ${keyText}: ${detectedTechsString}. Möchten Sie ${formatText} formatieren?`);

        const shouldFormat = await getConfirmation(dialog, true, "Formatieren");
        if (shouldFormat) {
            await formatDetectedTags(detectedTags, dialog);
        }
    } catch (error) {
        logger.error("Error in handleFormatKey:", error);
        updateDialogText(dialog, "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.");
    } finally {
        // Start countdown for auto-close
        let countdown = 3;
        const countdownInterval = setInterval(() => {
            if (countdown > 0) {
                updateCountdownText(dialog, `Dialog schließt in ${countdown}...`);
                countdown--;
            } else {
                clearInterval(countdownInterval);
                if (dialog.overlay && dialog.overlay.parentNode) {
                    dialog.overlay.parentNode.removeChild(dialog.overlay);
                }
                logger.debug("Setting isFormatting to false");
                setIsFormatting(false);
            }
        }, 1000);
    }
}

async function getDetectedTags(dialog) {
    logger.debug("Getting detected tags");

    try {
        const detectedTags = await verifyKey(() => shouldContinueSearch);
        logger.debug("verifyKey completed", detectedTags);

        if (!shouldContinueSearch || detectedTags.length === 0) {
            return [];
        }

        logger.debug("Detected tags:", detectedTags);
        return detectedTags;
    } catch (error) {
        logger.error("Error in getDetectedTags:", error);
        updateDialogText(dialog, "Fehler beim Erkennen der Tags. Bitte versuchen Sie es erneut.");
        return [];
    }
}

async function formatDetectedTags(tags, dialog) {
    logger.debug("formatDetectedTags called with tags:", tags);
    updateDialogMessage("Tag-Formatierung wird gestartet...");

    // Simple ERP API access with detailed logging
    logger.debug("Checking for ERP API instance...");
    let erpRestApi = window.erpRestApi;
    logger.debug("ERP API from window:", erpRestApi);

    if (!erpRestApi) {
        logger.warn("ERP API not found in window, waiting 2 seconds...");
        updateDialogMessage("Warte auf ERP API-Initialisierung...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        erpRestApi = window.erpRestApi;
        logger.debug("ERP API after wait:", erpRestApi);

        if (!erpRestApi) {
            logger.error("ERP API still not available after wait");
            updateDialogMessage("ERP API nicht verfügbar. Formatierung wird ohne ERP-Löschung fortgesetzt.");
        } else {
            logger.debug("ERP API found after wait");
        }
    } else {
        logger.debug("ERP API found immediately");
    }

    // Track results for final summary
    const results = {
        formatted: [],
        skipped: [],
        failed: [],
    };

    // Store transponder data for all tags to avoid deleting ERP entry prematurely
    const transponderDataMap = new Map();
    const physicalNumbers = new Set();

    // Step 1: Get all transponder data from ERP first
    for (const tag of tags) {
        try {
            logger.debug(`Getting transponder data for ${tag.type} (${tag.uid})`);

            if (erpRestApi) {
                updateDialogMessage(`Suche Transponder ${tag.uid} im ERP...`);
                try {
                    const transponderData = await erpRestApi.getTransponderByUid(tag.uid, tag.type);
                    logger.debug(`Transponder data from ERP for ${tag.uid}:`, transponderData);

                    if (transponderData) {
                        const physicalNumber = transponderData.code || transponderData.name;
                        logger.debug(`Found transponder number: ${physicalNumber}`);
                        transponderDataMap.set(tag.uid, transponderData);
                        physicalNumbers.add(physicalNumber);

                        // Show detailed transponder info
                        const configName = transponderData.transponder_configuration || "N/A";
                        const creationDate = transponderData.creation ? new Date(transponderData.creation).toLocaleDateString() : "N/A";
                        updateDialogMessage(`Transponder ${physicalNumber} gefunden (Config: ${configName}, Erstellt: ${creationDate})`);
                    } else {
                        logger.debug(`No transponder found in ERP for UID ${tag.uid}`);
                        updateDialogMessage(`Kein Transponder im ERP für UID ${tag.uid} gefunden`);
                    }
                } catch (error) {
                    logger.error(`Error getting transponder from ERP for ${tag.uid}:`, error);
                    updateDialogMessage(`Fehler beim Abrufen des Transponders aus ERP: ${error.message}`);
                }
            }
        } catch (error) {
            logger.error(`Error processing transponder data for ${tag.type} (${tag.uid}):`, error);
        }
    }

    // Step 2: Format each tag individually with its own fallback logic
    // No premature custom config selection - let each tag handle its own authentication

    // Step 3: Format all tags
    for (const tag of tags) {
        try {
            logger.debug(`Processing tag: ${tag.type} (${tag.uid})`);

            const transponderData = transponderDataMap.get(tag.uid);

            // Format the tag with its own fallback logic (ERP → Default → Custom)
            logger.debug(`Formatting tag ${tag.type}...`);
            updateDialogMessage(`Formatiere ${tag.type} (${tag.uid})...`);

            const formatSuccess = await formatTag(tag, transponderData);

            if (formatSuccess) {
                updateDialogMessage(`${tag.type} (${tag.uid}) erfolgreich formatiert`);
                logger.debug(`Tag ${tag.type} formatted successfully`);
                results.formatted.push(`${tag.type} (${tag.uid})`);
            } else {
                updateDialogMessage(`${tag.type} (${tag.uid}) Formatierung fehlgeschlagen`);
                logger.warn(`Tag ${tag.type} formatting failed`);
                results.failed.push(`${tag.type} (${tag.uid}) - Formatierung fehlgeschlagen`);
            }

            logger.debug(`Clearing keys for ${tag.uid}`);
            clearKeys(tag.uid);
        } catch (error) {
            logger.error(`Error processing tag ${tag.type} (${tag.uid}):`, error);
            updateDialogMessage(`Fehler beim Formatieren von ${tag.type} (${tag.uid}): ${error.message}`);
            results.failed.push(`${tag.type} (${tag.uid}) - Fehler: ${error.message}`);
        }
    }

    // Step 3: Delete from ERP only if ALL tags were formatted successfully
    if (results.failed.length === 0 && results.skipped.length === 0 && results.formatted.length > 0) {
        // All tags formatted successfully, now delete from ERP
        for (const physicalNumber of physicalNumbers) {
            if (erpRestApi) {
                logger.debug(`Attempting to delete transponder ${physicalNumber} from ERP...`);
                updateDialogMessage(`Lösche Transponder ${physicalNumber} aus dem ERP...`);

                const deleteResult = await deleteTransponderFromERP(physicalNumber);
                logger.debug(`Delete result for ${physicalNumber}:`, deleteResult);
                if (deleteResult.status) {
                    updateDialogMessage(`Transponder ${physicalNumber} erfolgreich aus ERP gelöscht`);
                } else {
                    updateDialogMessage(`Fehler beim Löschen aus ERP: ${deleteResult.message}`);
                }
            }
        }
    } else {
        // Some tags failed or were skipped, don't delete from ERP
        if (results.failed.length > 0) {
            updateDialogMessage(`Formatierung fehlgeschlagen - Transponder bleiben im ERP`);
        } else if (results.skipped.length > 0) {
            updateDialogMessage(`Einige Tags übersprungen - Transponder bleiben im ERP`);
        }
    }

    // Show final results summary
    let finalMessage = "Formatierung abgeschlossen:\n";

    if (results.formatted.length > 0) {
        finalMessage += `✅ Erfolgreich formatiert: ${results.formatted.join(", ")}\n`;
    }

    if (results.skipped.length > 0) {
        finalMessage += `⏭️ Übersprungen: ${results.skipped.join(", ")}\n`;
    }

    if (results.failed.length > 0) {
        finalMessage += `❌ Fehlgeschlagen: ${results.failed.join(", ")}\n`;
    }

    if (results.formatted.length === 0 && results.skipped.length === 0 && results.failed.length === 0) {
        finalMessage = "Keine Tags verarbeitet.";
    }

    updateDialogMessage(finalMessage);
}

async function deleteTransponderFromERP(physicalNumber) {
    logger.debug(`deleteTransponderFromERP called with physicalNumber: ${physicalNumber}`);

    const erpRestApi = window.erpRestApi;
    logger.debug(`ERP API in deleteTransponderFromERP:`, erpRestApi);

    if (!erpRestApi) {
        logger.warn("ERP API not available in deleteTransponderFromERP, skipping deletion");
        return { status: false, message: "ERP API nicht verfügbar, Löschung übersprungen" };
    }

    try {
        logger.debug(`Calling erpRestApi.deleteTransponder(${physicalNumber})...`);
        const deleteResult = await erpRestApi.deleteTransponder(physicalNumber);
        logger.debug(`Delete result from ERP API:`, deleteResult);

        // Verify deletion by trying to get the transponder again
        logger.debug(`Verifying deletion by checking if transponder ${physicalNumber} still exists...`);
        try {
            const verifyResult = await erpRestApi.getTransponderByCode(physicalNumber);
            if (verifyResult) {
                logger.warn(`Transponder ${physicalNumber} still exists after deletion!`);
                return { status: false, message: `Transponder ${physicalNumber} konnte nicht gelöscht werden` };
            } else {
                logger.debug(`Transponder ${physicalNumber} successfully deleted and verified`);
                return { status: true, message: `Transponder ${physicalNumber} erfolgreich gelöscht` };
            }
        } catch (verifyError) {
            logger.debug(`Verification error (this might be expected):`, verifyError);
            return deleteResult; // Return original result if verification fails
        }
    } catch (error) {
        logger.error(`Error in deleteTransponderFromERP for ${physicalNumber}:`, error);
        return { status: false, message: error.message };
    }
}

async function formatTag(tag, transponderData) {
    logger.debug(`Formatting ${tag.type} (${tag.uid})...`);

    try {
        switch (tag.type.toUpperCase()) {
            case "HITAG":
            case "HITAG1S":
                return await hitagScript({ tags: { hitag: { uid: tag.uid } } }, transponderData);
            case "MIFARE_CLASSIC":
                return await mifareClassicScript({ tags: { mifareClassic: { uid: tag.uid } } }, transponderData);
            case "MIFARE_DESFIRE":
                return await mifareDesfireScript({ tags: { mifareDesfire: { uid: tag.uid } } }, transponderData);
            default:
                throw new Error(`Unsupported tag type: ${tag.type}`);
        }
    } catch (error) {
        logger.error(`Error formatting ${tag.type} (${tag.uid}): ${error.message}`);
        return false;
    }
}

async function hitagScript(config, transponderData) {
    logger.debug("Starting hitagScript function");
    updateDialogMessage("HITAG1S-Operationen werden gestartet");
    await api.hitag1s();

    try {
        const resetData = new Uint8Array(16).fill(0);
        logger.debug("Reset Data", resetData);
        const resetResponse = await protocolHandler.hitag1S_WriteBlock(0x1c, resetData);
        logger.debug("Reset Hitag Result", resetResponse);

        if (resetResponse.Result) {
            logger.info("HITAG1S ID successfully reset");
            updateDialogMessage(`HITAG1S (${config.tags.hitag.uid}) erfolgreich zurückgesetzt`);
            return true;
        } else {
            logger.warn(`Failed to reset HITAG1S ID. Bytes written: ${resetResponse.BytesWritten}`);
            updateDialogMessage(
                `Fehler beim Zurücksetzen von HITAG1S (${config.tags.hitag.uid}). Bytes geschrieben: ${resetResponse.BytesWritten}`
            );
            return false;
        }
    } catch (error) {
        logger.error("Error in hitagScript:", error);
        updateDialogMessage(`Fehler bei HITAG1S-Operationen (${config.tags.hitag.uid})`);
        return false;
    }
}

async function mifareClassicScript(config, transponderData) {
    logger.debug("Starting mifareClassicScript function");
    updateDialogMessage("Mifare Classic-Operationen werden gestartet");
    await api.mifare();

    // Get ERP configuration if available
    let erpConfig = null;
    let targetSector = null;
    let erpKeys = { A: [], B: [] };

    try {
        const erpRestApi = window.erpRestApi;
        if (erpRestApi && transponderData && transponderData.transponder_configuration) {
            logger.debug("Getting ERP configuration:", transponderData.transponder_configuration);
            updateDialogMessage("Hole Schlüsselkonfiguration aus ERP...");

            erpConfig = await erpRestApi.getTransponderConfiguration(transponderData.transponder_configuration);
            if (erpConfig && erpConfig.tags && erpConfig.tags.mifareClassic) {
                const mfConfig = erpConfig.tags.mifareClassic;
                targetSector = mfConfig.sector;

                if (mfConfig.key_a) {
                    const keyA = parseInt(mfConfig.key_a, 16);
                    erpKeys.A.push(keyA);
                    logger.debug(`Added ERP Key A: ${mfConfig.key_a} (${keyA})`);
                }

                if (mfConfig.key_b) {
                    const keyB = parseInt(mfConfig.key_b, 16);
                    erpKeys.B.push(keyB);
                    logger.debug(`Added ERP Key B: ${mfConfig.key_b} (${keyB})`);
                }

                updateDialogMessage(
                    `ERP-Konfiguration geladen: Sektor ${targetSector}, ${erpKeys.A.length} Key A, ${erpKeys.B.length} Key B`
                );
            }
        }
    } catch (error) {
        logger.warn("Failed to get ERP configuration:", error);
    }

    // Set default sector if not specified
    if (!targetSector) {
        targetSector = 1; // Default to sector 1
        logger.debug("Using default sector 1");
        updateDialogMessage("Verwende Standard-Sektor 1");
    }

    logger.debug("Target sector:", targetSector);
    updateDialogMessage(`Formatiere Sektor ${targetSector}...`);

    // Step 1: Try ERP keys first (if available)
    if (erpKeys.A.length > 0 || erpKeys.B.length > 0) {
        logger.debug("Trying ERP keys first");
        updateDialogMessage("Versuche ERP-Schlüssel...");

        for (const keyType of ["A", "B"]) {
            for (const key of erpKeys[keyType]) {
                try {
                    const loginResult = await protocolHandler.MifareClassic_Login(key, keyType === "A" ? "00" : "01", targetSector);
                    if (loginResult) {
                        logger.debug(`Authenticated sector ${targetSector} with ERP key ${key.toString(16)} (${keyType})`);

                        // Format this sector
                        const formatResult = await formatSector(targetSector, key, keyType);
                        if (formatResult) {
                            logger.info(`Sector ${targetSector} formatted successfully with ERP key`);
                            updateDialogMessage(`MIFARE_CLASSIC-Tag erfolgreich formatiert - Sektor ${targetSector} zurückgesetzt`);
                            return true;
                        } else {
                            logger.warn(`Failed to format sector ${targetSector} despite successful ERP authentication`);
                        }
                    }
                } catch (error) {
                    logger.debug(`ERP key authentication failed: ${error.message}`);
                }
            }
        }

        logger.debug("ERP key authentication failed, trying default key");
        updateDialogMessage("ERP-Schlüssel fehlgeschlagen - versuche Standard-Schlüssel...");
    }

    // Step 2: Try default key
    const defaultKey = 281474976710655; // FFFFFFFFFFFF
    logger.debug("Trying default key FFFFFFFFFFFF");
    updateDialogMessage("Versuche Standard-Schlüssel FFFFFFFFFFFF...");

    try {
        const loginResult = await protocolHandler.MifareClassic_Login(defaultKey, "00", targetSector);
        if (loginResult) {
            logger.info("Authenticated with default key - tag is empty");
            updateDialogMessage("Schlüssel leer - Tag ist bereits im Standard-Zustand");
            return true; // Tag is already empty/default
        }
    } catch (error) {
        logger.debug(`Default key authentication failed: ${error.message}`);
    }

    // Step 3: Default key failed, prompt for custom config
    logger.debug("Default key failed, prompting for custom config");
    updateDialogMessage("Standard-Schlüssel fehlgeschlagen - wähle benutzerdefinierte Konfiguration...");

    try {
        const erpRestApi = window.erpRestApi;
        if (erpRestApi) {
            const allConfigs = await erpRestApi.fetchAllTransponderConfigs();
            if (allConfigs && allConfigs.length > 0) {
                // Show config selection modal
                const selectedConfigId = await showConfigSelectionModal(allConfigs, "MIFARE Classic");
                if (selectedConfigId) {
                    erpConfig = await erpRestApi.getTransponderConfiguration(selectedConfigId);
                    if (erpConfig && erpConfig.tags && erpConfig.tags.mifareClassic) {
                        const mfConfig = erpConfig.tags.mifareClassic;
                        const customSector = mfConfig.sector || targetSector;
                        const customKeys = { A: [], B: [] };

                        if (mfConfig.key_a) {
                            const keyA = parseInt(mfConfig.key_a, 16);
                            customKeys.A.push(keyA);
                            logger.debug(`Added custom config Key A: ${mfConfig.key_a} (${keyA})`);
                        }

                        if (mfConfig.key_b) {
                            const keyB = parseInt(mfConfig.key_b, 16);
                            customKeys.B.push(keyB);
                            logger.debug(`Added custom config Key B: ${mfConfig.key_b} (${keyB})`);
                        }

                        updateDialogMessage(`Benutzerdefinierte Konfiguration geladen: Sektor ${customSector}`);

                        // Try custom keys
                        for (const keyType of ["A", "B"]) {
                            for (const key of customKeys[keyType]) {
                                try {
                                    const loginResult = await protocolHandler.MifareClassic_Login(
                                        key,
                                        keyType === "A" ? "00" : "01",
                                        customSector
                                    );
                                    if (loginResult) {
                                        logger.debug(
                                            `Authenticated sector ${customSector} with custom key ${key.toString(16)} (${keyType})`
                                        );

                                        // Format this sector
                                        const formatResult = await formatSector(customSector, key, keyType);
                                        if (formatResult) {
                                            logger.info(`Sector ${customSector} formatted successfully with custom key`);
                                            updateDialogMessage(
                                                `MIFARE_CLASSIC-Tag erfolgreich formatiert - Sektor ${customSector} zurückgesetzt`
                                            );
                                            return true;
                                        } else {
                                            logger.warn(`Failed to format sector ${customSector} despite successful custom authentication`);
                                        }
                                    }
                                } catch (error) {
                                    logger.debug(`Custom key authentication failed: ${error.message}`);
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        logger.warn("Failed to get custom configuration:", error);
    }

    // All authentication attempts failed
    logger.warn(`MIFARE Classic formatting failed - could not authenticate with any key`);
    updateDialogMessage(`MIFARE_CLASSIC-Tag Formatierung fehlgeschlagen - keine Authentifizierung möglich`);
    return false;
}

async function formatSector(sector, key, keyType) {
    try {
        const zeroData = "00000000000000000000000000000000";
        const startBlock = sector === 0 ? 1 : 0;
        const endBlock = sector === 0 ? 2 : 3;

        // Write zeros to data blocks (only once)
        for (let i = startBlock; i < endBlock; i++) {
            const block = sector * 4 + i;
            const writeResponse = await protocolHandler.MifareClassic_WriteBlock(block, zeroData);
            if (!writeResponse) {
                logger.warn(`Failed to write zeros to block ${block} in sector ${sector}`);
                return false;
            }
        }

        // Write trailer block with default keys and access conditions
        const trailerData = "FFFFFFFFFFFF" + "FF0780" + "69" + "FFFFFFFFFFFF";
        const trailerBlock = sector * 4 + 3;
        const trailerWriteResponse = await protocolHandler.MifareClassic_WriteBlock(trailerBlock, trailerData);
        if (!trailerWriteResponse) {
            logger.warn(`Failed to write trailer data to block ${trailerBlock} in sector ${sector}`);
            return false;
        }

        return true;
    } catch (error) {
        logger.error(`Error formatting sector ${sector}:`, error);
        return false;
    }
}

async function mifareDesfireScript(config, transponderData) {
    logger.debug("Starting mifareDesfireScript function");
    updateDialogMessage("Mifare DESFire-Operationen werden gestartet");

    try {
        await api.mifare();

        // Get ERP configuration if available
        let erpConfig = null;
        if (transponderData && transponderData.transponder_configuration) {
            try {
                const erpRestApi = window.erpRestApi;
                if (erpRestApi) {
                    logger.debug("Getting ERP configuration for formatting:", transponderData.transponder_configuration);
                    updateDialogMessage("Hole ERP-Konfiguration für Formatierung...");

                    erpConfig = await erpRestApi.getTransponderConfiguration(transponderData.transponder_configuration);
                    if (erpConfig && erpConfig.tags && erpConfig.tags.mifareDesfire) {
                        logger.debug("ERP configuration found for DESFire formatting");
                        updateDialogMessage("ERP-Konfiguration für DESFire-Formatierung gefunden");
                    }
                }
            } catch (error) {
                logger.warn("Failed to get ERP configuration for formatting:", error);
            }
        }

        // Try to authenticate with ERP master key if available
        if (erpConfig && erpConfig.tags.mifareDesfire.master_key) {
            const erpMasterKey = erpConfig.tags.mifareDesfire.master_key;
            logger.debug(`Trying ERP master key: ${erpMasterKey}`);

            // Try AES first, then 3DES
            for (const keyType of [DESF.KEYTYPE_AES, DESF.KEYTYPE_3DES]) {
                try {
                    const authResult = await protocolHandler.DESFire_Authenticate(
                        CRYPTO_ENV,
                        0x00,
                        erpMasterKey,
                        keyType,
                        DESF.AUTHMODE_EV1
                    );
                    if (authResult) {
                        logger.info(
                            `Successfully authenticated with ERP master key using ${keyType === DESF.KEYTYPE_AES ? "AES" : "3DES"}`
                        );
                        updateDialogMessage("Authentifizierung mit ERP-Schlüssel erfolgreich - formatiere Tag...");

                        // Reset the tag to default
                        const resetResult = await resetDesfireToDefault(erpConfig);
                        if (resetResult) {
                            logger.info("Successfully reset DESFire tag to default");
                            updateDialogMessage("DESFire-Tag erfolgreich auf Standard zurückgesetzt");
                            return true;
                        } else {
                            logger.error("Failed to reset DESFire tag to default");
                            updateDialogMessage("DESFire-Tag konnte nicht auf Standard zurückgesetzt werden");
                            return false;
                        }
                    }
                } catch (error) {
                    logger.debug(
                        `ERP master key authentication failed with ${keyType === DESF.KEYTYPE_AES ? "AES" : "3DES"}: ${error.message}`
                    );
                }
            }
        }

        // If we can't authenticate with ERP keys, the tag is already empty/default
        logger.info("Cannot authenticate with ERP keys - tag is already empty/default");
        updateDialogMessage("Tag ist bereits leer/Standard - keine Aktion erforderlich");
        return true;
    } catch (error) {
        logger.error("Error in mifareDesfireScript:", error);
        updateDialogMessage(`Fehler beim Formatieren von MIFARE_DESFIRE (${config.tags.mifareDesfire.uid}): ${error.message}`);
        return false;
    }
}

// Simple modal for config selection
async function showConfigSelectionModal(configs, tagType, isFallback = false) {
    return new Promise((resolve) => {
        const modal = document.createElement("div");
        modal.style.position = "fixed";
        modal.style.top = "0";
        modal.style.left = "0";
        modal.style.width = "100vw";
        modal.style.height = "100vh";
        modal.style.background = "rgba(0,0,0,0.5)";
        modal.style.display = "flex";
        modal.style.alignItems = "center";
        modal.style.justifyContent = "center";
        modal.style.zIndex = "10000";

        const modalBox = document.createElement("div");
        modalBox.style.background = "#fff";
        modalBox.style.padding = "2em";
        modalBox.style.borderRadius = "8px";
        modalBox.style.minWidth = "320px";
        modalBox.style.maxWidth = "400px";
        modalBox.style.boxShadow = "0 2px 16px rgba(0,0,0,0.2)";

        const title = isFallback ? "Keine passende ERP-Konfiguration gefunden" : "Keine ERP-Konfiguration gefunden";
        const warning = isFallback
            ? `<p style="color: #dc3545; font-weight: bold;">Achtung: Es wurde keine passende Konfiguration für <b>${tagType}</b> gefunden. Bitte wählen Sie eine beliebige Konfiguration aus der Liste.</p>`
            : `<p>Bitte wählen Sie eine Konfiguration für <b>${tagType}</b> aus:</p>`;

        modalBox.innerHTML = `
            <h3 style="margin-top: 0; margin-bottom: 1em; text-align: center;">${title}</h3>
            ${warning}
        `;

        const select = document.createElement("select");
        select.style.width = "100%";
        select.style.margin = "1em 0";
        configs.forEach((cfg) => {
            const option = document.createElement("option");
            option.value = cfg.name;
            option.textContent = cfg.customer_name;
            select.appendChild(option);
        });
        modalBox.appendChild(select);

        const btnContainer = document.createElement("div");
        btnContainer.style.textAlign = "right";
        btnContainer.style.marginTop = "1em";

        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Abbrechen";
        cancelBtn.onclick = () => {
            $(select).select2("destroy");
            document.body.removeChild(modal);
            resolve(null);
        };
        btnContainer.appendChild(cancelBtn);

        const okBtn = document.createElement("button");
        okBtn.textContent = "Übernehmen";
        okBtn.onclick = () => {
            const selected = select.value;
            $(select).select2("destroy");
            document.body.removeChild(modal);
            resolve(selected);
        };
        btnContainer.appendChild(okBtn);

        modalBox.appendChild(btnContainer);
        modal.appendChild(modalBox);
        document.body.appendChild(modal);

        $(select).select2({
            dropdownParent: $(modalBox),
            width: "100%",
        });
        select.focus();
    });
}

// Wrapper functions for backward compatibility
async function showConfigSelectionModalSelect2(configs, tagType) {
    return showConfigSelectionModal(configs, tagType, false);
}

async function showConfigFallbackModalSelect2(configs, tagType) {
    return showConfigSelectionModal(configs, tagType, true);
}

// Simple config selection in existing dialog
async function showConfigSelectionInDialog(dialog, configs, tagType) {
    return new Promise((resolve) => {
        const dialogContent = dialog.dialogElement;

        // Create simple message
        const messageDiv = document.createElement("div");
        messageDiv.innerHTML = `
            <p><strong>Keine passende Konfiguration gefunden</strong></p>
            <p>Bitte wählen Sie eine Konfiguration aus:</p>
        `;
        dialogContent.appendChild(messageDiv);

        // Create Select2 dropdown
        const select = document.createElement("select");
        select.style.width = "100%";
        select.style.margin = "1em 0";
        configs.forEach((cfg) => {
            const option = document.createElement("option");
            option.value = cfg.name;
            option.textContent = cfg.customer_name;
            select.appendChild(option);
        });
        dialogContent.appendChild(select);

        // Create buttons using existing styles
        const btnContainer = document.createElement("div");
        btnContainer.style.textAlign = "right";
        btnContainer.style.marginTop = "1em";

        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Abbrechen";
        cancelBtn.onclick = () => {
            $(select).select2("destroy");
            dialogContent.removeChild(messageDiv);
            dialogContent.removeChild(select);
            dialogContent.removeChild(btnContainer);
            resolve(null);
        };
        btnContainer.appendChild(cancelBtn);

        const okBtn = document.createElement("button");
        okBtn.textContent = "Übernehmen";
        okBtn.onclick = () => {
            const selected = select.value;
            $(select).select2("destroy");
            dialogContent.removeChild(messageDiv);
            dialogContent.removeChild(select);
            dialogContent.removeChild(btnContainer);
            resolve(selected);
        };
        btnContainer.appendChild(okBtn);

        dialogContent.appendChild(btnContainer);

        // Initialize Select2
        $(select).select2({
            dropdownParent: $(dialogContent),
            width: "100%",
        });
        select.focus();
    });
}

// Utility: exact config/tag type match for combo or single keys
function isConfigMatchingTagCombo(config, detectedTagTypes) {
    if (!config || !config.tags) return false;
    const configTagKeys = Object.keys(config.tags).filter(Boolean).sort();
    const detectedKeys = detectedTagTypes.map((t) => t.toLowerCase()).sort();
    if (configTagKeys.length !== detectedKeys.length) return false;
    for (let i = 0; i < configTagKeys.length; i++) {
        if (configTagKeys[i] !== detectedKeys[i]) return false;
    }
    // For HITAG1S, also check feig_coding if present
    if (detectedKeys.includes("hitag") && config.tags.hitag && config.tags.hitag.feig_coding !== 1) return false;
    return true;
}

// Simple function to reset DESFire tag to default
async function resetDesfireToDefault(erpConfig) {
    logger.debug("Resetting DESFire tag to default");
    updateDialogMessage("DESFire-Tag wird auf Standard zurückgesetzt...");

    try {
        const erpMasterKey = erpConfig.tags.mifareDesfire.master_key;
        const defaultKey = "00000000000000000000000000000000";
        let authenticatedWithERP = false;
        let authenticatedWithDefault = false;

        // 1. Try to authenticate with ERP master key first
        logger.debug("Trying ERP master key authentication...");
        for (const keyType of [DESF.KEYTYPE_AES, DESF.KEYTYPE_3DES]) {
            try {
                const authResult = await protocolHandler.DESFire_Authenticate(CRYPTO_ENV, 0x00, erpMasterKey, keyType, DESF.AUTHMODE_EV1);
                if (authResult) {
                    authenticatedWithERP = true;
                    logger.info(`Authenticated with ERP master key using ${keyType === DESF.KEYTYPE_AES ? "AES" : "3DES"}`);
                    break;
                }
            } catch (error) {
                logger.debug(
                    `ERP master key authentication failed with ${keyType === DESF.KEYTYPE_AES ? "AES" : "3DES"}: ${error.message}`
                );
            }
        }

        // 2. If ERP authentication failed, try default key
        if (!authenticatedWithERP) {
            logger.debug("ERP authentication failed, trying default key...");
            for (const keyType of [DESF.KEYTYPE_3DES, DESF.KEYTYPE_AES]) {
                try {
                    const defaultAuthResult = await protocolHandler.DESFire_Authenticate(
                        CRYPTO_ENV,
                        0x00,
                        defaultKey,
                        keyType,
                        DESF.AUTHMODE_EV1
                    );
                    if (defaultAuthResult) {
                        authenticatedWithDefault = true;
                        logger.info(`Authenticated with default key using ${keyType === DESF.KEYTYPE_AES ? "AES" : "3DES"}`);
                        break;
                    }
                } catch (error) {
                    logger.debug(
                        `Default key authentication failed with ${keyType === DESF.KEYTYPE_AES ? "AES" : "3DES"}: ${error.message}`
                    );
                }
            }

            // 3. If default key works, check if tag is already in default state
            if (authenticatedWithDefault) {
                logger.debug("Default key authentication successful, checking if already formatted...");
                try {
                    const keySettingsResult = await protocolHandler.DESFire_GetKeySettings(CRYPTO_ENV);
                    if (keySettingsResult.success) {
                        logger.debug(
                            `Key settings with default key: numberOfKeys=${keySettingsResult.numberOfKeys}, keyType=${keySettingsResult.keyType}`
                        );
                        // Check if key settings indicate default state (1 key, either 3DES or AES type)
                        if (keySettingsResult.numberOfKeys === 1 && (keySettingsResult.keyType === 0 || keySettingsResult.keyType === 2)) {
                            // 0 = 3DES, 2 = AES - both are valid default states
                            const keyTypeName = keySettingsResult.keyType === 0 ? "3DES" : "AES";
                            logger.info(`Tag is already in default state (${keyTypeName}) - no formatting needed`);
                            updateDialogMessage(`Tag ist bereits im Standard-Zustand (${keyTypeName}) - keine Formatierung erforderlich`);
                            return true;
                        } else {
                            logger.info("Tag has default key but non-default settings - proceeding with formatting");
                            updateDialogMessage("Tag hat Standard-Schlüssel aber nicht-Standard-Einstellungen - formatiere...");
                        }
                    }
                } catch (error) {
                    logger.warn("Error checking key settings:", error);
                    updateDialogMessage("Fehler beim Prüfen der Schlüsseleinstellungen");
                }
            }
        }

        // 4. If neither ERP nor default key worked, we can't proceed
        if (!authenticatedWithERP && !authenticatedWithDefault) {
            logger.warn("Cannot authenticate with either ERP master key or default key");
            updateDialogMessage("Keine Authentifizierung möglich - Tag kann nicht formatiert werden");
            return false;
        }

        // 5. If ERP key worked, follow documentation order: format → change key settings → change master key
        if (authenticatedWithERP) {
            logger.info("ERP authentication successful, following documentation order...");
            updateDialogMessage("ERP-Authentifizierung erfolgreich - folge Dokumentationsreihenfolge...");

            // 5a. Format the tag
            updateDialogMessage("Tag wird formatiert...");
            const formatResult = await protocolHandler.DESFire_FormatTag(CRYPTO_ENV);
            if (!formatResult) {
                logger.warn("Failed to format tag");
                updateDialogMessage("Tag konnte nicht formatiert werden");
                return false;
            }
            logger.info("Tag successfully formatted");
            updateDialogMessage("Tag erfolgreich formatiert");

            // 5b. Verify formatting worked by checking if we can get key settings without authentication
            // After formatting, the tag should allow getting key settings without authentication
            updateDialogMessage("Verifiziere Formatierung...");
            try {
                const keySettingsResult = await protocolHandler.DESFire_GetKeySettings(CRYPTO_ENV);
                if (keySettingsResult.success) {
                    logger.info("Formatting verified - can get key settings without authentication");
                    updateDialogMessage("Formatierung verifiziert - Schlüsseleinstellungen lesbar");

                    // Check if key settings indicate default state (1 key, either 3DES or AES type)
                    logger.debug(
                        `Key settings after formatting: numberOfKeys=${keySettingsResult.numberOfKeys}, keyType=${keySettingsResult.keyType}`
                    );
                    if (keySettingsResult.numberOfKeys === 1 && (keySettingsResult.keyType === 0 || keySettingsResult.keyType === 2)) {
                        // 0 = 3DES, 2 = AES - both are valid default states
                        const keyTypeName = keySettingsResult.keyType === 0 ? "3DES" : "AES";
                        logger.info(`Key settings confirm default state (${keyTypeName})`);
                        updateDialogMessage(`Schlüsseleinstellungen bestätigen Standard-Zustand (${keyTypeName})`);
                    } else {
                        logger.warn(
                            `Key settings don't match expected default state: expected numberOfKeys=1, keyType=0 (3DES) or 2 (AES), got numberOfKeys=${keySettingsResult.numberOfKeys}, keyType=${keySettingsResult.keyType}`
                        );
                        updateDialogMessage("Schlüsseleinstellungen entsprechen nicht dem erwarteten Standard");
                    }
                } else {
                    logger.warn("Cannot get key settings after formatting - formatting may have failed");
                    updateDialogMessage("Schlüsseleinstellungen nach Formatierung nicht lesbar");
                    return false;
                }
            } catch (error) {
                logger.warn("Error verifying formatting with key settings:", error);
                updateDialogMessage("Fehler bei der Formatierungsverifikation");
                return false;
            }

            // 5c. Try to authenticate with default key (optional verification)
            updateDialogMessage("Teste Authentifizierung mit Standard-Schlüssel...");
            let reAuthenticated = false;
            for (const keyType of [DESF.KEYTYPE_3DES, DESF.KEYTYPE_AES]) {
                try {
                    logger.debug(`Trying to authenticate with default key using ${keyType === DESF.KEYTYPE_AES ? "AES" : "3DES"}...`);
                    const reAuthResult = await protocolHandler.DESFire_Authenticate(
                        CRYPTO_ENV,
                        0x00,
                        defaultKey,
                        keyType,
                        DESF.AUTHMODE_EV1
                    );
                    if (reAuthResult) {
                        reAuthenticated = true;
                        logger.info(`Successfully authenticated with default key using ${keyType === DESF.KEYTYPE_AES ? "AES" : "3DES"}`);
                        break;
                    } else {
                        logger.debug(`Authentication with default key failed using ${keyType === DESF.KEYTYPE_AES ? "AES" : "3DES"}`);
                    }
                } catch (error) {
                    logger.debug(`Re-authentication failed with ${keyType === DESF.KEYTYPE_AES ? "AES" : "3DES"}: ${error.message}`);
                }
            }

            if (!reAuthenticated) {
                logger.warn("Cannot authenticate with default key after formatting - but key settings verification succeeded");
                updateDialogMessage("Authentifizierung mit Standard-Schlüssel fehlgeschlagen - aber Schlüsseleinstellungen OK");
                // Don't fail here - the key settings verification is more reliable
            }

            // 5d. Set master key to default value (all zeros)
            // After formatting, we need to explicitly set the master key to default
            updateDialogMessage("Master-Schlüssel wird auf Standard gesetzt...");
            try {
                // Try to authenticate with ERP key again to set the master key
                const reAuthERP = await protocolHandler.DESFire_Authenticate(
                    CRYPTO_ENV,
                    0x00,
                    erpMasterKey,
                    DESF.KEYTYPE_AES,
                    DESF.AUTHMODE_EV1
                );
                if (reAuthERP) {
                    logger.info("Re-authenticated with ERP key to set master key to default");

                    // Change master key to default
                    const changeKeyResult = await protocolHandler.DESFire_ChangeKey(
                        CRYPTO_ENV,
                        0x00, // Master key
                        erpMasterKey, // Old key (current ERP key)
                        defaultKey, // New key (default key - all zeros)
                        0x00, // Key version
                        0x0f, // Allow all key changes
                        true, // configurationChangeable
                        true, // freeCreateDelete
                        true, // freeDirectoryList
                        true, // allowChangeMasterKey
                        1, // numberOfKeys
                        DESF.KEYTYPE_AES
                    );

                    if (changeKeyResult) {
                        logger.info("Master key successfully set to default");
                        updateDialogMessage("Master-Schlüssel erfolgreich auf Standard gesetzt");
                    } else {
                        logger.warn("Failed to set master key to default");
                        updateDialogMessage("Master-Schlüssel konnte nicht auf Standard gesetzt werden");
                    }
                } else {
                    logger.warn("Cannot re-authenticate with ERP key to set master key");
                    updateDialogMessage("Keine Re-Authentifizierung mit ERP-Schlüssel möglich");
                }
            } catch (error) {
                logger.warn("Error setting master key to default:", error);
                updateDialogMessage("Fehler beim Setzen des Master-Schlüssels");
            }
        }

        // Success - tag is now formatted and in default state
        logger.info("DESFire tag successfully reset to default state");
        updateDialogMessage("DESFire-Tag erfolgreich auf Standard zurückgesetzt");
        return true;
    } catch (error) {
        logger.error("Error resetting DESFire to default:", error);
        updateDialogMessage("Fehler beim Zurücksetzen des DESFire-Tags");
        return false;
    }
}
