import logger from "./logger.js";
import { verifyKey } from "./keyVerifyOperation.js";
import * as protocolHandler from "./handler/protocolHandler.js";
import * as api from "./api.js";
import { DESF } from "./constants/constants.js";
import { setIsFormatting } from "./state.js";
import { clearKeys } from "./verifyKey.js";

const CRYPTO_ENV = DESF.CRYPTO_ENV0;

let shouldContinueSearch = true;
let erpRestApi; // Declare at the top level

export function initializeKeyOperation(erpRestApiInstance) {
    erpRestApi = erpRestApiInstance; // Store the instance
    logger.debug("Initializing key formatting and reading");
    const settingsButton = document.getElementById("settingsButton");
    const formatKeyOption = document.getElementById("formatKeyOption");
    const readKeyOption = document.getElementById("readKeyOption");
    const settingsDropdown = document.getElementById("settingsDropdown");

    if (!settingsButton || !formatKeyOption || !readKeyOption || !settingsDropdown) {
        logger.error("One or more elements not found for key formatting/reading");
        return;
    }

    settingsButton.addEventListener("click", toggleDropdown);
    formatKeyOption.addEventListener("click", () => {
        logger.debug("Format Key option clicked");
        keyOperations("format");
    });
    readKeyOption.addEventListener("click", () => {
        logger.debug("Read Key option clicked");
        keyOperations("read");
    });

    window.addEventListener("click", function (event) {
        const dropdownContent = document.querySelector(".dropdown-content");
        if (dropdownContent.classList.contains("show") && !event.target.matches(".dropbtn") && !event.target.closest(".dropdown-content")) {
            closeDropdown();
        }
    });

    logger.debug("Key formatting and reading initialized");
}

function toggleDropdown(event) {
    logger.debug("Toggle dropdown called");
    event.stopPropagation();
    const dropdownContent = document.querySelector(".dropdown-content");
    dropdownContent.classList.toggle("show");
}

function closeDropdown() {
    logger.debug("Close dropdown called");
    const dropdownContent = document.querySelector(".dropdown-content");
    dropdownContent.classList.remove("show");
}

async function keyOperations(action) {
    logger.debug(`Handle ${action} key called`);

    const dialog = showDialog(`Schlüssel wird gesucht. Bitte legen Sie einen Schlüssel auf den Leser.`);
    shouldContinueSearch = true;
    logger.debug("Setting isFormatting to true");
    setIsFormatting(true);

    try {
        updateDialogMessage(`Tag zum ${action === "format" ? "Formatieren" : "Lesen"} wird gesucht...`);
        logger.debug("Starting tag detection");
        const detectedTags = await getDetectedTags(dialog);
        logger.debug("Detected tags:", detectedTags);

        if (!shouldContinueSearch || detectedTags.length === 0) {
            updateDialogText(
                dialog,
                detectedTags.length === 0 ? "Keine Tags erkannt. Bitte versuchen Sie es erneut." : "Tag-Erkennung abgebrochen."
            );
            addCloseButton(dialog, true);
            return;
        }

        const detectedTechsString = detectedTags
            .map((tag) => {
                const type = tag.type.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
                return `${type} (${tag.uid.toUpperCase()})`;
            })
            .join(", ");
        const keyText = detectedTags.length === 1 ? "Schlüssel" : "Schlüssel";
        const actionText = action === "format" ? "formatieren" : "lesen";
        updateDialogText(
            dialog,
            `Erkannte ${keyText}: ${detectedTechsString}. Möchten Sie ${
                actionText === "formatieren" ? "diesen" : "diese"
            } ${keyText} ${actionText}?`
        );

        const shouldProceed = await getConfirmation(dialog, action);
        if (shouldProceed) {
            if (action === "format") {
                await formatKey(detectedTags, dialog);
            } else {
                await readKey(detectedTags, dialog);
            }
        } else {
            addCloseButton(dialog, true);
        }
    } catch (error) {
        logger.error(`Error in keyOperations:`, error);
        updateDialogText(dialog, "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.");
        addCloseButton(dialog, true);
    }
}

