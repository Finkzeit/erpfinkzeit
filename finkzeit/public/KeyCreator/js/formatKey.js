import logger from "./logger.js";
import { verifyKey } from "./formatKeyVerify.js";
import * as protocolHandler from "./handler/protocolHandler.js";
import * as api from "./api.js";
import { DESF } from "./constants/constants.js";
import { setIsFormatting } from "./state.js";
import { clearKeys } from "./verifyKey.js"; // Add this import

const CRYPTO_ENV = DESF.CRYPTO_ENV0; // Assuming default crypto environment

let shouldContinueSearch = true;

export function initializeKeyFormatting() {
    logger.debug("Initializing key formatting");
    const settingsButton = document.getElementById("settingsButton");
    const formatKeyOption = document.getElementById("formatKeyOption");
    const settingsDropdown = document.getElementById("settingsDropdown");

    if (!settingsButton || !formatKeyOption || !settingsDropdown) {
        logger.error("One or more elements not found for key formatting");
        return;
    }

    settingsButton.addEventListener("click", toggleDropdown);
    formatKeyOption.addEventListener("click", () => {
        logger.debug("Format Key option clicked");
        handleFormatKey();
    });

    window.addEventListener("click", function (event) {
        const dropdownContent = document.querySelector(".dropdown-content");
        if (dropdownContent.classList.contains("show") && !event.target.matches(".dropbtn") && !event.target.closest(".dropdown-content")) {
            closeDropdown();
        }
    });

    logger.debug("Key formatting initialized");
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

async function handleFormatKey() {
    logger.debug("Handle format key called");

    const dialog = showDialog("Schlüssel wird gesucht. Bitte legen Sie einen Schlüssel auf den Leser.");
    shouldContinueSearch = true;
    logger.debug("Setting isFormatting to true");
    setIsFormatting(true); // Set the flag to stop the main loop

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
        setTimeout(() => {
            if (dialog.overlay && dialog.overlay.parentNode) {
                dialog.overlay.parentNode.removeChild(dialog.overlay);
            }
            logger.debug("Setting isFormatting to false");
            setIsFormatting(false); // Reset the flag after formatting is done
        }, 4000);
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

function getConfirmation(dialog, showFormatButton) {
    return new Promise((resolve) => {
        const buttonsContainer = dialog.dialogElement.querySelector("#dialogButtons");
        if (showFormatButton) {
            const formatButton = document.createElement("button");
            formatButton.className = "btn";
            formatButton.id = "formatBtn";
            formatButton.textContent = "Formatieren";
            formatButton.addEventListener("click", () => {
                // Remove both buttons when formatting starts
                buttonsContainer.innerHTML = "";
                resolve(true);
            });
            buttonsContainer.insertBefore(formatButton, buttonsContainer.firstChild);
        }

        const cancelButton = document.getElementById("cancelBtn");
        cancelButton.addEventListener("click", () => {
            // Remove both buttons when cancelling
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
    updateDialogMessage("Tag-Formatierung wird gestartet...");
    for (const tag of tags) {
        try {
            await formatTag(tag);
            updateDialogMessage(`${tag.type} (${tag.uid}) erfolgreich formatiert`);
            clearKeys(tag.uid); // Clear keys after successful format
        } catch (error) {
            updateDialogMessage(`Fehler beim Formatieren von ${tag.type} (${tag.uid}): ${error.message}`);
        }
    }
    updateDialogMessage("Tag-Formatierung abgeschlossen. Entfernen Sie den Schlüssel, wenn Sie ihn nicht automatisch beschreiben möchten.");
}

async function formatTag(tag) {
    logger.debug(`Formatting ${tag.type} (${tag.uid})...`);

    try {
        switch (tag.type.toUpperCase()) {
            case "HITAG":
            case "HITAG1S": // Add this line to handle "hitag1s"
                await hitagScript({ tags: { hitag: { uid: tag.uid } } });
                break;
            case "MIFARE_CLASSIC":
                await mifareClassicScript({ tags: { mifareClassic: { uid: tag.uid } } });
                break;
            case "MIFARE_DESFIRE":
                await mifareDesfireScript({ tags: { mifareDesfire: { uid: tag.uid } } });
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
            0xffffffffffff, // Default key
            0xa0a1a2a3a4a5,
            0xd3f7d3f7d3f7,
            0x123456780000,
            0x111111111111,
            // Add more keys as needed
        ],
        B: [
            0xffffffffffff, // Default key
            // Add more keys as needed
        ],
    };

    const totalSectors = 16; // Assuming a Mifare Classic 1K tag

    try {
        for (let sector = 0; sector < totalSectors; sector++) {
            let loggedIn = false;

            // Try to login with each key type and key
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
                // Write 0s to blocks, skipping block 0 in sector 0
                const zeroData = "00000000000000000000000000000000";
                const startBlock = sector === 0 ? 1 : 0; // Skip block 0 in sector 0
                const endBlock = sector === 0 ? 2 : 3; // Write to 2 blocks in sector 0, 3 blocks in others

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

                // Write specific data to block 3 (trailer block)
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

    const masterKeys = [
        0x2,
        0x00000000000000000000000000000000, // Default 3DES key
        0x12344567890,
        0x0123456789abcdef0123456789abcdef, // Example AES key
        0xaabbccddeeff00112233445566778899, // Another example key
        // Add more keys as needed
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
        logger.warn("Dialog text element not found");
    }
}
