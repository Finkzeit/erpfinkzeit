import * as api from "../handler/api.js";
import logger from "../core/logger.js";
import { getSAK } from "../handler/protocolHandler.js";
import { updateSessionInfo } from "../ui/ui.js";
import {
    getIsFormatting,
    addFormattingChangeListener,
    removeFormattingChangeListener,
    isAppActive,
    getIsReading,
    addReadingChangeListener,
    removeReadingChangeListener,
} from "../core/state.js";
import { identifyMifareType } from "../utils/mifareUtils.js";

let detectedKeys = {};
let wrongKeys = {};
let correctKeys = {};

export async function verifyKey(transponderConfig, numberHandler) {
    logger.debug("[verifyKey] Starting key verification...");
    updateSessionInfo("status", "Schlüssel wird überprüft");
    let tagDetected = false;

    while (!tagDetected && isAppActive()) {
        if (getIsFormatting() || getIsReading()) {
            logger.debug("[verifyKey] Formatting or reading in progress, stopping detection.");
            return false; // Exit the loop if formatting or reading is in progress
        }

        logger.debug("[verifyKey] Detecting tag....");
        tagDetected = await detectFirstTag(transponderConfig);
        logger.debug("[verifyKey] Tag detected 1:", tagDetected);
        if (tagDetected) {
            await validateNumber(transponderConfig, numberHandler);
            const requiredKeysCorrect = await requiredKeySet(transponderConfig);
            if (requiredKeysCorrect) {
                return true; // Return true if all required keys are correct
            }
        }
    }
    return false; // Return false if the loop exits without finding correct keys
}

export async function detectFirstTag(transponderConfig) {
    logger.debug("[verifyKey] Detecting tag...");
    updateSessionInfo("status", "Tag wird erkannt");

    const searchFunctions = [api.hitag1s, api.mifare, api.deister, api.em];

    while (isAppActive()) {
        if (getIsFormatting() || getIsReading()) {
            logger.debug("[verifyKey] Formatting or reading in progress, stopping detection.");
            return false; // Exit the loop if formatting or reading is in progress
        }

        logger.debug("[verifyKey] Searching for tag.....");
        for (const searchFunction of searchFunctions) {
            if (!isAppActive()) {
                logger.debug("[verifyKey] App not active, stopping detection");
                return false;
            }

            const result = await searchFunction();
            if (result.Result) {
                if (correctKeys[result.UID] || wrongKeys[result.UID]) {
                    logger.debug("[verifyKey] Tag already in correctKeys or wrongKeys, continuing loop", result);
                    continue;
                }
                if (!detectedKeys[result.UID]) {
                    let tagType = result.TagType || "Unknown";
                    if (tagType === "MIFARE") {
                        const sakValue = await getSAK(result.UID);
                        tagType = identifyMifareType(sakValue, "verifyKey");
                    }
                    detectedKeys[result.UID] = {
                        count: 1,
                        data: result,
                        TagType: tagType,
                    };
                    logger.info("[verifyKey] New tag found", result);

                    await setUIDInTransponderConfig(transponderConfig, result);

                    // Update session info with detected tag
                    updateSessionInfo("tag", {
                        type: detectedKeys[result.UID].TagType.toLowerCase(),
                        uid: result.UID,
                        status: "Erkannt",
                    });
                } else {
                    detectedKeys[result.UID].count += 1;
                    if (detectedKeys[result.UID].count === 2) {
                        logger.info("[verifyKey] UID detected twice, stopping loop", result);
                        return detectedKeys;
                    }
                }
            } else {
                logger.debug("[verifyKey] Tag not found or already detected", result);
            }
        }
    }

    logger.debug("[verifyKey] Detection loop ended due to app state change");
    return false;
}

