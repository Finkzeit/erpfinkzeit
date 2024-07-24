import * as api from "./api.js";
import logger from "./logger.js";
import { getSAK } from "./handler/protocolHandler.js";
import { updateSessionInfo } from "./ui.js";
import { getIsFormatting, addFormattingChangeListener, removeFormattingChangeListener } from "./state.js";
import { inSession } from "./app.js";

let detectedKeys = {};
let wrongKeys = {};
let correctKeys = {};
let verifyKeyId = 0;

function checkBit(value, bitNumber) {
    return (value & (1 << bitNumber)) !== 0;
}

function identifyMifare(sakValue) {
    logger.debug(`[verifyKey] Identifying MIFARE type for SAK value: ${sakValue}`);
    if (checkBit(sakValue, 1)) return "ERROR";
    if (checkBit(sakValue, 3)) return "MIFARE_CLASSIC";
    return "MIFARE_DESFIRE";
}

export async function verifyKey(transponderConfig, numberHandler) {
    verifyKeyId++;
    logger.debug("[verifyKey] Starting key verification...");
    updateSessionInfo("status", "Schlüssel wird überprüft");
    let tagDetected = false;

    while (!tagDetected && inSession()) {
        console.log("verifyKeyId: ", verifyKeyId);
        if (getIsFormatting()) {
            logger.debug("[verifyKey] Formatting in progress, stopping detection.");
            await new Promise((resolve) => {
                const handleFormattingChange = (value) => {
                    if (!value) {
                        removeFormattingChangeListener(handleFormattingChange);
                        resolve();
                    }
                };
                addFormattingChangeListener(handleFormattingChange);
            });
        }

        if (getIsFormatting()) continue; // Skip detection if formatting is still in progress

        logger.debug("[verifyKey] Detecting tag....");
        console.log("config new1", transponderConfig);

        tagDetected = await detectFirstTag(transponderConfig);
        console.log("config new2", transponderConfig);

        logger.debug("[verifyKey] Tag detected 1:", tagDetected);
        if (tagDetected) {
            console.log("config new3", transponderConfig);

            await validateNumber(transponderConfig, numberHandler);
            const requiredKeysCorrect = await requiredKeySet(transponderConfig);
            if (requiredKeysCorrect) {
                return true; // Return true if all required keys are correct
            }
            return false;
        }

        if (!inSession()) {
            logger.debug("[verifyKey] Session cancelled, stopping verification");
            return false;
        }
    }
    return tagDetected;
}

export async function detectFirstTag(transponderConfig) {
    logger.debug("[verifyKey] Detecting tag...");
    console.log("config new4", transponderConfig);
    updateSessionInfo("status", "Tag wird erkannt");

    const searchFunctions = [api.hitag1s, api.mifare, api.deister, api.em];

    while (inSession()) {
        console.log("inside detectFistKey verifyKeyId: ", verifyKeyId);
        if (getIsFormatting()) {
            logger.debug("[verifyKey] Formatting in progress, stopping detection.");
            return false; // Exit the loop if formatting is in progress
        }

        logger.debug("[verifyKey] Searching for tag.....");
        for (const searchFunction of searchFunctions) {
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
                        tagType = identifyMifare(sakValue);
                    }
                    detectedKeys[result.UID] = {
                        count: 1,
                        data: result,
                        TagType: tagType,
                    };
                    logger.info("[verifyKey] New tag found", result);

                    console.log("config new5", transponderConfig);

                    await setUIDInTransponderConfig(transponderConfig, result);

                    console.log("config new6", transponderConfig);

                    // Update session info with detected tag
                    updateSessionInfo("tag", {
                        type: detectedKeys[result.UID].TagType.toLowerCase(),
                        uid: result.UID,
                        status: "Erkannt",
                    });
                } else {
                    console.log("config new10", transponderConfig);
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
    return false;
}

async function setUIDInTransponderConfig(transponderConfig, result) {
    console.log("config new7", transponderConfig);

    let tagType = result.TagType;
    if (tagType === "MIFARE") {
        const sakValue = await getSAK(result.UID);
        tagType = identifyMifare(sakValue);
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
    console.log("config new8", transponderConfig);

    logger.debug("[verifyKey] transponderConfig:", JSON.stringify(transponderConfig, null, 2));
}

async function requiredKeySet(transponderConfig) {
    console.log("config new9", transponderConfig);
    console.log("[verifyKey] Checking required key set...");
    console.log(transponderConfig);
    console.log("[verifyKey] Required keys:", transponderConfig.getRequiredKeys());
    console.log("[verifyKey] Detected keys:", detectedKeys);
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
                        return null;
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
    console.log("[verifyKey] Validatingggg number...,", transponderConfig, numberHandler);
    console.log("[verifyKey] Validatinggggg number...,", numberHandler.readFromInput());
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
