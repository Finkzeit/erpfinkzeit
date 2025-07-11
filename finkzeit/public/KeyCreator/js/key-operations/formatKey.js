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

    // Step 3: Delete from ERP if all detected tags are in default state
    // This includes: successfully formatted tags, empty tags, and tags that are already in default state
    const allTagsInDefaultState = results.failed.length === 0 && results.skipped.length === 0 && results.formatted.length > 0;

    logger.debug("ERP deletion check:", {
        failed: results.failed.length,
        skipped: results.skipped.length,
        formatted: results.formatted.length,
        allTagsInDefaultState: allTagsInDefaultState,
        physicalNumbers: Array.from(physicalNumbers),
    });

    if (allTagsInDefaultState) {
        // All detected tags are in default state (formatted/empty), delete from ERP
        logger.debug("All tags in default state - proceeding with ERP deletion");

        if (physicalNumbers.size === 0) {
            logger.debug("No transponders found in ERP to delete");
            updateDialogMessage("Keine Transponder im ERP gefunden - nichts zu löschen");
        } else {
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
                } else {
                    logger.warn(`ERP API not available for deletion of ${physicalNumber}`);
                    updateDialogMessage(`ERP API nicht verfügbar für Löschung von ${physicalNumber}`);
                }
            }
        }
    } else {
        // Some tags failed or were skipped, don't delete from ERP
        logger.debug("ERP deletion skipped - not all tags in default state");
        if (results.failed.length > 0) {
            updateDialogMessage(`Formatierung fehlgeschlagen - Transponder bleiben im ERP`);
        } else if (results.skipped.length > 0) {
            updateDialogMessage(`Einige Tags übersprungen - Transponder bleiben im ERP`);
        } else if (results.formatted.length === 0) {
            updateDialogMessage(`Keine Tags verarbeitet - Transponder bleiben im ERP`);
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

    // Add ERP deletion status
    if (allTagsInDefaultState) {
        if (physicalNumbers.size === 0) {
            finalMessage += `\nℹ️ ERP-Löschung: Keine Transponder im ERP gefunden - nichts zu löschen`;
        } else if (erpRestApi) {
            finalMessage += `\n🗑️ ERP-Löschung: Transponder aus ERP entfernt`;
        } else {
            finalMessage += `\n⚠️ ERP-Löschung: ERP API nicht verfügbar - Transponder bleiben im ERP`;
        }
    } else if (results.failed.length > 0) {
        finalMessage += `\n⚠️ ERP-Löschung: Formatierung fehlgeschlagen - Transponder bleiben im ERP`;
    } else if (results.skipped.length > 0) {
        finalMessage += `\n⚠️ ERP-Löschung: Einige Tags übersprungen - Transponder bleiben im ERP`;
    } else if (results.formatted.length === 0) {
        finalMessage += `\n⚠️ ERP-Löschung: Keine Tags verarbeitet - Transponder bleiben im ERP`;
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
            logger.debug("MIFARE Classic tag is already in default state - returning true for ERP deletion");
            return true; // Tag is already empty/default - consider it formatted for ERP deletion
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

        // Check if ERP config exists - if yes, use it; if no, prompt for custom config
        let erpMasterKey = null;
        if (erpConfig && erpConfig.tags.mifareDesfire.master_key) {
            erpMasterKey = erpConfig.tags.mifareDesfire.master_key;
            logger.debug(`ERP config found, using ERP master key: ${erpMasterKey}`);
        } else {
            // No ERP config, prompt for custom config
            logger.info("No ERP config found - prompting for custom configuration");
            updateDialogMessage("Keine ERP-Konfiguration gefunden - versuche benutzerdefinierte Konfiguration...");

            try {
                const erpRestApi = window.erpRestApi;
                if (erpRestApi) {
                    const allConfigs = await erpRestApi.fetchAllTransponderConfigs();
                    if (allConfigs && allConfigs.length > 0) {
                        // Show config selection modal
                        const selectedConfigId = await showConfigSelectionModal(allConfigs, "MIFARE DESFire");
                        if (selectedConfigId) {
                            const customConfig = await erpRestApi.getTransponderConfiguration(selectedConfigId);
                            if (customConfig && customConfig.tags && customConfig.tags.mifareDesfire) {
                                erpMasterKey = customConfig.tags.mifareDesfire.master_key;
                                logger.debug(`Custom config selected, using master key: ${erpMasterKey}`);
                            }
                        }
                    }
                }
            } catch (error) {
                logger.warn("Failed to get custom configuration:", error);
            }
        }

        // Try ERP key with AES first
        let erpAuthSuccess = false;
        let erpAuthKeyType = null;
        if (erpMasterKey) {
            logger.debug(`Trying ERP master key with AES: ${erpMasterKey}`);
            updateDialogMessage("Versuche ERP-Schlüssel mit AES...");

            try {
                const authResult = await protocolHandler.DESFire_Authenticate(
                    CRYPTO_ENV,
                    0x00,
                    erpMasterKey,
                    DESF.KEYTYPE_AES,
                    DESF.AUTHMODE_EV1
                );
                if (authResult) {
                    erpAuthSuccess = true;
                    erpAuthKeyType = DESF.KEYTYPE_AES;
                    logger.info("Successfully authenticated with ERP master key using AES");
                    updateDialogMessage("Authentifizierung mit ERP-Schlüssel (AES) erfolgreich");
                }
            } catch (error) {
                logger.debug(`ERP master key authentication failed with AES: ${error.message}`);
            }
        }

        // If ERP key with AES failed, try default key with AES
        let defaultAuthSuccess = false;
        let defaultAuthKeyType = null;
        if (!erpAuthSuccess) {
            logger.debug("ERP key with AES failed, trying default key with AES");
            updateDialogMessage("ERP-Schlüssel mit AES fehlgeschlagen - versuche Standard-Schlüssel mit AES...");

            try {
                const defaultAuthResult = await protocolHandler.DESFire_Authenticate(
                    CRYPTO_ENV,
                    0x00,
                    "00000000000000000000000000000000",
                    DESF.KEYTYPE_AES,
                    DESF.AUTHMODE_EV1
                );
                if (defaultAuthResult) {
                    defaultAuthSuccess = true;
                    defaultAuthKeyType = DESF.KEYTYPE_AES;
                    logger.info("Successfully authenticated with default key using AES");
                    updateDialogMessage("Authentifizierung mit Standard-Schlüssel (AES) erfolgreich");
                }
            } catch (error) {
                logger.debug(`Default key authentication failed with AES: ${error.message}`);
            }
        }

        // If default key with AES failed, try default key with 3DES
        if (!defaultAuthSuccess) {
            logger.debug("Default key with AES failed, trying default key with 3DES");
            updateDialogMessage("Standard-Schlüssel mit AES fehlgeschlagen - versuche Standard-Schlüssel mit 3DES...");

            try {
                const defaultAuthResult = await protocolHandler.DESFire_Authenticate(
                    CRYPTO_ENV,
                    0x00,
                    "00000000000000000000000000000000",
                    DESF.KEYTYPE_3DES,
                    DESF.AUTHMODE_EV1
                );
                if (defaultAuthResult) {
                    defaultAuthSuccess = true;
                    defaultAuthKeyType = DESF.KEYTYPE_3DES;
                    logger.info("Successfully authenticated with default key using 3DES");
                    updateDialogMessage("Authentifizierung mit Standard-Schlüssel (3DES) erfolgreich");
                }
            } catch (error) {
                logger.debug(`Default key authentication failed with 3DES: ${error.message}`);
            }
        }

        // If default key with 3DES works, we're finished
        if (defaultAuthSuccess && defaultAuthKeyType === DESF.KEYTYPE_3DES) {
            logger.info("Default key with 3DES works - formatting complete");
            updateDialogMessage("Standard-Schlüssel mit 3DES funktioniert - Formatierung abgeschlossen");
            return true;
        }

        // Execute the formatting script with the determined authentication method
        return await executeDesfireFormattingScript(erpAuthSuccess, erpMasterKey, defaultAuthSuccess, defaultAuthKeyType);
    } catch (error) {
        logger.error("Error in mifareDesfireScript:", error);
        updateDialogMessage(`Fehler beim Formatieren von MIFARE_DESFIRE (${config.tags.mifareDesfire.uid}): ${error.message}`);
        return false;
    }
}

// ============================================================================
// DESFire Formatting Script Functions
// ============================================================================

/**
 * Main DESFire formatting script that orchestrates the entire process
 */
async function executeDesfireFormattingScript(erpAuthSuccess, erpMasterKey, defaultAuthSuccess, defaultAuthKeyType) {
    logger.debug("Executing DESFire formatting script");

    // Case 1: Default key with 3DES works - we're finished
    if (defaultAuthSuccess && defaultAuthKeyType === DESF.KEYTYPE_3DES) {
        logger.info("Default key with 3DES works - formatting complete");
        updateDialogMessage("Standard-Schlüssel mit 3DES funktioniert - Formatierung abgeschlossen");
        return true;
    }

    // Case 2: Default key with AES works - change key settings to 3DES
    if (defaultAuthSuccess && defaultAuthKeyType === DESF.KEYTYPE_AES) {
        logger.info("Default key with AES works - changing key settings to 3DES");
        updateDialogMessage("Standard-Schlüssel mit AES funktioniert - ändere Schlüsseleinstellungen auf 3DES...");
        return await changeKeySettingsTo3DES();
    }

    // Case 3: ERP key worked - execute complex sequence
    if (erpAuthSuccess) {
        logger.info("ERP key with AES works - executing complex sequence");
        updateDialogMessage("ERP-Schlüssel mit AES funktioniert - führe komplexe Sequenz aus...");
        return await executeComplexErpSequence(erpMasterKey);
    }

    // Case 4: No authentication worked
    logger.warn("No authentication method worked - cannot format tag");
    updateDialogMessage("Keine Authentifizierungsmethode funktioniert - Tag kann nicht formatiert werden");
    return false;
}

/**
 * Change key settings to 3DES (for default key authentication)
 */
async function changeKeySettingsTo3DES() {
    logger.debug("Changing key settings to 3DES");

    // Get current key settings
    const currentKeySettings = await protocolHandler.DESFire_GetKeySettings(CRYPTO_ENV);
    if (!currentKeySettings.success) {
        logger.warn("Could not read current key settings");
        updateDialogMessage("Aktuelle Schlüsseleinstellungen konnten nicht gelesen werden");
        return false;
    }

    logger.info("Current key settings:", currentKeySettings);
    updateDialogMessage(`Aktuelle Schlüsseleinstellungen: ${currentKeySettings.keyType === DESF.KEYTYPE_3DES ? "3DES" : "AES"}`);

    // Change key settings using existing settings but change key type to 3DES
    updateDialogMessage("Ändere Schlüsseleinstellungen auf 3DES...");
    const changeKeySettingsResult = await protocolHandler.DESFire_ChangeKeySettings(
        CRYPTO_ENV,
        currentKeySettings.keySettings.changeKeyAccessRights, // Use existing access rights
        currentKeySettings.keySettings.configurationChangeable, // Use existing config changeable
        currentKeySettings.keySettings.freeCreateDelete, // Use existing free create/delete
        currentKeySettings.keySettings.freeDirectoryList, // Use existing free directory list
        currentKeySettings.keySettings.allowChangeMasterKey, // Use existing allow change master key
        currentKeySettings.numberOfKeys, // Use existing number of keys
        DESF.KEYTYPE_3DES // Only change the key type to 3DES
    );

    if (changeKeySettingsResult) {
        logger.info("Key settings successfully changed to 3DES");
        updateDialogMessage("Schlüsseleinstellungen erfolgreich auf 3DES geändert");

        // Now change the master key to default (like in the old working version)
        logger.debug("Changing master key to default after enabling 3DES");
        updateDialogMessage("Ändere Master-Schlüssel auf Standard nach 3DES-Aktivierung...");

        const changeMasterKeyResult = await protocolHandler.DESFire_ChangeKey(
            CRYPTO_ENV,
            0x00, // key number
            "00000000000000000000000000000000", // old key (default)
            "00000000000000000000000000000000", // new key (default) - same key
            0x00, // key version
            currentKeySettings.keySettings.changeKeyAccessRights, // Use existing access rights
            currentKeySettings.keySettings.configurationChangeable, // Use existing config changeable
            currentKeySettings.keySettings.freeCreateDelete, // Use existing free create/delete
            currentKeySettings.keySettings.freeDirectoryList, // Use existing free directory list
            currentKeySettings.keySettings.allowChangeMasterKey, // Use existing allow change master key
            currentKeySettings.numberOfKeys, // Use existing number of keys
            DESF.KEYTYPE_3DES // Use 3DES key type
        );

        if (changeMasterKeyResult) {
            logger.info("Master key successfully changed to default with 3DES");
            updateDialogMessage("Master-Schlüssel erfolgreich auf Standard mit 3DES geändert");
            return true;
        } else {
            logger.warn("Failed to change master key to default with 3DES");
            updateDialogMessage("Master-Schlüssel konnte nicht auf Standard mit 3DES geändert werden");
            return false;
        }
    } else {
        logger.warn("Failed to change key settings to 3DES");
        updateDialogMessage("Schlüsseleinstellungen konnten nicht auf 3DES geändert werden");
        return false;
    }
}

/**
 * Execute complex ERP sequence: format tag, change master key, change key settings
 */
async function executeComplexErpSequence(erpMasterKey) {
    logger.debug("Executing complex ERP sequence");

    // Step 1: Re-authenticate with ERP key AES before formatting
    logger.debug("Re-authenticating with ERP key AES before formatting");
    updateDialogMessage("Authentifiziere erneut mit ERP-Schlüssel vor Formatierung...");

    try {
        const reAuthResult = await protocolHandler.DESFire_Authenticate(
            CRYPTO_ENV,
            0x00,
            erpMasterKey,
            DESF.KEYTYPE_AES,
            DESF.AUTHMODE_EV1
        );
        if (!reAuthResult) {
            logger.warn("Failed to re-authenticate with ERP key before formatting");
            updateDialogMessage("Authentifizierung mit ERP-Schlüssel vor Formatierung fehlgeschlagen");
            return false;
        }
        logger.info("Successfully re-authenticated with ERP key before formatting");
        updateDialogMessage("Authentifizierung mit ERP-Schlüssel vor Formatierung erfolgreich");
    } catch (error) {
        logger.warn(`Re-authentication with ERP key failed: ${error.message}`);
        updateDialogMessage("Authentifizierung mit ERP-Schlüssel vor Formatierung fehlgeschlagen");
        return false;
    }

    // Step 2: Format the tag
    if (!(await formatDesfireTag())) {
        return false;
    }

    // Step 3: Authenticate again with ERP key AES
    if (!(await authenticateWithErpKeyAfterFormat(erpMasterKey))) {
        return false;
    }

    // Step 4: Change key settings to 3DES first
    if (!(await changeKeySettingsTo3DESInComplexSequence())) {
        return false;
    }

    // Step 5: Now that we're in 3DES mode, change master key to default
    logger.debug("Changing master key to default after enabling 3DES");
    updateDialogMessage("Ändere Master-Schlüssel auf Standard nach 3DES-Aktivierung...");

    const changeMasterKeyResult = await protocolHandler.DESFire_ChangeKey(
        CRYPTO_ENV,
        0x00, // key number
        erpMasterKey, // old key (ERP key)
        "00000000000000000000000000000000", // new key (default)
        0x00, // key version
        0x0f, // changeKeyAccessRights: allow all key changes
        1, // configurationChangeable: allow configuration changes
        1, // freeCreateDelete: allow free create/delete
        1, // freeDirectoryList: allow free directory listing
        1, // allowChangeMasterKey: allow master key changes
        1, // numberOfKeys
        DESF.KEYTYPE_3DES // Use 3DES key type
    );

    if (!changeMasterKeyResult) {
        logger.warn("Failed to change master key to default with 3DES");
        updateDialogMessage("Master-Schlüssel konnte nicht auf Standard mit 3DES geändert werden");
        return false;
    }

    logger.info("Successfully changed master key to default with 3DES");
    updateDialogMessage("Master-Schlüssel erfolgreich auf Standard mit 3DES geändert");

    // Step 6: Final authentication with default key 3DES
    return await finalAuthenticationWithDefaultKey3DES();
}

/**
 * Format the DESFire tag
 */
async function formatDesfireTag() {
    logger.debug("Formatting DESFire tag");
    updateDialogMessage("DESFire-Tag wird formatiert...");

    const formatResult = await protocolHandler.DESFire_FormatTag(CRYPTO_ENV);
    if (!formatResult) {
        logger.warn("Failed to format DESFire tag");
        updateDialogMessage("DESFire-Tag konnte nicht formatiert werden");
        return false;
    }

    logger.info("DESFire tag successfully formatted");
    updateDialogMessage("DESFire-Tag erfolgreich formatiert");
    return true;
}

/**
 * Authenticate with ERP key AES after formatting
 */
async function authenticateWithErpKeyAfterFormat(erpMasterKey) {
    logger.debug("Authenticating with ERP key AES after formatting");
    updateDialogMessage("Authentifiziere erneut mit ERP-Schlüssel AES...");

    try {
        const erpAuthResult = await protocolHandler.DESFire_Authenticate(
            CRYPTO_ENV,
            0x00,
            erpMasterKey,
            DESF.KEYTYPE_AES,
            DESF.AUTHMODE_EV1
        );
        if (erpAuthResult) {
            logger.info("Successfully authenticated with ERP key AES after formatting");
            updateDialogMessage("Authentifizierung mit ERP-Schlüssel AES nach Formatierung erfolgreich");
            return true;
        }
    } catch (error) {
        logger.debug(`ERP key AES authentication after formatting failed: ${error.message}`);
    }

    logger.warn("Cannot authenticate with ERP key AES after formatting");
    updateDialogMessage("Authentifizierung mit ERP-Schlüssel AES nach Formatierung fehlgeschlagen");
    return false;
}

/**
 * Authenticate with default key AES
 */
async function authenticateWithDefaultKeyAES() {
    logger.debug("Authenticating with default key AES");
    updateDialogMessage("Authentifiziere erneut mit Standard-Schlüssel AES...");

    try {
        const defaultAuthResult = await protocolHandler.DESFire_Authenticate(
            CRYPTO_ENV,
            0x00,
            "00000000000000000000000000000000",
            DESF.KEYTYPE_AES,
            DESF.AUTHMODE_EV1
        );
        if (defaultAuthResult) {
            logger.info("Successfully authenticated with default key AES after master key change");
            updateDialogMessage("Authentifizierung mit Standard-Schlüssel AES nach Master-Schlüssel-Änderung erfolgreich");
            return true;
        }
    } catch (error) {
        logger.debug(`Default key AES authentication after master key change failed: ${error.message}`);
    }

    logger.warn("Cannot authenticate with default key AES after master key change");
    updateDialogMessage("Authentifizierung mit Standard-Schlüssel AES nach Master-Schlüssel-Änderung fehlgeschlagen");
    return false;
}

/**
 * Change key settings to 3DES (for complex sequence)
 */
async function changeKeySettingsTo3DESInComplexSequence() {
    logger.debug("Changing key settings to 3DES in complex sequence");
    updateDialogMessage("Ändere Schlüsseleinstellungen auf 3DES...");

    // Read current key settings first (like in creation process)
    logger.debug("Reading current key settings before changing");
    updateDialogMessage("Lese aktuelle Schlüsseleinstellungen...");

    const currentKeySettings = await protocolHandler.DESFire_GetKeySettings(CRYPTO_ENV);
    if (!currentKeySettings.success) {
        logger.warn("Could not read current key settings");
        updateDialogMessage("Aktuelle Schlüsseleinstellungen konnten nicht gelesen werden");
        return false;
    }

    logger.info("Current key settings:", currentKeySettings);
    updateDialogMessage(`Aktuelle Schlüsseleinstellungen gelesen: ${currentKeySettings.keyType === DESF.KEYTYPE_3DES ? "3DES" : "AES"}`);

    // Change key settings using existing settings but change key type to 3DES
    const changeKeySettingsResult = await protocolHandler.DESFire_ChangeKeySettings(
        CRYPTO_ENV,
        currentKeySettings.keySettings.changeKeyAccessRights, // Use existing access rights
        currentKeySettings.keySettings.configurationChangeable, // Use existing config changeable
        currentKeySettings.keySettings.freeCreateDelete, // Use existing free create/delete
        currentKeySettings.keySettings.freeDirectoryList, // Use existing free directory list
        currentKeySettings.keySettings.allowChangeMasterKey, // Use existing allow change master key
        currentKeySettings.numberOfKeys, // Use existing number of keys
        DESF.KEYTYPE_3DES // Only change the key type to 3DES
    );

    if (!changeKeySettingsResult) {
        logger.warn("Failed to change key settings to 3DES");
        updateDialogMessage("Schlüsseleinstellungen konnten nicht auf 3DES geändert werden");
        return false;
    }

    logger.info("Key settings successfully changed to 3DES");
    updateDialogMessage("Schlüsseleinstellungen erfolgreich auf 3DES geändert");
    return true;
}

/**
 * Final authentication with default key 3DES
 */
async function finalAuthenticationWithDefaultKey3DES() {
    logger.debug("Final authentication with default key 3DES");
    updateDialogMessage("Versuche Anmeldung mit Standard-Schlüssel 3DES...");

    try {
        const finalAuthResult = await protocolHandler.DESFire_Authenticate(
            CRYPTO_ENV,
            0x00,
            "00000000000000000000000000000000",
            DESF.KEYTYPE_3DES,
            DESF.AUTHMODE_EV1
        );
        if (finalAuthResult) {
            logger.info("Successfully authenticated with default key 3DES - formatting successful");
            updateDialogMessage("Authentifizierung mit Standard-Schlüssel 3DES erfolgreich - Formatierung erfolgreich");
            return true;
        }
    } catch (error) {
        logger.debug(`Final authentication with default key 3DES failed: ${error.message}`);
    }

    logger.warn("Final authentication with default key 3DES failed");
    updateDialogMessage("Finale Authentifizierung mit Standard-Schlüssel 3DES fehlgeschlagen");
    return false;
}

// ============================================================================
// Modal Functions
// ============================================================================

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