async function formatKey(tags, dialog) {
    updateDialogMessage("Tag-Formatierung wird gestartet...");
    for (const tag of tags) {
        try {
            await formatTag(tag);
            updateDialogMessage(`${tag.type} (${tag.uid}) erfolgreich formatiert`);
            clearKeys(tag.uid);
        } catch (error) {
            updateDialogMessage(`Fehler beim Formatieren von ${tag.type} (${tag.uid}): ${error.message}`);
        }
    }
    updateDialogMessage("Tag-Formatierung abgeschlossen. Entfernen Sie den Schlüssel, wenn Sie ihn nicht automatisch beschreiben möchten.");

    // Add a close button that sets isFormatting to false
    addCloseButton(dialog, true);
}

async function readKey(tags, dialog) {
    updateDialogMessage("Tag-Auslesen wird gestartet...");
    for (const tag of tags) {
        try {
            const transponderData = await readTag(tag);
            updateDialogMessage(`${tag.type} (${tag.uid}) erfolgreich ausgelesen`);

            // Display the transponder data and wait for user confirmation
            await displayTransponderDataAndWait(transponderData, dialog);
        } catch (error) {
            updateDialogMessage(`Fehler beim Auslesen von ${tag.type} (${tag.uid}): ${error.message}`);
            await waitForUserConfirmation(dialog);
        }
    }

    // Add this line to update the dialog message after all tags have been processed
    updateDialogMessage("Tag-Auslesen abgeschlossen.");

    // Add a close button that sets isFormatting to false
    addCloseButton(dialog, true);
}

function displayTransponderDataAndWait(transponderData, dialog) {
    return new Promise((resolve) => {
        if (transponderData && transponderData.message && transponderData.message.length > 0) {
            const data = transponderData.message[0];
            let formattedData = "";

            const addLine = (label, value) => {
                if (value) {
                    formattedData += `${label}: ${value}\n`;
                }
            };

            addLine("Nummer", data.name || data.code);
            addLine("Kunde", data.customer_name);
            addLine("Kundennummer", data.customer);
            addLine("Lizenz", data.licence);
            addLine("Lizenzname", data.licence_name);
            addLine("Transponder-Konfiguration", data.transponder_configuration);

            formattedData += "\nUIDs:\n";
            addLine("- Hitag", data.hitag_uid);
            addLine("- Mifare Classic", data.mfcl_uid);
            addLine("- Mifare DESFire", data.mfdf_uid);
            addLine("- Deister", data.deister_uid);
            addLine("- EM", data.em_uid);
            addLine("- Legic", data.legic_uid);

            addLine(
                "\nErstellt am",
                data.creation
                    ? new Date(data.creation).toLocaleString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                      })
                    : null
            );
            addLine(
                "Zuletzt geändert",
                data.modified
                    ? new Date(data.modified).toLocaleString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                      })
                    : null
            );
            addLine("Geändert von", data.modified_by);

            updateDialogText(dialog, formattedData.trim());
        } else {
            updateDialogText(dialog, "Keine Daten für diesen Transponder gefunden.");
        }

        // Add a close button
        const closeButton = document.createElement("button");
        closeButton.textContent = "Schließen";
        closeButton.className = "btn";
        closeButton.addEventListener("click", () => {
            closeDialog(dialog); // Close the dialog immediately
            resolve();
        });

        const buttonsContainer = dialog.dialogElement.querySelector("#dialogButtons");
        buttonsContainer.innerHTML = "";
        buttonsContainer.appendChild(closeButton);
    });
}

function waitForUserConfirmation(dialog) {
    return new Promise((resolve) => {
        const okButton = document.createElement("button");
        okButton.textContent = "OK";
        okButton.className = "btn";
        okButton.addEventListener("click", () => {
            resolve();
        });

        const buttonsContainer = dialog.dialogElement.querySelector("#dialogButtons");
        buttonsContainer.innerHTML = "";
        buttonsContainer.appendChild(okButton);
    });
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
        logger.debug("Setting isFormatting to false");
        setIsFormatting(false);
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
    textElement.style.whiteSpace = "pre-wrap"; // This preserves line breaks
}