async function setUIDInTransponderConfig(transponderConfig, result) {
    let tagType = result.TagType;
    if (tagType === "MIFARE") {
        const sakValue = await getSAK(result.UID);
        tagType = identifyMifareType(sakValue, "verifyKey");
    }
    switch (tagType) {
        case "HITAG1S":
            if (transponderConfig.tags.hitag) {
                transponderConfig.tags.hitag.uid = result.UID;
            }
            break;
        case "MIFARE_CLASSIC":
            if (transponderConfig.tags.mifareClassic) {
                transponderConfig.tags.mifareClassic.uid = result.UID;
            }
            break;
        case "MIFARE_DESFIRE":
            if (transponderConfig.tags.mifareDesfire) {
                transponderConfig.tags.mifareDesfire.uid = result.UID;
            }
            break;
        case "DEISTER":
            if (transponderConfig.tags.deister) {
                transponderConfig.tags.deister.uid = result.UID;
            }
            break;
        case "EM":
            if (transponderConfig.tags.em) {
                transponderConfig.tags.em.uid = result.UID;
            }
            break;
    }

    logger.debug("[verifyKey] transponderConfig:", JSON.stringify(transponderConfig, null, 2));
}

async function requiredKeySet(transponderConfig) {
    logger.debug("[verifyKey] Checking required key set...");
    updateSessionInfo("status", "Erforderlicher Schlüsselsatz wird überprüft");

    const requiredKeys = transponderConfig.getRequiredKeys();
    const requiredKeySet = new Set(
        requiredKeys
            .map((key) => {
                switch (key) {
                    case "hitag":
                        return "HITAG1S";
                    case "mifareClassic":
                        return "MIFARE_CLASSIC";
                    case "mifareDesfire":
                        return "MIFARE_DESFIRE";
                    case "deister":
                        return "DEISTER";
                    case "em":
                        return "EM";
                    case "legic":
                        return null; // Exclude LEGIC from the required keys set
                    default:
                        return key;
                }
            })
            .filter((key) => key !== null)
    );

    const detectedKeySet = new Set(Object.values(detectedKeys).map((key) => key.TagType));

    logger.debug("[verifyKey] Required keys:", requiredKeySet);
    logger.debug("[verifyKey] Detected keys:", detectedKeySet);

    if (requiredKeySet.size === detectedKeySet.size && [...requiredKeySet].every((key) => detectedKeySet.has(key))) {
        logger.info("[verifyKey] All required keys have been detected.");
        updateSessionInfo("status", "Alle erforderlichen Schlüssel erkannt");
        Object.assign(correctKeys, detectedKeys);
        detectedKeys = {};
        return true;
    } else {
        const detectedKeyTypes = [...detectedKeySet].join(", ");
        updateSessionInfo("action", `Falscher Schlüssel erkannt: ${detectedKeyTypes}`);
        updateSessionInfo("action", `Benötigte Technik: ${[...requiredKeySet].join(", ")}`);
        logger.warn("[verifyKey] Required keys not fully detected. Restarting process...");
        Object.assign(wrongKeys, detectedKeys);
        detectedKeys = {};
        updateSessionInfo("clearTags");
        return false;
    }
}

async function validateNumber(transponderConfig, numberHandler) {
    numberHandler.readFromInput();
    const currentNumber = numberHandler.getCurrentNumber();
    let isValidNumber = await numberHandler.validateNumber(currentNumber);

    while (!isValidNumber) {
        logger.warn("[verifyKey] Invalid number detected. Prompting for a new number.");
        updateSessionInfo("action", "Ungültige Nummer erkannt. Bitte geben Sie eine gültige Nummer ein.");
        const userInput = prompt("Bitte geben Sie eine gültige Nummer ein:");

        if (userInput === null) {
            logger.warn("[verifyKey] User cancelled input. Retrying...");
            continue;
        }

        const inputNumber = parseInt(userInput, 10);
        isValidNumber = await numberHandler.validateNumber(inputNumber);

        if (isValidNumber) {
            transponderConfig.setNumber(inputNumber);
            logger.debug("[verifyKey] Number set in TransponderConfig:", inputNumber);
            updateSessionInfo("number", inputNumber);
            numberHandler.writeToInput();
            return true;
        }
    }

    transponderConfig.setNumber(currentNumber);
    logger.debug("[verifyKey] Number set in TransponderConfig:", currentNumber);
    updateSessionInfo("number", currentNumber);
    numberHandler.writeToInput();
    return true;
}

export function clearKeys(uid) {
    delete wrongKeys[uid];
    delete correctKeys[uid];
}
