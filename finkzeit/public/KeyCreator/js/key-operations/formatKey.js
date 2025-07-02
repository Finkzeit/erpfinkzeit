import logger from "../core/logger.js";
import { verifyKey } from "./formatKeyVerify.js";
import * as protocolHandler from "../handler/protocolHandler.js";
import * as api from "../handler/api.js";
import { DESF } from "../constants/constants.js";
import { setIsFormatting } from "../core/state.js";
import { clearKeys } from "./verifyKey.js";
import { updateSessionInfo } from "../ui/ui.js";

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
    shouldContinueSearch = true;
    logger.debug("Setting isFormatting to true");
    setIsFormatting(true);

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

        const shouldFormat = await getConfirmation(dialog, true);
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

function showDialog(message) {
    logger.debug("Showing dialog:", message);
    const overlay = document.createElement("div");
    overlay.className = "overlay";

    const dialogElement = document.createElement("div");
    dialogElement.className = "dialog";
    dialogElement.innerHTML = `
        <p id="dialogText">${message}</p>
        <p id="countdownText" style="display: none; color: #666; font-size: 0.9em; margin-top: 10px;"></p>
        <div id="dialogButtons">
            <button class="btn" id="cancelBtn">Abbrechen</button>
        </div>
    `;

    overlay.appendChild(dialogElement);
    document.body.appendChild(overlay);

    document.getElementById("cancelBtn").addEventListener("click", () => {
        shouldContinueSearch = false;
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    });

    return { overlay, dialogElement };
}

function updateDialogText(dialog, message) {
    logger.debug("Updating dialog text:", message);
    const textElement = dialog.dialogElement.querySelector("#dialogText");
    textElement.textContent = message;
}

function updateCountdownText(dialog, message) {
    logger.debug("Updating countdown text:", message);
    const countdownElement = dialog.dialogElement.querySelector("#countdownText");
    if (countdownElement) {
        countdownElement.textContent = message;
        countdownElement.style.display = "block";
    }
}