function getConfirmation(dialog, action) {
    return new Promise((resolve) => {
        const buttonsContainer = dialog.dialogElement.querySelector("#dialogButtons");
        const actionButton = document.createElement("button");
        actionButton.className = "btn";
        actionButton.id = action === "format" ? "formatBtn" : "readBtn";
        actionButton.textContent = action === "format" ? "Formatieren" : "Lesen";
        actionButton.addEventListener("click", () => {
            buttonsContainer.innerHTML = "";
            resolve(true);
        });
        buttonsContainer.insertBefore(actionButton, buttonsContainer.firstChild);

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

async function formatTag(tag) {
    logger.debug(`Formatting ${tag.type} (${tag.uid})...`);

    try {
        // Use the existing readTag function to get transponder data
        const transponderData = await readTag(tag);

        let transponderConfig = null;
        if (transponderData.message && transponderData.message.length > 0) {
            const transponderConfigId = transponderData.message[0].transponder_configuration;
            transponderConfig = await erpRestApi.getTransponderConfiguration(transponderConfigId);
        } else {
            logger.warn(`No transponder configuration found for ${tag.type} (${tag.uid}). Using default keys.`);
        }

        switch (tag.type.toUpperCase()) {
            case "HITAG":
            case "HITAG1S":
                await hitagScript({ tags: { hitag: { uid: tag.uid } } });
                break;
            case "MIFARE_CLASSIC":
                await mifareClassicScript({
                    tags: { mifareClassic: { uid: tag.uid } },
                    key_a: transponderConfig?.tags?.mifareClassic?.key_a || 0xffffffffffff, // Default key if not found
                    key_b: transponderConfig?.tags?.mifareClassic?.key_b || 0xffffffffffff, // Default key if not found
                });
                break;
            case "MIFARE_DESFIRE":
                await mifareDesfireScript({
                    tags: { mifareDesfire: { uid: tag.uid } },
                    master_key: transponderConfig?.tags?.mifareDesfire?.master_key || 0x00000000000000000000000000000000, // Default key if not found
                });
                break;
            default:
                throw new Error(`Unsupported tag type: ${tag.type}`);
        }
        logger.debug(`${tag.type} (${tag.uid}) formatted successfully`);
    } catch (error) {
        logger.error(`Error formatting ${tag.type} (${tag.uid}): ${error.message}`);
        throw error;
    }
}

async function hitagScript(config) {
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

async function mifareClassicScript(config) {
    logger.debug("Starting mifareClassicScript function");
    updateDialogMessage("Mifare Classic-Operationen werden gestartet");
    await api.mifare();

    const keys = {
        A: [
            `0x${config.key_a}`,
            0xffffffffffff,
            0xa0a1a2a3a4a5,
            0xd3f7d3f7d3f7,
            0x000000000000,
            0xb0b1b2b3b4b5,
            0x4d3a99c351dd,
            0x1a982c7e459a,
            0xaabbccddeeff,
            0x714c5c886e97,
            0x587ee5f9350f,
            0xa0478cc39091,
            0x533cb6c723f6,
            0x8fd0a4f256e9,
            0xa64598a77478,
            0x26940b21ff5d,
            0xfc00018778f7,
            0x00000ffe2488,
            0x5c598c9c58b5,
            0xe4d2770a89be,
            0x434f4d4d4f41,
            0x434f4d4d4f42,
            0x47524f555041,
            0x47524f555042,
            0x505249564141,
            0x505249564142,
            0x0297927c0f77,
            0xee0042f88840,
            0x722bfcc5375f,
            0xf1d83f964314,
            0x54726176656c,
            0x776974687573,
            0x4af9d7adebe4,
            0x2ba9621e0a36,
            0x000000000001,
            0x123456789abc,
            0xb127c6f41436,
            0x12f2ee3478c1,
            0x34d1df9934c5,
            0x55f5a5dd38c9,
            0xf1a97341a9fc,
            0x33f974b42769,
            0x14d446e33363,
            0xc934fe34d934,
            0x1999a3554a55,
            0x27dd91f1fcf1,
            0xa94133013401,
            0x99c636334433,
            0x43ab19ef5c31,
            0xa053a292a4af,
            0x505249565441,
            0x505249565442,
            0xfc0001877bf7,
            0xa0b0c0d0e0f0,
            0xa1b1c1d1e1f1,
            0xbd493a3962b6,
            0x010203040506,
            0x111111111111,
            0x222222222222,
            0x333333333333,
            0x444444444444,
            0x555555555555,
            0x666666666666,
            0x777777777777,
            0x888888888888,
            0x999999999999,
            0xaaaaaaaaaaaa,
            0xbbbbbbbbbbbb,
            0xcccccccccccc,
            0xdddddddddddd,
            0xeeeeeeeeeeee,
            0x0123456789ab,
            0x000000000002,
            0x00000000000a,
            0x00000000000b,
            0x100000000000,
            0x200000000000,
            0xa00000000000,
            0xb00000000000,
            0xabcdef123456,
        ],
        B: [
            `0x${config.key_b}`,
            0xffffffffffff,
            0xa0a1a2a3a4a5,
            0xd3f7d3f7d3f7,
            0x000000000000,
            0xb0b1b2b3b4b5,
            0x4d3a99c351dd,
            0x1a982c7e459a,
            0xaabbccddeeff,
            0x714c5c886e97,
            0x587ee5f9350f,
            0xa0478cc39091,
            0x533cb6c723f6,
            0x8fd0a4f256e9,
            0xa64598a77478,
            0x26940b21ff5d,
            0xfc00018778f7,
            0x00000ffe2488,
            0x5c598c9c58b5,
            0xe4d2770a89be,
            0x434f4d4d4f41,
            0x434f4d4d4f42,
            0x47524f555041,
            0x47524f555042,
            0x505249564141,
            0x505249564142,
            0x0297927c0f77,
            0xee0042f88840,
            0x722bfcc5375f,
            0xf1d83f964314,
            0x54726176656c,
            0x776974687573,
            0x4af9d7adebe4,
            0x2ba9621e0a36,
            0x000000000001,
            0x123456789abc,
            0xb127c6f41436,
            0x12f2ee3478c1,
            0x34d1df9934c5,
            0x55f5a5dd38c9,
            0xf1a97341a9fc,
            0x33f974b42769,
            0x14d446e33363,
            0xc934fe34d934,
            0x1999a3554a55,
            0x27dd91f1fcf1,
            0xa94133013401,
            0x99c636334433,
            0x43ab19ef5c31,
            0xa053a292a4af,
            0x505249565441,
            0x505249565442,
            0xfc0001877bf7,
            0xa0b0c0d0e0f0,
            0xa1b1c1d1e1f1,
            0xbd493a3962b6,
            0x010203040506,
            0x111111111111,
            0x222222222222,
            0x333333333333,
            0x444444444444,
            0x555555555555,
            0x666666666666,
            0x777777777777,
            0x888888888888,
            0x999999999999,
            0xaaaaaaaaaaaa,
            0xbbbbbbbbbbbb,
            0xcccccccccccc,
            0xdddddddddddd,
            0xeeeeeeeeeeee,
            0x0123456789ab,
            0x000000000002,
            0x00000000000a,
            0x00000000000b,
            0x100000000000,
            0x200000000000,
            0xa00000000000,
            0xb00000000000,
            0xabcdef123456,
        ],
    };

    const totalSectors = 16;

    try {
        for (let sector = 0; sector < totalSectors; sector++) {
            let loggedIn = false;

            for (const keyType of ["A", "B"]) {
                for (const key of keys[keyType]) {
                    try {
                        const loginResult = await protocolHandler.MifareClassic_Login(key, keyType === "A" ? "00" : "01", sector);
                        if (loginResult) {
                            loggedIn = true;
                            logger.info(`Successfully logged in to sector ${sector} with key ${key} (Key ${keyType})`);
                            break;
                        }
                    } catch (error) {
                        logger.debug(`Login failed for sector ${sector} with key ${key} (Key ${keyType}): ${error.message}`);
                    }
                }
                if (loggedIn) break;
            }

            if (loggedIn) {
                const zeroData = "00000000000000000000000000000000";
                const startBlock = sector === 0 ? 1 : 0;
                const endBlock = sector === 0 ? 2 : 3;

                for (let i = startBlock; i < endBlock; i++) {
                    const block = sector * 4 + i;
                    const writeResponse = await protocolHandler.MifareClassic_WriteBlock(block, zeroData);
                    if (writeResponse) {
                        logger.info(`Successfully wrote zeros to block ${block} in sector ${sector}`);
                        updateDialogMessage(`Schreibe Nullen in Block ${block} in Sektor ${sector}...`);
                    } else {
                        logger.warn(`Failed to write zeros to block ${block} in sector ${sector}`);
                        updateDialogMessage(`Fehler beim Schreiben von Nullen in Block ${block} in Sektor ${sector}`);
                    }
                }

                const trailerData = "FFFFFFFFFFFF" + "FF0780" + "69" + "FFFFFFFFFFFF";
                const trailerBlock = sector * 4 + 3;
                const trailerWriteResponse = await protocolHandler.MifareClassic_WriteBlock(trailerBlock, trailerData);
                if (trailerWriteResponse) {
                    logger.info(`Successfully wrote trailer data to block ${trailerBlock} in sector ${sector}`);
                    updateDialogMessage(`Schreibe Trailer-Daten in Block ${trailerBlock} in Sektor ${sector}...`);
                } else {
                    logger.warn(`Failed to write trailer data to block ${trailerBlock} in sector ${sector}`);
                    updateDialogMessage(`Fehler beim Schreiben von Trailer-Daten in Block ${trailerBlock} in Sektor ${sector}`);
                }
            } else {
                logger.warn(`Failed to login to sector ${sector} with any key`);
                updateDialogMessage(`Fehler beim Anmelden an Sektor ${sector} mit einem beliebigen Schlüssel`);
            }
        }

        logger.info("Mifare Classic tag formatting completed");
        updateDialogMessage("MIFARE_CLASSIC-Tag erfolgreich formatiert");
        return true;
    } catch (error) {
        logger.error("Error in mifareClassicScript:", error);
        updateDialogMessage(`Fehler beim Formatieren von MIFARE_CLASSIC: ${error.message}`);
        return false;
    }
}

async function mifareDesfireScript(config) {
    logger.debug("Starting mifareDesfireScript function");
    updateDialogMessage("Mifare DESFire-Operationen werden gestartet");

    console.log("keym", config.master_key);
    console.log("keym", `0x${config.master_key}`);

    const masterKeys = [
        Number(`0x${config.master_key}`),
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

        logger.debug("CRYPTO_ENV", CRYPTO_ENV, "keyNumber");

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

async function readTag(tag) {
    logger.debug(`Reading ${tag.type} (${tag.uid})...`);
    const uid = {};
    switch (tag.type.toLowerCase()) {
        case "hitag":
        case "hitag1s":
            uid.hitag_uid = tag.uid;
            break;
        case "mifare_classic":
            uid.mfcl_uid = tag.uid;
            break;
        case "mifare_desfire":
            uid.mfdf_uid = tag.uid;
            break;
        case "deister":
            uid.deister_uid = tag.uid;
            break;
        case "em":
            uid.em_uid = tag.uid;
            break;
        default:
            throw new Error(`Unbekannter Tag-Typ: ${tag.type}`);
    }
    return await erpRestApi.getTransponder(uid);
}

export function updateDialogMessage(message) {
    logger.debug("Updating dialog message:", message);
    const dialogText = document.getElementById("dialogText");
    if (dialogText) {
        dialogText.textContent = message;
    } else {
        logger.warn("Dialog text element not found");
    }
}

function closeDialog(dialog) {
    if (dialog.overlay && dialog.overlay.parentNode) {
        dialog.overlay.parentNode.removeChild(dialog.overlay);
    }
}

function addCloseButton(dialog, setIsFormattingFalse = false) {
    const closeButton = document.createElement("button");
    closeButton.textContent = "Schließen";
    closeButton.className = "btn";
    closeButton.addEventListener("click", () => {
        if (setIsFormattingFalse) {
            logger.debug("Setting isFormatting to false");
            setIsFormatting(false);
        }
        closeDialog(dialog);
    });

    const buttonsContainer = dialog.dialogElement.querySelector("#dialogButtons");
    buttonsContainer.innerHTML = "";
    buttonsContainer.appendChild(closeButton);
}
