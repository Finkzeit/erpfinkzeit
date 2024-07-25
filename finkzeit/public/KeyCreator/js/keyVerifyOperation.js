import * as api from "./api.js";
import logger from "./logger.js";
import { getSAK } from "./handler/protocolHandler.js";
import { updateDialogMessage } from "./keyOperation.js";

let detectedKeys = {};
let wrongKeys = {};
let correctKeys = {};

function checkBit(value, bitNumber) {
    return (value & (1 << bitNumber)) !== 0;
}

function identifyMifare(sakValue) {
    logger.debug(`[FormatVerify] Identifying MIFARE type for SAK value: ${sakValue}`);
    if (checkBit(sakValue, 1)) return "ERROR";
    if (checkBit(sakValue, 3)) return "MIFARE_CLASSIC";
    return "MIFARE_DESFIRE";
}

export async function verifyKey(shouldContinueSearchFn) {
    logger.debug("[FormatVerify] Starting key verification...");
    updateDialogMessage("Schlüssel wird überprüft");
    detectedKeys = {};
    wrongKeys = {};
    correctKeys = {};

    // Wait for the initial tag
    const initialTag = await waitForInitialTag(shouldContinueSearchFn);
    if (!initialTag) {
        return [];
    }

    // Perform one round of detection for all tag types
    await detectAllTags(shouldContinueSearchFn);

    // Check if we have all required keys
    const requiredKeysCorrect = await requiredKeySet();
    if (requiredKeysCorrect) {
        return Object.entries(correctKeys).map(([uid, keyInfo]) => ({
            type: keyInfo.TagType.toLowerCase(),
            uid: uid,
        }));
    }

    return [];
}

async function waitForInitialTag(shouldContinueSearchFn) {
    logger.debug("[FormatVerify] Waiting for initial tag...");
    updateDialogMessage("Warten auf Tag");

    const searchFunctions = [api.hitag1s, api.mifare, api.deister, api.em];

    while (shouldContinueSearchFn()) {
        for (const searchFunction of searchFunctions) {
            const result = await searchFunction();
            if (result.Result) {
                let tagType = result.TagType || "Unknown";
                if (tagType === "MIFARE") {
                    const sakValue = await getSAK(result.UID);
                    tagType = identifyMifare(sakValue);
                }
                logger.info("[FormatVerify] Initial tag found", result);
                updateDialogMessage(`${tagType} (${result.UID}) erkannt`);
                return { uid: result.UID, tagType };
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay to prevent tight loop
    }
    return null;
}

async function detectAllTags(shouldContinueSearchFn) {
    logger.debug("[FormatVerify] Detecting all tags...");
    updateDialogMessage("Tags werden erkannt");

    const searchFunctions = [api.hitag1s, api.mifare, api.deister, api.em];

    for (const searchFunction of searchFunctions) {
        if (!shouldContinueSearchFn()) {
            break;
        }
        const result = await searchFunction();
        if (result.Result) {
            if (correctKeys[result.UID] || wrongKeys[result.UID]) {
                logger.debug("[FormatVerify] Tag already in correctKeys or wrongKeys, skipping", result);
                continue;
            }
            let tagType = result.TagType || "Unknown";
            if (tagType === "MIFARE") {
                const sakValue = await getSAK(result.UID);
                tagType = identifyMifare(sakValue);
            }
            detectedKeys[result.UID] = {
                data: result,
                TagType: tagType,
            };
            logger.info("[FormatVerify] New tag found", result);

            updateDialogMessage(`${tagType} (${result.UID}) erkannt`);
        }
    }
}

async function requiredKeySet() {
    logger.debug("[FormatVerify] Checking required key set...");
    updateDialogMessage("Erforderlicher Schlüsselsatz wird überprüft");

    const detectedKeySet = new Set(Object.values(detectedKeys).map((key) => key.TagType));

    logger.debug("[FormatVerify] Detected keys:", detectedKeySet);

    if (detectedKeySet.size > 0) {
        logger.info("[FormatVerify] Keys have been detected.");
        updateDialogMessage("Schlüssel erkannt");
        Object.assign(correctKeys, detectedKeys);
        detectedKeys = {};
        return true;
    } else {
        updateDialogMessage("Keine Schlüssel erkannt");
        logger.warn("[FormatVerify] No keys detected. Restarting process...");
        Object.assign(wrongKeys, detectedKeys);
        detectedKeys = {};
        return false;
    }
}