function getConfirmation(dialog, showFormatButton) {
    return new Promise((resolve) => {
        const buttonsContainer = dialog.dialogElement.querySelector("#dialogButtons");
        if (showFormatButton) {
            const formatButton = document.createElement("button");
            formatButton.className = "btn";
            formatButton.id = "formatBtn";
            formatButton.textContent = "Formatieren";
            formatButton.addEventListener("click", () => {
                buttonsContainer.innerHTML = "";
                resolve(true);
            });
            buttonsContainer.insertBefore(formatButton, buttonsContainer.firstChild);
        }

        const cancelButton = document.getElementById("cancelBtn");
        cancelButton.addEventListener("click", () => {
            buttonsContainer.innerHTML = "";
            resolve(false);
        });
    });
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
        await new Promise(resolve => setTimeout(resolve, 2000));
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
        failed: []
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
                        const configName = transponderData.transponder_configuration || 'N/A';
                        const creationDate = transponderData.creation ? new Date(transponderData.creation).toLocaleDateString() : 'N/A';
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
    
    // Step 2: Format all tags
    for (const tag of tags) {
        try {
            logger.debug(`Processing tag: ${tag.type} (${tag.uid})`);
            
            const transponderData = transponderDataMap.get(tag.uid);
            
            // Step 2: Format the tag
            logger.debug(`Formatting tag ${tag.type}...`);
            updateDialogMessage(`Formatiere ${tag.type} (${tag.uid})...`);
            
            // Check if we have ERP configuration for this tag
            if (!transponderData) {
                updateDialogMessage(`${tag.type} (${tag.uid}) - Keine ERP-Konfiguration gefunden, Formatierung nicht möglich`);
                logger.warn(`No ERP configuration found for ${tag.type} (${tag.uid}), cannot format safely`);
                results.skipped.push(`${tag.type} (${tag.uid}) - Keine ERP-Konfiguration`);
                continue; // Skip to next tag
            }
            
            const formatSuccess = await formatTag(tag, transponderData);
            
            if (formatSuccess) {
                updateDialogMessage(`${tag.type} (${tag.uid}) erfolgreich formatiert`);
                logger.debug(`Tag ${tag.type} formatted successfully`);
                results.formatted.push(`${tag.type} (${tag.uid})`);
            } else {
                updateDialogMessage(`${tag.type} (${tag.uid}) Formatierung fehlgeschlagen - Transponder bleibt im ERP`);
                logger.warn(`Tag ${tag.type} formatting failed - transponder will remain in ERP`);
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
        finalMessage += `✅ Erfolgreich formatiert: ${results.formatted.join(', ')}\n`;
    }
    
    if (results.skipped.length > 0) {
        finalMessage += `⏭️ Übersprungen: ${results.skipped.join(', ')}\n`;
    }
    
    if (results.failed.length > 0) {
        finalMessage += `❌ Fehlgeschlagen: ${results.failed.join(', ')}\n`;
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
        return deleteResult;
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
                
                updateDialogMessage(`ERP-Konfiguration geladen: Sektor ${targetSector}, ${erpKeys.A.length} Key A, ${erpKeys.B.length} Key B`);
            }
        }
    } catch (error) {
        logger.warn("Failed to get ERP configuration:", error);
        updateDialogMessage("ERP-Konfiguration nicht verfügbar, Formatierung nicht möglich");
        return false;
    }

    // If no ERP configuration or target sector, we can't format safely
    if (!erpConfig || targetSector === null || targetSector === undefined) {
        logger.warn("No ERP configuration or target sector found, cannot format safely");
        updateDialogMessage("Keine ERP-Konfiguration gefunden - Formatierung nicht möglich");
        return false;
    }

    // Use only ERP keys - no default keys
    const keys = {
        A: [...erpKeys.A],
        B: [...erpKeys.B]
    };

    logger.debug("Final key set:", keys);
    logger.debug("Target sector:", targetSector);

    updateDialogMessage(`Formatiere nur Sektor ${targetSector}...`);
    
    let sectorFormatted = false;
    
    // Try to authenticate with available keys for the target sector only
    for (const keyType of ["A", "B"]) {
        if (sectorFormatted) break;
        
        for (const key of keys[keyType]) {
            if (sectorFormatted) break;
            
            try {
                const loginResult = await protocolHandler.MifareClassic_Login(key, keyType === "A" ? "00" : "01", targetSector);
                if (loginResult) {
                    logger.debug(`Authenticated sector ${targetSector} with key ${key.toString(16)} (${keyType})`);
                    
                    // Format this sector
                    const formatResult = await formatSector(targetSector, key, keyType);
                    if (formatResult) {
                        sectorFormatted = true;
                        logger.info(`Sector ${targetSector} formatted successfully`);
                        break;
                    } else {
                        logger.warn(`Failed to format sector ${targetSector} despite successful authentication`);
                    }
                }
            } catch (error) {
                logger.debug(`Login failed for sector ${targetSector} with key ${key.toString(16)} (${keyType}): ${error.message}`);
            }
        }
    }

    // Report results
    if (sectorFormatted) {
        logger.info(`MIFARE Classic formatting completed successfully - sector ${targetSector} formatted`);
        updateDialogMessage(`MIFARE_CLASSIC-Tag erfolgreich formatiert - Sektor ${targetSector} zurückgesetzt`);
        return true;
    } else {
        logger.warn(`MIFARE Classic formatting failed - could not format sector ${targetSector}`);
        updateDialogMessage(`MIFARE_CLASSIC-Tag Formatierung fehlgeschlagen - Sektor ${targetSector} konnte nicht formatiert werden`);
        return false;
    }
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

    const masterKeys = [
        0x2,
        0x00000000000000000000000000000000,
        0x12344567890,
        0x0123456789abcdef0123456789abcdef,
        0xaabbccddeeff00112233445566778899,
    ];

    try {
        await api.mifare();

        let authenticated = false;
        const keyTypes = [DESF.KEYTYPE_3DES, DESF.KEYTYPE_AES];

        for (const key of masterKeys) {
            for (const keyType of keyTypes) {
                try {
                    const authResult = await protocolHandler.DESFire_Authenticate(CRYPTO_ENV, 0x00, key, keyType, DESF.AUTHMODE_EV1);
                    if (authResult) {
                        authenticated = true;
                        logger.info(`Successfully authenticated with key: ${key} and keyType: ${keyType}`);
                        updateDialogMessage(`Authentifizierung mit Schlüssel: ${key} und Schlüsseltyp: ${keyType}...`);
                        break;
                    }
                } catch (error) {
                    logger.debug(`Authentication failed with key ${key} and keyType ${keyType}: ${error.message}`);
                }
            }
            if (authenticated) break;
        }

        if (!authenticated) {
            throw new Error("Failed to authenticate with any master key and key type");
        }

        updateDialogMessage("DESFire-Tag wird formatiert...");
        const formatResult = await protocolHandler.DESFire_FormatTag(CRYPTO_ENV);
        if (!formatResult) {
            throw new Error("Fehler beim Formatieren des DESFire-Tags");
        }
        logger.info("DESFire tag formatted successfully");

        updateDialogMessage("Master-Schlüsseleinstellungen werden gelesen...");
        const readKeySettingsResult = await protocolHandler.DESFire_GetKeySettings(CRYPTO_ENV);
        logger.debug("Master Key Settings:", readKeySettingsResult);
        updateDialogMessage("Master-Schlüsseleinstellungen erfolgreich gelesen");

        updateDialogMessage("Master-Schlüsseleinstellungen werden geändert...");
        const changeSettingsResult = await protocolHandler.DESFire_ChangeKeySettings(
            CRYPTO_ENV,
            readKeySettingsResult.keySettings.changeKeyAccessRights,
            readKeySettingsResult.keySettings.configurationChangeable,
            readKeySettingsResult.keySettings.freeCreateDelete,
            readKeySettingsResult.keySettings.freeDirectoryList,
            readKeySettingsResult.keySettings.allowChangeMasterKey,
            readKeySettingsResult.numberOfKeys,
            DESF.KEYTYPE_3DES
        );
        if (!changeSettingsResult) {
            throw new Error("Fehler beim Ändern der Master-Schlüsseleinstellungen");
        }
        logger.info("Master key settings changed successfully");

        updateDialogMessage("Standard-Master-Schlüssel wird gesetzt...");
        const oldKey = masterKeys[0];
        const defaultKey = 0x00000000000000000000000000000000;
        const keyNo = 0x00;
        const keyVersion = 0x00;
        const keyType = DESF.KEYTYPE_3DES;

        console.log("CRYPTO_ENV", CRYPTO_ENV, "keyNumber");

        const changeKeyResult = await protocolHandler.DESFire_ChangeKey(
            CRYPTO_ENV,
            keyNo,
            oldKey,
            defaultKey,
            keyVersion,
            readKeySettingsResult.keySettings.changeKeyAccessRights,
            readKeySettingsResult.keySettings.configurationChangeable,
            readKeySettingsResult.keySettings.freeCreateDelete,
            readKeySettingsResult.keySettings.freeDirectoryList,
            readKeySettingsResult.keySettings.allowChangeMasterKey,
            readKeySettingsResult.numberOfKeys,
            keyType
        );
        if (!changeKeyResult) {
            throw new Error("Fehler beim Setzen des Standard-Master-Schlüssels");
        }
        logger.info("Standard-Master-Schlüssel erfolgreich gesetzt");

        updateDialogMessage("MIFARE DESFire-Tag erfolgreich formatiert");
        return true;
    } catch (error) {
        logger.error("Error in mifareDesfireScript:", error);
        updateDialogMessage(`Fehler beim Formatieren von MIFARE_DESFIRE (${config.tags.mifareDesfire.uid}): ${error.message}`);
        return false;
    }
}

export function updateDialogMessage(message) {
    logger.debug("Updating dialog message:", message);
    const dialogText = document.getElementById("dialogText");
    if (dialogText) {
        dialogText.textContent = message;
    } else {
        console.log("Dialog message:", message);
    }
}
