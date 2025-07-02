import logger from "./logger.js";
import * as api from "./api.js";
import * as protocolHandler from "./handler/protocolHandler.js";
import { getSAK } from "./handler/protocolHandler.js";
import { DESF } from "./constants/constants.js";

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
    shouldContinueSearch = true;

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

        // Display the information in a detailed modal
        showDetailedModal(tagDetails, dialog);

    } catch (error) {
        logger.error("Error in handleReadKey:", error);
        updateDialogText(dialog, "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.");
    } finally {
        setTimeout(() => {
            if (dialog.overlay && dialog.overlay.parentNode) {
                dialog.overlay.parentNode.removeChild(dialog.overlay);
            }
        }, 2000);
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

function updateDialogMessage(message) {
    logger.debug("Updating dialog message:", message);
    const dialogText = document.getElementById("dialogText");
    if (dialogText) {
        dialogText.textContent = message;
    } else {
        console.log("Dialog message:", message);
    }
}

async function getDetectedTags(dialog) {
    logger.debug("Getting detected tags");

    const searchFunctions = [api.hitag1s, api.mifare, api.deister, api.em];
    const detectedTags = [];
    const detectedUIDs = new Set();

    let attempts = 0;
    const maxAttempts = 50; // 5 seconds with 100ms intervals

    while (attempts < maxAttempts && shouldContinueSearch) {
        attempts++;
        
        for (const searchFunction of searchFunctions) {
            if (!shouldContinueSearch) break;
            
            try {
                const result = await searchFunction();
                if (result.Result && !detectedUIDs.has(result.UID)) {
                    let tagType = result.TagType || "Unknown";
                    if (tagType === "MIFARE") {
                        const sakValue = await getSAK(result.UID);
                        tagType = identifyMifare(sakValue);
                    }
                    
                    detectedTags.push({
                        type: tagType,
                        uid: result.UID,
                        data: result
                    });
                    detectedUIDs.add(result.UID);
                    
                    logger.debug(`Detected tag: ${tagType} (${result.UID})`);
                }
            } catch (error) {
                logger.debug(`Search function error: ${error.message}`);
            }
        }
        
        if (detectedTags.length > 0) {
            break; // Found at least one tag
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return detectedTags;
}

function identifyMifare(sakValue) {
    logger.debug(`Identifying MIFARE type for SAK value: ${sakValue}`);
    if ((sakValue & (1 << 1)) !== 0) return "ERROR";
    if ((sakValue & (1 << 3)) !== 0) return "MIFARE_CLASSIC";
    return "MIFARE_DESFIRE";
}

async function readTagDetails(tag, dialog) {
    logger.debug(`Reading details for ${tag.type} (${tag.uid})`);
    
    const details = {
        type: tag.type,
        uid: tag.uid,
        basicInfo: tag.data,
        erpInfo: null,
        technicalInfo: {},
        configuration: null
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

    // Get technical information based on tag type
    try {
        updateDialogMessage(`Lese technische Details für ${tag.type}...`);
        details.technicalInfo = await getTechnicalInfo(tag, details.erpInfo);
    } catch (error) {
        logger.warn(`Error getting technical info for ${tag.type}:`, error);
    }

    return details;
}

async function getTechnicalInfo(tag, transponderData) {
    const techInfo = {};

    try {
        switch (tag.type.toUpperCase()) {
            case "HITAG1S":
                try {
                    techInfo.sak = await getSAK(tag.uid);
                    logger.debug(`HITAG1S SAK for ${tag.uid}: ${techInfo.sak}`);
                } catch (error) {
                    logger.debug(`Could not get SAK for HITAG1S: ${error.message}`);
                }
                
                // Try to read some blocks to get more info
                try {
                    await api.hitag1s();
                    const block0 = await protocolHandler.hitag1S_ReadBlock(0x00);
                    if (block0 && block0.Result) {
                        techInfo.block0 = block0.Data;
                        logger.debug(`HITAG1S block 0: ${block0.Data}`);
                    }
                    
                    const block1c = await protocolHandler.hitag1S_ReadBlock(0x1c);
                    if (block1c && block1c.Result) {
                        techInfo.block1c = block1c.Data;
                        logger.debug(`HITAG1S block 1c: ${block1c.Data}`);
                    }
                } catch (error) {
                    logger.debug(`Could not read HITAG1S blocks: ${error.message}`);
                }
                break;

            case "MIFARE_CLASSIC":
                try {
                    techInfo.sak = await getSAK(tag.uid);
                    logger.debug(`MIFARE_CLASSIC SAK for ${tag.uid}: ${techInfo.sak}`);
                } catch (error) {
                    logger.debug(`Could not get SAK for MIFARE_CLASSIC: ${error.message}`);
                }
                
                techInfo.atqa = tag.data.ATQA || "N/A";
                logger.debug(`MIFARE_CLASSIC ATQA: ${techInfo.atqa}`);
                
                // Try to read the configured block from ERP
                try {
                    await api.mifare();
                    techInfo.configuredBlock = await readConfiguredMifareBlock(tag, transponderData);
                } catch (error) {
                    logger.debug(`Could not read configured MIFARE_CLASSIC block: ${error.message}`);
                }
                break;

            case "MIFARE_DESFIRE":
                try {
                    techInfo.sak = await getSAK(tag.uid);
                    logger.debug(`MIFARE_DESFIRE SAK for ${tag.uid}: ${techInfo.sak}`);
                } catch (error) {
                    logger.debug(`Could not get SAK for MIFARE_DESFIRE: ${error.message}`);
                }
                
                techInfo.atqa = tag.data.ATQA || "N/A";
                logger.debug(`MIFARE_DESFIRE ATQA: ${techInfo.atqa}`);
                
                // Try to get DESFire info
                try {
                    await api.mifare();
                    const version = await protocolHandler.DESFire_GetVersion(DESF.CRYPTO_ENV0);
                    if (version && version.Result) {
                        techInfo.version = version;
                        logger.debug(`MIFARE_DESFIRE version:`, version);
                    }
                } catch (error) {
                    logger.debug(`Could not get DESFire version: ${error.message}`);
                }
                break;

            case "DEISTER":
                techInfo.atqa = tag.data.ATQA || "N/A";
                logger.debug(`DEISTER ATQA: ${techInfo.atqa}`);
                break;

            case "EM":
                techInfo.atqa = tag.data.ATQA || "N/A";
                logger.debug(`EM ATQA: ${techInfo.atqa}`);
                break;
        }
    } catch (error) {
        logger.warn(`Error getting technical info for ${tag.type}:`, error);
    }

    return techInfo;
}

async function readConfiguredMifareBlock(tag, transponderData) {
    if (!transponderData || !transponderData.transponder_configuration) {
        logger.debug("No transponder configuration found for MIFARE_CLASSIC");
        return null;
    }

    try {
        // Get the configuration to find the sector and key
        const erpRestApi = window.erpRestApi;
        if (!erpRestApi) {
            logger.debug("ERP API not available");
            return null;
        }

        const config = await erpRestApi.getTransponderConfiguration(transponderData.transponder_configuration);
        if (!config || !config.tags || !config.tags.mifareClassic) {
            logger.debug("No MIFARE Classic configuration found");
            return null;
        }

        const mfConfig = config.tags.mifareClassic;
        const sector = mfConfig.sector;
        const keyA = mfConfig.key_a ? parseInt(mfConfig.key_a, 16) : null;
        const keyB = mfConfig.key_b ? parseInt(mfConfig.key_b, 16) : null;

        logger.debug(`Reading configured block for sector ${sector}, keyA: ${keyA ? keyA.toString(16) : 'N/A'}, keyB: ${keyB ? keyB.toString(16) : 'N/A'}`);

        // Try to authenticate with the configured keys
        let authenticated = false;
        let usedKey = null;
        let keyType = null;

        if (keyA) {
            try {
                const loginResult = await protocolHandler.MifareClassic_Login(keyA, "00", sector);
                if (loginResult) {
                    authenticated = true;
                    usedKey = keyA;
                    keyType = "A";
                    logger.debug(`Authenticated with Key A: ${keyA.toString(16)}`);
                }
            } catch (error) {
                logger.debug(`Key A authentication failed: ${error.message}`);
            }
        }

        if (!authenticated && keyB) {
            try {
                const loginResult = await protocolHandler.MifareClassic_Login(keyB, "01", sector);
                if (loginResult) {
                    authenticated = true;
                    usedKey = keyB;
                    keyType = "B";
                    logger.debug(`Authenticated with Key B: ${keyB.toString(16)}`);
                }
            } catch (error) {
                logger.debug(`Key B authentication failed: ${error.message}`);
            }
        }

        if (!authenticated) {
            logger.debug("Could not authenticate with configured keys");
            return null;
        }

        // Read the configured block (first data block of the sector)
        const blockNumber = sector * 4 + 1; // First data block of the sector
        const readResult = await protocolHandler.MifareClassic_ReadBlock(blockNumber);
        
        if (readResult && readResult.Result) {
            logger.debug(`Successfully read block ${blockNumber}: ${readResult.Data}`);
            return {
                sector: sector,
                block: blockNumber,
                data: readResult.Data,
                key: usedKey.toString(16).toUpperCase(),
                keyType: keyType
            };
        } else {
            logger.debug(`Failed to read block ${blockNumber}`);
            return null;
        }

    } catch (error) {
        logger.error(`Error reading configured MIFARE block: ${error.message}`);
        return null;
    }
}

function formatGeneralConfiguration(config) {
    let html = '';
    
    const generalFields = [
        { key: 'transponderConfigId', label: 'Konfigurations-ID' },
        { key: 'form', label: 'Form' },
        { key: 'customerName', label: 'Kunde' }
    ];
    
    const generalValues = generalFields.filter(field => config[field.key] && config[field.key] !== '');
    
    if (generalValues.length > 0) {
        html += '<table class="info-table">';
        generalValues.forEach(field => {
            html += `<tr><td>${field.label}:</td><td>${config[field.key]}</td></tr>`;
        });
        html += '</table>';
    }
    
    return html;
}

function formatTagSpecificConfiguration(config, tagType) {
    let html = '';
    
    // Show only the configuration for the detected tag type
    switch (tagType.toUpperCase()) {
        case "HITAG1S":
            if (config.tags?.hitag) {
                const hitag = config.tags.hitag;
                const hitagFields = [
                    { key: 'feig_coding', label: 'Feig Coding' },
                    { key: 'number', label: 'Nummer' },
                    { key: 'uid', label: 'UID' }
                ];
                
                const hitagValues = hitagFields.filter(field => hitag[field.key] !== undefined && hitag[field.key] !== null && hitag[field.key] !== '');
                
                if (hitagValues.length > 0) {
                    html += '<table class="info-table">';
                    hitagValues.forEach(field => {
                        html += `<tr><td>${field.label}:</td><td>${hitag[field.key]}</td></tr>`;
                    });
                    html += '</table>';
                }
            }
            break;
            
        case "MIFARE_CLASSIC":
            if (config.tags?.mifareClassic) {
                const mf = config.tags.mifareClassic;
                const mfFields = [
                    { key: 'key_a', label: 'Key A' },
                    { key: 'key_b', label: 'Key B' },
                    { key: 'sector', label: 'Sektor' },
                    { key: 'skip_bytes', label: 'Skip Bytes' },
                    { key: 'read_bytes', label: 'Read Bytes' },
                    { key: 'app_id', label: 'App ID' },
                    { key: 'file_byte', label: 'File Byte' },
                    { key: 'number', label: 'Nummer' },
                    { key: 'uid', label: 'UID' }
                ];
                
                const mfValues = mfFields.filter(field => mf[field.key] !== undefined && mf[field.key] !== null && mf[field.key] !== '');
                
                if (mfValues.length > 0) {
                    html += '<table class="info-table">';
                    mfValues.forEach(field => {
                        html += `<tr><td>${field.label}:</td><td>${mf[field.key]}</td></tr>`;
                    });
                    html += '</table>';
                }
            }
            break;
            
        case "MIFARE_DESFIRE":
            if (config.tags?.mifareDesfire) {
                const mf = config.tags.mifareDesfire;
                const mfFields = [
                    { key: 'app_id', label: 'App ID' },
                    { key: 'file_id', label: 'File ID' },
                    { key: 'key', label: 'Key' },
                    { key: 'number', label: 'Nummer' },
                    { key: 'uid', label: 'UID' }
                ];
                
                const mfValues = mfFields.filter(field => mf[field.key] !== undefined && mf[field.key] !== null && mf[field.key] !== '');
                
                if (mfValues.length > 0) {
                    html += '<table class="info-table">';
                    mfValues.forEach(field => {
                        html += `<tr><td>${field.label}:</td><td>${mf[field.key]}</td></tr>`;
                    });
                    html += '</table>';
                }
            }
            break;
            
        case "LEGIC":
            if (config.tags?.legic) {
                const legic = config.tags.legic;
                const legicFields = [
                    { key: 'app_id', label: 'App ID' },
                    { key: 'number', label: 'Nummer' },
                    { key: 'uid', label: 'UID' }
                ];
                
                const legicValues = legicFields.filter(field => legic[field.key] !== undefined && legic[field.key] !== null && legic[field.key] !== '');
                
                if (legicValues.length > 0) {
                    html += '<table class="info-table">';
                    legicValues.forEach(field => {
                        html += `<tr><td>${field.label}:</td><td>${legic[field.key]}</td></tr>`;
                    });
                    html += '</table>';
                }
            }
            break;
            
        case "DEISTER":
            if (config.tags?.deister) {
                const deister = config.tags.deister;
                const deisterFields = [
                    { key: 'number', label: 'Nummer' },
                    { key: 'uid', label: 'UID' }
                ];
                
                const deisterValues = deisterFields.filter(field => deister[field.key] !== undefined && deister[field.key] !== null && deister[field.key] !== '');
                
                if (deisterValues.length > 0) {
                    html += '<table class="info-table">';
                    deisterValues.forEach(field => {
                        html += `<tr><td>${field.label}:</td><td>${deister[field.key]}</td></tr>`;
                    });
                    html += '</table>';
                }
            }
            break;
            
        case "EM":
            if (config.tags?.em) {
                const em = config.tags.em;
                const emFields = [
                    { key: 'number', label: 'Nummer' },
                    { key: 'uid', label: 'UID' }
                ];
                
                const emValues = emFields.filter(field => em[field.key] !== undefined && em[field.key] !== null && em[field.key] !== '');
                
                if (emValues.length > 0) {
                    html += '<table class="info-table">';
                    emValues.forEach(field => {
                        html += `<tr><td>${field.label}:</td><td>${em[field.key]}</td></tr>`;
                    });
                    html += '</table>';
                }
            }
            break;
    }
    
    return html;
}

function showDetailedModal(tagDetails, originalDialog) {
    // Remove the original dialog
    if (originalDialog.overlay && originalDialog.overlay.parentNode) {
        originalDialog.overlay.parentNode.removeChild(originalDialog.overlay);
    }

    // Create detailed modal
    const overlay = document.createElement("div");
    overlay.className = "overlay";

    const modalElement = document.createElement("div");
    modalElement.className = "dialog detailed-modal";
    modalElement.style.maxWidth = "90vw";
    modalElement.style.maxHeight = "90vh";
    modalElement.style.overflow = "auto";

    let modalContent = `
        <h2>Schlüssel-Übersicht</h2>
    `;

    // Show general configuration once if all tags have the same configuration
    const firstConfig = tagDetails[0]?.configuration;
    if (firstConfig && tagDetails.every(tag => tag.configuration?.transponderConfigId === firstConfig.transponderConfigId)) {
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
                            <tr><td>Code/Name:</td><td>${tag.erpInfo.code || tag.erpInfo.name || 'N/A'}</td></tr>
                            <tr><td>Konfiguration:</td><td>${tag.erpInfo.transponder_configuration || 'N/A'}</td></tr>
                            <tr><td>Testschlüssel:</td><td>${tag.erpInfo.test_key ? '🧪 Ja' : '❌ Nein'}</td></tr>
                            <tr><td>Erstellt:</td><td>${tag.erpInfo.creation ? new Date(tag.erpInfo.creation).toLocaleDateString() : 'N/A'}</td></tr>
                            <tr><td>Geändert:</td><td>${tag.erpInfo.modified ? new Date(tag.erpInfo.modified).toLocaleDateString() : 'N/A'}</td></tr>
                        </table>
                    </div>
            `;
        }

        modalContent += `</div>`;

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

    modalElement.innerHTML = modalContent;
    overlay.appendChild(modalElement);
    document.body.appendChild(overlay);

    // Add toggle function to window (keeping for potential future use)
    window.toggleConfig = function(index) {
        const configElement = document.getElementById(`config-${index}`);
        const button = event.target;
        if (configElement.style.display === 'none') {
            configElement.style.display = 'block';
            button.textContent = '[Verstecken]';
        } else {
            configElement.style.display = 'none';
            button.textContent = '[Anzeigen]';
        }
    };

    // Add close functionality
    document.getElementById("closeModalBtn").addEventListener("click", () => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    });

    // Close on overlay click
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }
    });
} 