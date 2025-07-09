import logger from "../core/logger.js";
import * as api from "../handler/api.js";
import * as protocolHandler from "../handler/protocolHandler.js";
import { getSAK } from "../handler/protocolHandler.js";
import { DESF } from "../constants/constants.js";
import { setIsReading } from "../core/state.js";
import { identifyMifareTypeBitwise } from "../utils/mifareUtils.js";
import { showDialog, updateDialogText, updateDialogMessage, getConfirmation } from "../utils/dialogUtils.js";

let shouldContinueSearch = true;

export function initializeKeyReading() {
    logger.debug("Initializing key reading");
    const readKeyButton = document.getElementById("readKeyButton");

    if (!readKeyButton) {
        logger.error("Read key button not found");
        return;
    }

    readKeyButton.addEventListener("click", () => {
        logger.debug("Read Key button clicked");
        handleReadKey();
    });

    logger.debug("Key reading initialized");
}

async function handleReadKey() {
    logger.debug("Handle read key called");

    const dialog = showDialog("Schlüssel wird gesucht. Bitte legen Sie einen Schlüssel auf den Leser.");

    // Add custom cancel handler for reading operations
    document.getElementById("cancelBtn").addEventListener("click", () => {
        shouldContinueSearch = false;
        logger.debug("Read operation cancelled by user");
        setIsReading(false);
        if (dialog.overlay.parentNode) {
            dialog.overlay.parentNode.removeChild(dialog.overlay);
        }
    });

    shouldContinueSearch = true;
    logger.debug("Setting isReading to true");
    setIsReading(true);

    // Give the main session time to pause before we start using the serial port
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
        updateDialogMessage("Tag wird gesucht...");
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

        // Read detailed information for each tag
        const tagDetails = [];
        for (const tag of detectedTags) {
            updateDialogMessage(`Lese Details für ${tag.type} (${tag.uid})...`);
            const details = await readTagDetails(tag, dialog);
            tagDetails.push(details);
        }

        // Check if any tags are not in ERP and offer config-based reading
        const tagsNotInERP = tagDetails.filter((tag) => !tag.erpInfo);
        if (tagsNotInERP.length > 0) {
            updateDialogMessage("Einige Tags sind nicht im ERP registriert. Möchten Sie sie mit einer Konfiguration lesen?");
            const shouldReadWithConfig = await getConfirmation(dialog, true, "Mit Konfiguration lesen");

            if (shouldReadWithConfig) {
                await readWithConfig(tagsNotInERP, dialog);
                return; // Don't show the detailed modal if we did config-based reading
            }
        }

        // Always show the detailed modal, even for empty tags
        showDetailedModal(tagDetails, dialog);
    } catch (error) {
        logger.error("Error in handleReadKey:", error);
        updateDialogText(dialog, "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.");
    } finally {
        // Ensure reading state is reset in all cases
        logger.debug("Setting isReading to false");
        setIsReading(false);
    }
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

// Utility: create a select modal (used by both config selection functions)
function createSelectModal({ parent, configs, title, message, onClose }) {
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

    modalBox.innerHTML = `
        <h3 style="margin-top: 0; margin-bottom: 1em; text-align: center;">${title}</h3>
        ${message}
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
        if (parent) parent.removeChild(modal);
        else document.body.removeChild(modal);
        onClose(null);
    };
    btnContainer.appendChild(cancelBtn);

    const okBtn = document.createElement("button");
    okBtn.textContent = "Übernehmen";
    okBtn.onclick = () => {
        const selected = select.value;
        $(select).select2("destroy");
        if (parent) parent.removeChild(modal);
        else document.body.removeChild(modal);
        onClose(selected);
    };
    btnContainer.appendChild(okBtn);

    modalBox.appendChild(btnContainer);
    modal.appendChild(modalBox);
    (parent || document.body).appendChild(modal);

    $(select).select2({
        dropdownParent: $(modalBox),
        width: "100%",
    });
    select.focus();
}

// Refactored config selection modal
async function showConfigSelectionModal(configs, tagType, isFallback = false) {
    return new Promise((resolve) => {
        const title = isFallback ? "Keine passende ERP-Konfiguration gefunden" : "Keine ERP-Konfiguration gefunden";
        const warning = isFallback
            ? `<p style="color: #dc3545; font-weight: bold;">Achtung: Es wurde keine passende Konfiguration für <b>${tagType}</b> gefunden. Bitte wählen Sie eine beliebige Konfiguration aus der Liste.</p>`
            : `<p>Bitte wählen Sie eine Konfiguration für <b>${tagType}</b> aus:</p>`;
        createSelectModal({
            configs,
            title,
            message: warning,
            onClose: resolve,
        });
    });
}

// Refactored config selection in dialog
async function showConfigSelectionInDialog(dialog, configs, tagType) {
    return new Promise((resolve) => {
        const dialogContent = dialog.dialogElement;
        const title = "Keine passende Konfiguration gefunden";
        const message = `<p>Bitte wählen Sie eine Konfiguration aus:</p>`;
        // Use a wrapper div to attach modal to dialog content
        const wrapper = document.createElement("div");
        dialogContent.appendChild(wrapper);
        createSelectModal({
            parent: wrapper,
            configs,
            title,
            message,
            onClose: (selected) => {
                dialogContent.removeChild(wrapper);
                resolve(selected);
            },
        });
    });
}

// Utility: MIFARE Classic authentication (DRY)
async function authenticateMifareClassic({ keyA, keyB, sector, MifareClassic_Login }) {
    logger.debug(`MIFARE Classic authentication - KeyA: ${keyA}, KeyB: ${keyB}, Sector: ${sector}`);
    let authenticated = false;
    let usedDefaultKey = false;

    if (keyA && !authenticated) {
        try {
            logger.debug(`Trying Key A: ${keyA}`);
            const loginResult = await MifareClassic_Login(parseInt(keyA, 16), "00", sector);
            if (loginResult) {
                authenticated = true;
                logger.debug(`Successfully authenticated with Key A: ${keyA}`);
            } else {
                logger.debug(`Key A authentication failed: ${keyA}`);
            }
        } catch (error) {
            logger.debug(`Key A authentication error: ${error.message}`);
        }
    }

    if (keyB && !authenticated) {
        try {
            logger.debug(`Trying Key B: ${keyB}`);
            const loginResult = await MifareClassic_Login(parseInt(keyB, 16), "01", sector);
            if (loginResult) {
                authenticated = true;
                logger.debug(`Successfully authenticated with Key B: ${keyB}`);
            } else {
                logger.debug(`Key B authentication failed: ${keyB}`);
            }
        } catch (error) {
            logger.debug(`Key B authentication error: ${error.message}`);
        }
    }

    if (!authenticated) {
        try {
            const defaultKey = 281474976710655; // FFFFFFFFFFFF
            logger.debug(`Trying default key: ${defaultKey}`);
            const loginResult = await MifareClassic_Login(defaultKey, "00", sector);
            if (loginResult) {
                authenticated = true;
                usedDefaultKey = true;
                logger.debug(`Successfully authenticated with default key`);
            } else {
                logger.debug(`Default key authentication failed`);
            }
        } catch (error) {
            logger.debug(`Default key authentication error: ${error.message}`);
        }
    }

    logger.debug(`Authentication result: authenticated=${authenticated}, usedDefaultKey=${usedDefaultKey}`);
    return { authenticated, usedDefaultKey };
}

async function getDetectedTags(dialog) {
    logger.debug("Getting detected tags");

    try {
        // Use a simple tag detection without validation for reading
        const detectedTags = await detectTagsForReading(() => shouldContinueSearch);
        logger.debug("detectTagsForReading completed", detectedTags);

        if (!shouldContinueSearch || !detectedTags || detectedTags.length === 0) {
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

async function detectTagsForReading(shouldContinueCallback) {
    logger.debug("[detectTagsForReading] Starting tag detection for reading...");

    const searchFunctions = [api.hitag1s, api.mifare, api.deister, api.em];
    const detectedTags = [];
    const detectedUIDs = new Set();

    let attempts = 0;
    const maxAttempts = 50; // 5 seconds with 100ms intervals

    while (attempts < maxAttempts && shouldContinueCallback()) {
        attempts++;

        for (const searchFunction of searchFunctions) {
            if (!shouldContinueCallback()) break;

            try {
                const result = await searchFunction();
                if (result.Result && !detectedUIDs.has(result.UID)) {
                    let tagType = result.TagType || "Unknown";
                    if (tagType === "MIFARE") {
                        const sakValue = await getSAK(result.UID);
                        tagType = identifyMifareTypeBitwise(sakValue, "detectTagsForReading");
                    }

                    detectedTags.push({
                        type: tagType,
                        uid: result.UID,
                        data: result,
                    });
                    detectedUIDs.add(result.UID);

                    logger.debug(`[detectTagsForReading] Detected tag: ${tagType} (${result.UID})`);
                }
            } catch (error) {
                logger.debug(`[detectTagsForReading] Search function error: ${error.message}`);
            }
        }

        if (detectedTags.length > 0) {
            break; // Found at least one tag
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return detectedTags;
}

async function readTagDetails(tag, dialog) {
    logger.debug(`Reading details for ${tag.type} (${tag.uid})`);
    const details = {
        type: tag.type,
        uid: tag.uid,
        basicInfo: tag.data,
        erpInfo: null,
        technicalInfo: {},
        configuration: null,
    };
    // Get ERP information if available
    try {
        const erpRestApi = window.erpRestApi;
        if (erpRestApi) {
            updateDialogMessage(`Suche ERP-Informationen für ${tag.uid}...`);
            const transponderData = await erpRestApi.getTransponderByUid(tag.uid, tag.type);
            if (transponderData) {
                details.erpInfo = transponderData;
                // Get configuration if available
                if (transponderData.transponder_configuration) {
                    updateDialogMessage(`Lade Konfiguration für ${tag.uid}...`);
                    const config = await erpRestApi.getTransponderConfiguration(transponderData.transponder_configuration);
                    details.configuration = config;
                }
            }
        }
    } catch (error) {
        logger.warn(`Error getting ERP info for ${tag.uid}:`, error);
    }
    // Get technical information based on tag type, using merged config
    try {
        updateDialogMessage(`Lese technische Details für ${tag.type}...`);
        const mergedConfig = await getMergedTagConfig(tag, details.erpInfo);
        details.technicalInfo = await getTechnicalInfo(tag, details.erpInfo, mergedConfig);
    } catch (error) {
        logger.warn(`Error getting technical info for ${tag.type}:`, error);
    }
    return details;
}

async function readWithConfig(tagsNotInERP, dialog) {
    logger.debug("Starting read with config for tags:", tagsNotInERP);
    updateDialogMessage("Bitte wählen Sie eine Konfiguration zum Lesen der Tags aus:");

    try {
        const erpRestApi = window.erpRestApi;
        if (!erpRestApi) {
            updateDialogMessage("ERP API nicht verfügbar");
            return;
        }

        // Get all available configurations
        const allConfigs = await erpRestApi.fetchAllTransponderConfigs();
        logger.debug("Available configs for reading:", allConfigs);

        // Show config selection - no filtering, user selects manually
        const selectedConfigId = await showConfigSelectionInDialog(dialog, allConfigs, "alle Tags");

        if (!selectedConfigId) {
            updateDialogMessage("Keine Konfiguration ausgewählt");
            return;
        }

        // Get the selected configuration
        const selectedConfig = await erpRestApi.getTransponderConfiguration(selectedConfigId);
        if (!selectedConfig) {
            updateDialogMessage("Ausgewählte Konfiguration konnte nicht geladen werden");
            return;
        }

        // Store the selected config ID for later use
        selectedConfig.selectedConfigId = selectedConfigId;

        // Try to read all tags with the selected configuration
        updateDialogMessage("Lese alle Tags mit ausgewählter Konfiguration...");
        const readResults = [];

        // Read all tags first to see if the entire key works
        for (const tag of tagsNotInERP) {
            try {
                updateDialogMessage(`Lese ${tag.type} (${tag.uid}) mit Konfiguration...`);
                const readResult = await readTagWithConfig(tag, selectedConfig);
                readResults.push({
                    tag: tag,
                    config: selectedConfig,
                    readResult: readResult,
                    success: readResult !== null,
                });
            } catch (error) {
                logger.error(`Error reading ${tag.type} (${tag.uid}) with config:`, error);
                readResults.push({
                    tag: tag,
                    config: selectedConfig,
                    readResult: null,
                    success: false,
                    error: error.message,
                });
            }
        }

        // Check if ALL tags were read successfully
        const allSuccessful = readResults.every((result) => result.success);

        if (allSuccessful) {
            // Check if we have decoded IDs and if they match
            const successfulReads = readResults.filter((r) => r.success);
            const decodedIds = successfulReads
                .map((result) => result.readResult?.decodedId)
                .filter((id) => id !== null && id !== undefined);

            logger.debug(`Successful reads: ${successfulReads.length}`);
            logger.debug(`Decoded IDs found: ${decodedIds.length}`);
            logger.debug(`Decoded IDs: ${JSON.stringify(decodedIds)}`);

            let suggestedCode = null;
            let canAddToERP = true;

            if (decodedIds.length > 0) {
                // Check if all decoded IDs are the same
                const firstId = decodedIds[0];
                const allSame = decodedIds.every((id) => id === firstId);

                logger.debug(`First ID: ${firstId}`);
                logger.debug(`All IDs same: ${allSame}`);

                if (allSame) {
                    suggestedCode = firstId;
                    logger.debug(`All tags have the same decoded ID: ${suggestedCode}`);
                } else {
                    logger.debug(`Tags have different decoded IDs: ${decodedIds.join(", ")}`);
                    // Don't allow adding to ERP if IDs don't match
                    canAddToERP = false;
                }
            }

            // Only offer to add to ERP if all tags have the same ID
            showReadWithConfigResults(readResults, dialog, canAddToERP, suggestedCode);
        } else {
            // Some tags failed - show results but don't offer to add to ERP
            showReadWithConfigResults(readResults, dialog, false);
        }
    } catch (error) {
        logger.error("Error in readWithConfig:", error);
        updateDialogMessage(`Fehler beim Lesen mit Konfiguration: ${error.message}`);
    }
}

async function readTagWithConfig(tag, config) {
    logger.debug(`Reading ${tag.type} (${tag.uid}) with config:`, config);

    try {
        switch (tag.type.toUpperCase()) {
            case "HITAG1S":
                return await readHitagWithConfig(tag, config);
            case "MIFARE_CLASSIC":
                return await readMifareClassicWithConfig(tag, config);
            case "MIFARE_DESFIRE":
                return await readMifareDesfireWithConfig(tag, config);
            default:
                logger.warn(`No config reading implemented for ${tag.type}`);
                return null;
        }
    } catch (error) {
        logger.error(`Error reading ${tag.type} with config:`, error);
        return null;
    }
}

async function readHitagWithConfig(tag, config) {
    if (!config.tags?.hitag) return null;

    // Set tag type and search for tag first (like the working functions do)
    await api.hitag1s();

    const { readHitag } = await import("../tags/hitag1s.js");
    const decodedResult = await readHitag({ tags: { hitag: { uid: tag.uid } } });

    if (decodedResult === null) return null;

    return {
        block: config.tags.hitag.number || 0x1c,
        data: "Decoded successfully",
        decodedId: decodedResult,
        config: config.tags.hitag,
    };
}

async function readMifareClassicWithConfig(tag, config) {
    if (!config.tags?.mifareClassic) return null;
    await api.mifare();
    const { readMifareClassic } = await import("../tags/mifareClassic.js");
    const { MifareClassic_Login } = await import("../handler/protocolHandler.js");
    const sector = config.tags.mifareClassic.sector || 1;
    const { authenticated, usedDefaultKey } = await authenticateMifareClassic({
        keyA: config.tags.mifareClassic.key_a,
        keyB: config.tags.mifareClassic.key_b,
        sector,
        MifareClassic_Login,
    });
    if (!authenticated) {
        logger.debug("MIFARE Classic authentication failed");
        return null;
    }
    if (usedDefaultKey) {
        return {
            sector: config.tags.mifareClassic.sector,
            block: config.tags.mifareClassic.sector * 4 + 1,
            data: "Tag leer oder nicht konfiguriert",
            decodedId: "Tag leer oder nicht konfiguriert (Standard-Schlüssel)",
            config: config.tags.mifareClassic,
        };
    }
    const decodedResult = await readMifareClassic({ tags: { mifareClassic: { uid: tag.uid, ...config.tags.mifareClassic } } });
    if (decodedResult === null) return null;
    return {
        sector: config.tags.mifareClassic.sector,
        block: config.tags.mifareClassic.sector * 4 + 1,
        data: "Decoded successfully",
        decodedId: decodedResult.toString(),
        config: config.tags.mifareClassic,
    };
}

// Utility: DESFire authentication and file reading (DRY)
async function authenticateAndReadDesfire({
    DESFire_Authenticate,
    DESFire_SelectApplication,
    DESFire_ReadData,
    DESF,
    appId,
    fileId,
    masterKey,
    appReadKey,
}) {
    // 1. Authenticate with master key (AES only)
    let masterAuthResult = false;
    try {
        const authResult = await DESFire_Authenticate(DESF.CRYPTO_ENV0, 0x00, masterKey, DESF.KEYTYPE_AES, DESF.AUTHMODE_EV1);
        if (authResult) masterAuthResult = true;
    } catch {}
    if (!masterAuthResult) return { error: "Master-Schlüssel Authentifizierung fehlgeschlagen" };
    // 2. Select the application
    const selectResult = await DESFire_SelectApplication(DESF.CRYPTO_ENV0, appId);
    if (!selectResult) return { error: "Anwendung nicht gefunden" };
    // 3. Authenticate with app read key (AES only)
    let appAuthResult = false;
    try {
        const authResult = await DESFire_Authenticate(DESF.CRYPTO_ENV0, 0x01, appReadKey, DESF.KEYTYPE_AES, DESF.AUTHMODE_EV1);
        if (authResult) appAuthResult = true;
    } catch {}
    if (!appAuthResult) return { error: "Anwendungs-Schlüssel Authentifizierung fehlgeschlagen" };
    // 4. Read from the configured file
    const readResult = await DESFire_ReadData(DESF.CRYPTO_ENV0, fileId, 0x00, 0x04, DESF.COMMSET_PLAIN);
    if (!readResult || !readResult.success) return { error: "Datei nicht lesbar" };
    return { data: readResult.data };
}

async function readMifareDesfireWithConfig(tag, config) {
    if (!config.tags?.mifareDesfire) return null;

    // Set tag type and search for tag first (like the working functions do)
    await api.mifare();

    const { DESFire_Authenticate, DESFire_SelectApplication, DESFire_ReadData } = await import("../handler/protocolHandler.js");
    const { DESF } = await import("../constants/constants.js");

    const dfConfig = config.tags.mifareDesfire;
    const appId = dfConfig.app_id;
    const fileId = dfConfig.file_byte; // Use file_byte like ERP config
    const masterKey = dfConfig.master_key;
    const appReadKey = dfConfig.app_read_key;

    logger.debug(`DESFire config for reading: appId=${appId}, fileId=${fileId}, masterKey=${masterKey}, appReadKey=${appReadKey}`);

    if (
        appId === undefined ||
        appId === null ||
        appId === "" ||
        fileId === undefined ||
        fileId === null ||
        fileId === "" ||
        !masterKey ||
        !appReadKey
    ) {
        logger.debug("Missing DESFire configuration parameters");
        return null;
    }

    const result = await authenticateAndReadDesfire({
        DESFire_Authenticate,
        DESFire_SelectApplication,
        DESFire_ReadData,
        DESF,
        appId,
        fileId,
        masterKey,
        appReadKey,
    });

    if (result.error) {
        logger.debug(`Error reading DESFire with config: ${result.error}`);
        return null;
    }

    return {
        appId: appId,
        fileId: fileId,
        data: "Decoded successfully",
        decodedId: result.data.toString(),
        config: dfConfig,
    };
}

// Utility: Create overlay modal with content and close logic
function createOverlayModal({ content, onClose, closeBtnId }) {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const modalElement = document.createElement("div");
    modalElement.className = "dialog detailed-modal";
    modalElement.style.maxWidth = "90vw";
    modalElement.style.maxHeight = "90vh";
    modalElement.style.overflow = "auto";
    modalElement.innerHTML = content;
    overlay.appendChild(modalElement);
    document.body.appendChild(overlay);
    // Add close functionality
    if (closeBtnId) {
        document.getElementById(closeBtnId).addEventListener("click", () => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (onClose) setTimeout(onClose, 500);
        });
    }
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (onClose) setTimeout(onClose, 500);
        }
    });
    return { overlay, modalElement };
}

// Refactor showReadWithConfigResults to use createOverlayModal
function showReadWithConfigResults(readResults, dialog, allSuccessful, suggestedCode = null) {
    if (dialog.overlay && dialog.overlay.parentNode) {
        dialog.overlay.parentNode.removeChild(dialog.overlay);
    }
    let modalContent = `
        <h2>Schlüssel-Übersicht</h2>
        <div class="tag-details">
    `;

    const successfulReads = readResults.filter((r) => r.success);
    const failedReads = readResults.filter((r) => !r.success);

    // Show overall result
    if (allSuccessful) {
        modalContent += `
                <div class="info-section" style="background: #d4edda; border: 1px solid #c3e6cb; padding: 1em; border-radius: 4px; margin-bottom: 1em;">
                    <h3 style="color: #155724; margin: 0;">✅ Alle Tags erfolgreich gelesen!</h3>
                    <p style="margin: 0.5em 0 0 0; color: #155724;">Der gesamte Schlüssel kann zum ERP hinzugefügt werden.</p>
            `;

        if (suggestedCode) {
            modalContent += `
                    <p style="margin: 0.5em 0 0 0; color: #155724;"><strong>Vorgeschlagener Code: ${suggestedCode}</strong></p>
                `;
        }

        modalContent += `</div>`;
    } else {
        modalContent += `
            <div class="info-section" style="background: #f8d7da; border: 1px solid #f5c6cb; padding: 1em; border-radius: 4px; margin-bottom: 1em;">
                <h3 style="color: #721c24; margin: 0;">❌ Nicht alle Tags konnten gelesen werden</h3>
                <p style="margin: 0.5em 0 0 0; color: #721c24;">Der Schlüssel kann nicht zum ERP hinzugefügt werden.</p>
            </div>
        `;
    }

    if (successfulReads.length > 0) {
        modalContent += `
            <div class="info-section">
                <h3>✅ Erfolgreich gelesen (${successfulReads.length})</h3>
        `;

        successfulReads.forEach((result, index) => {
            const tag = result.tag;
            const readData = result.readResult;

            modalContent += `
                <div class="tag-section">
                    <h4>${tag.type} (${tag.uid})</h4>
                    <div class="info-grid">
                        <div class="info-section">
                            <h5>Grundinformationen</h5>
                            <table class="info-table">
                                <tr><td>Typ:</td><td>${tag.type}</td></tr>
                                <tr><td>UID:</td><td>${tag.uid}</td></tr>
                                <tr><td>Konfiguration:</td><td>${result.config.customerName}</td></tr>
                            </table>
                        </div>
                        <div class="info-section">
                            <h5>Leseergebnisse</h5>
                            <table class="info-table">
            `;

            if (readData.block !== undefined) {
                modalContent += `<tr><td>Block/Sektor:</td><td>${readData.block}</td></tr>`;
            }
            if (readData.sector !== undefined) {
                modalContent += `<tr><td>Sektor:</td><td>${readData.sector}</td></tr>`;
            }
            if (readData.key !== undefined) {
                modalContent += `<tr><td>Schlüssel:</td><td>${readData.key} (${readData.keyType})</td></tr>`;
            }
            if (readData.appId !== undefined) {
                modalContent += `<tr><td>App ID:</td><td>${readData.appId}</td></tr>`;
            }
            if (readData.fileId !== undefined) {
                modalContent += `<tr><td>File ID:</td><td>${readData.fileId}</td></tr>`;
            }
            if (readData.decodedId !== undefined) {
                modalContent += `<tr><td>Dekodierte ID:</td><td><strong>${readData.decodedId}</strong></td></tr>`;
            }
            if (readData.data) {
                modalContent += `<tr><td>Gelesene Daten:</td><td><code>${readData.data}</code></td></tr>`;
            }

            modalContent += `
                            </table>
                        </div>
                    </div>
                </div>
            `;
        });

        modalContent += `</div>`;
    }

    if (failedReads.length > 0) {
        modalContent += `
            <div class="info-section">
                <h3>❌ Fehlgeschlagen (${failedReads.length})</h3>
        `;

        failedReads.forEach((result, index) => {
            const tag = result.tag;
            modalContent += `
                <div class="tag-section">
                    <h4>${tag.type} (${tag.uid})</h4>
                    <p>Konfiguration: ${result.config.customerName}</p>
                    <p>Fehler: ${result.error || "Unbekannter Fehler"}</p>
                </div>
            `;
        });

        modalContent += `</div>`;
    }

    modalContent += `
        </div>
        <div class="modal-buttons">
    `;

    // Only show "Add to ERP" button if all tags were successful
    if (allSuccessful) {
        modalContent += `
            <button class="btn" id="addKeyToERPBtn" style="background: #28a745; color: white; margin-right: 1em;">
                Neuen Transponder erstellen
            </button>
        `;
    }

    modalContent += `
            <button class="btn" id="closeResultsBtn">Schließen</button>
        </div>
    `;
    // Use utility for overlay/modal
    const { overlay, modalElement } = createOverlayModal({
        content: modalContent,
        onClose: () => setIsReading(false),
        closeBtnId: "closeResultsBtn",
    });

    // Add the addKeyToERP function to window
    if (allSuccessful) {
        window.addKeyToERP = async function () {
            try {
                const erpRestApi = window.erpRestApi;
                if (!erpRestApi) {
                    alert("ERP API nicht verfügbar");
                    return;
                }

                // Use suggested code if available, otherwise prompt user
                let transponderNumber;
                if (suggestedCode) {
                    transponderNumber = suggestedCode;
                    logger.debug(`Using suggested code: ${transponderNumber}`);
                } else {
                    transponderNumber = prompt("Bitte geben Sie eine Nummer/Code für den Transponder ein:");
                    if (!transponderNumber || transponderNumber.trim() === "") {
                        alert("Keine Nummer eingegeben - Vorgang abgebrochen");
                        return;
                    }
                }

                // Prepare UID object for all tags
                const uid = {};
                successfulReads.forEach((result) => {
                    const tag = result.tag;
                    switch (tag.type.toUpperCase()) {
                        case "HITAG1S":
                            uid.hitag_uid = tag.uid;
                            break;
                        case "MIFARE_CLASSIC":
                            uid.mfcl_uid = tag.uid;
                            break;
                        case "MIFARE_DESFIRE":
                            uid.mfdf_uid = tag.uid;
                            break;
                        case "DEISTER":
                            uid.deister_uid = tag.uid;
                            break;
                        case "EM":
                            uid.em_uid = tag.uid;
                            break;
                    }
                });

                // Get the configuration ID
                const configId =
                    successfulReads[0].config.selectedConfigId ||
                    successfulReads[0].config.name ||
                    successfulReads[0].config.transponderConfigId;

                logger.debug("Configuration object:", successfulReads[0].config);
                logger.debug("Creating transponder with configId:", configId);
                logger.debug("Creating transponder with number:", transponderNumber.trim());
                logger.debug("Creating transponder with UIDs:", uid);

                // Use createTransponder with correct parameters
                const result = await erpRestApi.createTransponder(configId, transponderNumber.trim(), uid);

                if (result && result.status) {
                    // Show success message in the modal instead of alert
                    const modalContent = document.querySelector(".detailed-modal");
                    if (modalContent) {
                        // Add success message at the top of the modal
                        const successDiv = document.createElement("div");
                        successDiv.style.cssText =
                            "background: #d4edda; border: 1px solid #c3e6cb; padding: 1em; border-radius: 4px; margin-bottom: 1em; color: #155724;";
                        successDiv.innerHTML = `
                            <h3 style="color: #155724; margin: 0;">✅ Transponder erfolgreich erstellt!</h3>
                            <p style="margin: 0.5em 0 0 0; color: #155724;">Transponder "${transponderNumber}" wurde erfolgreich zum ERP hinzugefügt.</p>
                        `;

                        // Insert at the beginning of the modal content
                        const firstChild = modalContent.firstChild;
                        modalContent.insertBefore(successDiv, firstChild);

                        // Remove the "Add to ERP" button since it's already been used
                        const addButton = document.getElementById("addKeyToERPBtn");
                        if (addButton) {
                            addButton.remove();
                        }
                    }
                } else {
                    // Show error message in the modal instead of alert
                    const modalContent = document.querySelector(".detailed-modal");
                    if (modalContent) {
                        // Add error message at the top of the modal
                        const errorDiv = document.createElement("div");
                        errorDiv.style.cssText =
                            "background: #f8d7da; border: 1px solid #f5c6cb; padding: 1em; border-radius: 4px; margin-bottom: 1em; color: #721c24;";
                        errorDiv.innerHTML = `
                            <h3 style="color: #721c24; margin: 0;">❌ Fehler beim Erstellen</h3>
                            <p style="margin: 0.5em 0 0 0; color: #721c24;">${result?.message || "Unbekannter Fehler"}</p>
                        `;

                        // Insert at the beginning of the modal content
                        const firstChild = modalContent.firstChild;
                        modalContent.insertBefore(errorDiv, firstChild);
                    }
                }
            } catch (error) {
                logger.error("Error adding key to ERP:", error);
                alert(`Fehler beim Hinzufügen: ${error.message}`);
            }
        };

        // Add event listener for the add key button
        document.getElementById("addKeyToERPBtn").addEventListener("click", () => {
            window.addKeyToERP();
        });
    }

    // Add close functionality
    document.getElementById("closeResultsBtn").addEventListener("click", () => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        // Set reading to false after closing
        setTimeout(() => {
            logger.debug("Setting isReading to false after results modal close");
            setIsReading(false);
        }, 500);
    });

    // Close on overlay click
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            // Set reading to false after closing
            setTimeout(() => {
                logger.debug("Setting isReading to false after results modal close");
                setIsReading(false);
            }, 500);
        }
    });
}

async function getTechnicalInfo(tag, transponderData, mergedConfig) {
    const techInfo = {};

    try {
        switch (tag.type.toUpperCase()) {
            case "HITAG1S":
                await api.hitag1s();
                const { readHitag } = await import("../tags/hitag1s.js");
                const decodedResult = await readHitag({ tags: { hitag: { uid: tag.uid } } });
                techInfo.decodedId = decodedResult || "Nicht dekodierbar (leer/invalid)";
                break;

            case "MIFARE_CLASSIC":
                await api.mifare();
                const { readMifareClassic } = await import("../tags/mifareClassic.js");
                const { MifareClassic_Login } = await import("../handler/protocolHandler.js");
                // Use the passed mergedConfig instead of fetching again
                let mfConfig = mergedConfig || { uid: tag.uid };
                const sector = mfConfig.sector || 1;
                const { authenticated, usedDefaultKey } = await authenticateMifareClassic({
                    keyA: mfConfig.key_a,
                    keyB: mfConfig.key_b,
                    sector,
                    MifareClassic_Login,
                });
                if (!authenticated) {
                    techInfo.decodedId = "Authentifizierung fehlgeschlagen";
                    break;
                }
                if (usedDefaultKey) {
                    techInfo.decodedId = "Tag leer oder nicht konfiguriert (Standard-Schlüssel)";
                    break;
                }
                const mfDecodedResult = await readMifareClassic({ tags: { mifareClassic: mfConfig } });
                techInfo.decodedId = mfDecodedResult ? mfDecodedResult.toString() : "Nicht dekodierbar (leer/invalid)";
                break;
            case "MIFARE_DESFIRE":
                logger.debug("Starting DESFire technical info reading...");
                await api.mifare();
                const { DESFire_Authenticate, DESFire_SelectApplication, DESFire_ReadData } = await import("../handler/protocolHandler.js");
                const { DESF } = await import("../constants/constants.js");
                // Use the passed mergedConfig instead of fetching again
                let dfConfig = mergedConfig || { uid: tag.uid };
                const appId = dfConfig.app_id;
                const fileId = dfConfig.file_byte;
                const masterKey = dfConfig.master_key;
                const appReadKey = dfConfig.app_read_key;
                logger.debug(`DESFire ERP config: appId=${appId}, fileId=${fileId}, masterKey=${masterKey}, appReadKey=${appReadKey}`);
                if (
                    appId === undefined ||
                    appId === null ||
                    appId === "" ||
                    fileId === undefined ||
                    fileId === null ||
                    fileId === "" ||
                    !masterKey ||
                    !appReadKey
                ) {
                    logger.debug(
                        `Missing required config: appId=${appId}, fileId=${fileId}, masterKey=${masterKey}, appReadKey=${appReadKey}`
                    );
                    techInfo.decodedId = "Keine ERP-Konfiguration verfügbar";
                    break;
                }
                logger.debug("All required config found, proceeding with authentication...");
                const result = await authenticateAndReadDesfire({
                    DESFire_Authenticate,
                    DESFire_SelectApplication,
                    DESFire_ReadData,
                    DESF,
                    appId,
                    fileId,
                    masterKey,
                    appReadKey,
                });
                if (result.error) {
                    logger.debug(`Error reading DESFire: ${result.error}`);
                    techInfo.decodedId = result.error;
                } else {
                    techInfo.decodedId = result.data.toString();
                    logger.debug(`Successfully read DESFire data: ${techInfo.decodedId}`);
                }
                break;

            case "DEISTER":
                // No additional technical info for DEISTER tags
                break;

            case "EM":
                // No additional technical info for EM tags
                break;
        }
    } catch (error) {
        logger.warn(`Error getting technical info for ${tag.type}:`, error);
    }

    return techInfo;
}

// Utility: Fetch and merge ERP config for a tag
async function getMergedTagConfig(tag, transponderData) {
    let mergedConfig = { uid: tag.uid };
    if (transponderData && transponderData.transponder_configuration) {
        try {
            const erpRestApi = window.erpRestApi;
            if (erpRestApi) {
                const config = await erpRestApi.getTransponderConfiguration(transponderData.transponder_configuration);
                if (config && config.tags) {
                    // Map tag types to ERP config keys
                    let configKey;
                    switch (tag.type.toUpperCase()) {
                        case "HITAG1S":
                            configKey = "hitag";
                            break;
                        case "MIFARE_CLASSIC":
                            configKey = "mifareClassic";
                            break;
                        case "MIFARE_DESFIRE":
                            configKey = "mifareDesfire";
                            break;
                        case "DEISTER":
                            configKey = "deister";
                            break;
                        case "EM":
                            configKey = "em";
                            break;
                        default:
                            configKey = tag.type.toLowerCase();
                    }

                    if (config.tags[configKey]) {
                        mergedConfig = { ...mergedConfig, ...config.tags[configKey] };
                        logger.debug(`Merged config for ${tag.type}:`, mergedConfig);
                    } else {
                        logger.debug(`No config found for ${tag.type} with key ${configKey}`);
                    }
                }
            }
        } catch (error) {
            logger.debug(`Error getting merged config for ${tag.type}: ${error.message}`);
        }
    }
    return mergedConfig;
}

function formatGeneralConfiguration(config) {
    let html = "";

    const generalFields = [
        { key: "transponderConfigId", label: "Konfigurations-ID" },
        { key: "form", label: "Form" },
        { key: "customerName", label: "Kunde" },
    ];

    const generalValues = generalFields.filter((field) => config[field.key] && config[field.key] !== "");

    if (generalValues.length > 0) {
        html += '<table class="info-table">';
        generalValues.forEach((field) => {
            html += `<tr><td>${field.label}:</td><td>${config[field.key]}</td></tr>`;
        });
        html += "</table>";
    }

    return html;
}

function formatTagSpecificConfiguration(config, tagType) {
    let html = "";

    // Show only the configuration for the detected tag type
    switch (tagType.toUpperCase()) {
        case "HITAG1S":
            if (config.tags?.hitag) {
                const hitag = config.tags.hitag;
                const hitagFields = [
                    { key: "feig_coding", label: "Feig Coding" },
                    { key: "number", label: "Nummer" },
                    { key: "uid", label: "UID" },
                ];

                const hitagValues = hitagFields.filter(
                    (field) => hitag[field.key] !== undefined && hitag[field.key] !== null && hitag[field.key] !== ""
                );

                if (hitagValues.length > 0) {
                    html += '<table class="info-table">';
                    hitagValues.forEach((field) => {
                        html += `<tr><td>${field.label}:</td><td>${hitag[field.key]}</td></tr>`;
                    });
                    html += "</table>";
                }
            }
            break;

        case "MIFARE_CLASSIC":
            if (config.tags?.mifareClassic) {
                const mf = config.tags.mifareClassic;
                const mfFields = [
                    { key: "key_a", label: "Key A" },
                    { key: "key_b", label: "Key B" },
                    { key: "sector", label: "Sektor" },
                    { key: "skip_bytes", label: "Skip Bytes" },
                    { key: "read_bytes", label: "Read Bytes" },
                    { key: "app_id", label: "App ID" },
                    { key: "file_byte", label: "File Byte" },
                    { key: "number", label: "Nummer" },
                    { key: "uid", label: "UID" },
                ];

                const mfValues = mfFields.filter((field) => mf[field.key] !== undefined && mf[field.key] !== null && mf[field.key] !== "");

                if (mfValues.length > 0) {
                    html += '<table class="info-table">';
                    mfValues.forEach((field) => {
                        html += `<tr><td>${field.label}:</td><td>${mf[field.key]}</td></tr>`;
                    });
                    html += "</table>";
                }
            }
            break;

        case "MIFARE_DESFIRE":
            if (config.tags?.mifareDesfire) {
                const mf = config.tags.mifareDesfire;
                const mfFields = [
                    { key: "app_id", label: "App ID" },
                    { key: "file_id", label: "File ID" },
                    { key: "key", label: "Key" },
                    { key: "number", label: "Nummer" },
                    { key: "uid", label: "UID" },
                ];

                const mfValues = mfFields.filter((field) => mf[field.key] !== undefined && mf[field.key] !== null && mf[field.key] !== "");

                if (mfValues.length > 0) {
                    html += '<table class="info-table">';
                    mfValues.forEach((field) => {
                        html += `<tr><td>${field.label}:</td><td>${mf[field.key]}</td></tr>`;
                    });
                    html += "</table>";
                }
            }
            break;

        case "LEGIC":
            if (config.tags?.legic) {
                const legic = config.tags.legic;
                const legicFields = [
                    { key: "app_id", label: "App ID" },
                    { key: "number", label: "Nummer" },
                    { key: "uid", label: "UID" },
                ];

                const legicValues = legicFields.filter(
                    (field) => legic[field.key] !== undefined && legic[field.key] !== null && legic[field.key] !== ""
                );

                if (legicValues.length > 0) {
                    html += '<table class="info-table">';
                    legicValues.forEach((field) => {
                        html += `<tr><td>${field.label}:</td><td>${legic[field.key]}</td></tr>`;
                    });
                    html += "</table>";
                }
            }
            break;

        case "DEISTER":
            if (config.tags?.deister) {
                const deister = config.tags.deister;
                const deisterFields = [
                    { key: "number", label: "Nummer" },
                    { key: "uid", label: "UID" },
                ];

                const deisterValues = deisterFields.filter(
                    (field) => deister[field.key] !== undefined && deister[field.key] !== null && deister[field.key] !== ""
                );

                if (deisterValues.length > 0) {
                    html += '<table class="info-table">';
                    deisterValues.forEach((field) => {
                        html += `<tr><td>${field.label}:</td><td>${deister[field.key]}</td></tr>`;
                    });
                    html += "</table>";
                }
            }
            break;

        case "EM":
            if (config.tags?.em) {
                const em = config.tags.em;
                const emFields = [
                    { key: "number", label: "Nummer" },
                    { key: "uid", label: "UID" },
                ];

                const emValues = emFields.filter((field) => em[field.key] !== undefined && em[field.key] !== null && em[field.key] !== "");

                if (emValues.length > 0) {
                    html += '<table class="info-table">';
                    emValues.forEach((field) => {
                        html += `<tr><td>${field.label}:</td><td>${em[field.key]}</td></tr>`;
                    });
                    html += "</table>";
                }
            }
            break;
    }

    return html;
}

// Refactor showDetailedModal to use createOverlayModal
function showDetailedModal(tagDetails, originalDialog) {
    if (originalDialog.overlay && originalDialog.overlay.parentNode) {
        originalDialog.overlay.parentNode.removeChild(originalDialog.overlay);
    }
    let modalContent = `
        <h2>Schlüssel-Übersicht</h2>
    `;

    // Show general configuration once if all tags have the same configuration
    const firstConfig = tagDetails[0]?.configuration;
    if (firstConfig && tagDetails.every((tag) => tag.configuration?.transponderConfigId === firstConfig.transponderConfigId)) {
        modalContent += `
            <div class="general-config-section">
                <h3>Allgemeine Konfiguration</h3>
                ${formatGeneralConfiguration(firstConfig)}
            </div>
        `;
    }

    modalContent += `<div class="tag-details">`;

    tagDetails.forEach((tag, index) => {
        modalContent += `
            <div class="tag-section">
                <h3>${tag.type} (${tag.uid})</h3>
                
                <div class="info-grid">
                    <div class="info-section">
                        <h4>Grundinformationen</h4>
                        <table class="info-table">
                            <tr><td>Typ:</td><td>${tag.type}</td></tr>
                            <tr><td>UID:</td><td>${tag.uid}</td></tr>
                        </table>
                    </div>
        `;

        if (tag.erpInfo) {
            modalContent += `
                    <div class="info-section">
                        <h4>ERP-Informationen</h4>
                        <table class="info-table">
                            <tr><td>Code/Name:</td><td>${tag.erpInfo.code || tag.erpInfo.name || "N/A"}</td></tr>
                            <tr><td>Konfiguration:</td><td>${tag.erpInfo.transponder_configuration || "N/A"}</td></tr>
                            <tr><td>Testschlüssel:</td><td>${tag.erpInfo.test_key ? "🧪 Ja" : "❌ Nein"}</td></tr>
                            <tr><td>Erstellt:</td><td>${
                                tag.erpInfo.creation ? new Date(tag.erpInfo.creation).toLocaleDateString() : "N/A"
                            }</td></tr>
                            <tr><td>Geändert:</td><td>${
                                tag.erpInfo.modified ? new Date(tag.erpInfo.modified).toLocaleDateString() : "N/A"
                            }</td></tr>
                        </table>
                    </div>
            `;
        }

        modalContent += `</div>`;

        // Show technical information including decoded IDs
        if (tag.technicalInfo) {
            modalContent += `
                <div class="info-section">
                    <h4>Technische Informationen</h4>
                    <table class="info-table">
            `;

            if (tag.technicalInfo.decodedId !== undefined) {
                let color = "#28a745"; // Grün für erfolgreiche Dekodierung
                if (
                    tag.technicalInfo.decodedId.includes("Fehler") ||
                    tag.technicalInfo.decodedId.includes("nicht") ||
                    tag.technicalInfo.decodedId.includes("leer")
                ) {
                    color = "#dc3545"; // Rot für Fehler/leer
                }
                modalContent += `<tr><td>Dekodierte ID:</td><td><strong style="color: ${color};">${tag.technicalInfo.decodedId}</strong></td></tr>`;
            }
            if (tag.technicalInfo.block0 !== undefined) {
                modalContent += `<tr><td>Block 0:</td><td><code>${tag.technicalInfo.block0}</code></td></tr>`;
            }
            if (tag.technicalInfo.block1c !== undefined) {
                modalContent += `<tr><td>Block 1C:</td><td><code>${tag.technicalInfo.block1c}</code></td></tr>`;
            }
            if (tag.technicalInfo.configuredBlock) {
                const block = tag.technicalInfo.configuredBlock;
                modalContent += `<tr><td>Gelesener Block:</td><td>Sektor ${block.sector}, Block ${block.block}</td></tr>`;
                modalContent += `<tr><td>Schlüssel:</td><td>${block.key} (${block.keyType})</td></tr>`;
                modalContent += `<tr><td>Daten:</td><td><code>${block.data}</code></td></tr>`;
            }
            if (tag.technicalInfo.version) {
                modalContent += `<tr><td>Version:</td><td><code>${JSON.stringify(tag.technicalInfo.version)}</code></td></tr>`;
            }

            modalContent += `
                    </table>
                </div>
            `;
        }

        // Show only tag-specific configuration
        if (tag.configuration) {
            modalContent += `
                <div class="info-section">
                    <h4>Tag-Konfiguration</h4>
                    ${formatTagSpecificConfiguration(tag.configuration, tag.type)}
                </div>
            `;
        }

        modalContent += `</div>`;
    });

    modalContent += `
        </div>
        <div class="modal-buttons">
            <button class="btn" id="closeModalBtn">Schließen</button>
        </div>
    `;
    // Use utility for overlay/modal
    createOverlayModal({
        content: modalContent,
        onClose: () => setIsReading(false),
        closeBtnId: "closeModalBtn",
    });
}
