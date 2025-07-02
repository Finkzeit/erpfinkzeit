import { sendBeep, setTagTypes, searchTag, getVersionString, createSingleTagMask } from "../handler/protocolHandler.js";
import { TAG_TYPES } from "../constants/constants.js";
import { initPortHandler } from "../handler/commandHandler.js";
import logger from "../core/logger.js";
import { isAppActive } from "../core/state.js";

export async function startKeyCreator() {
    await initPortHandler();
}

async function setAndSearchTag(lfTag, hfTag) {
    if (!isAppActive()) {
        logger.debug("App not active, skipping tag search");
        return { Result: false, TagType: null, IDBitCount: 0, UID: null };
    }
    
    await setTagTypes(createSingleTagMask(lfTag), createSingleTagMask(hfTag));
    return await searchTag();
}

export async function hitag1s() {
    if (!isAppActive()) {
        logger.debug("App not active, skipping HITAG1S search");
        return { Result: false, TagType: null, IDBitCount: 0, UID: null };
    }
    
    logger.debug("trying to run HITAG1S");
    logger.debug("setting tag types");
    return await setAndSearchTag(TAG_TYPES.LF.HITAG1S, TAG_TYPES.HF.NONE);
}

export async function mifare() {
    if (!isAppActive()) {
        logger.debug("App not active, skipping Mifare search");
        return { Result: false, TagType: null, IDBitCount: 0, UID: null };
    }
    
    logger.debug("trying to run Mifare Classic");
    logger.debug("setting tag types");
    return await setAndSearchTag(TAG_TYPES.LF.NONE, TAG_TYPES.HF.MIFARE_CLASSIC);
}

export async function deister() {
    if (!isAppActive()) {
        logger.debug("App not active, skipping Deister search");
        return { Result: false, TagType: null, IDBitCount: 0, UID: null };
    }
    
    logger.debug("trying to run Deister");
    logger.debug("setting tag types");
    return await setAndSearchTag(TAG_TYPES.LF.DEISTER, TAG_TYPES.HF.NONE);
}

export async function em() {
    if (!isAppActive()) {
        logger.debug("App not active, skipping EM search");
        return { Result: false, TagType: null, IDBitCount: 0, UID: null };
    }
    
    logger.debug("trying to run EM");
    logger.debug("setting tag types");
    return await setAndSearchTag(TAG_TYPES.LF.EM4102, TAG_TYPES.HF.NONE);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function beepOk() {
    logger.debug("playing beepOk sequence");
    // Three ascending beeps: 1500Hz, 2000Hz, 2500Hz (LOUDER)
    await sendBeep(60, 1500, 100, 50);
    await sleep(120);
    await sendBeep(60, 2000, 100, 50);
    await sleep(120);
    await sendBeep(60, 2500, 100, 50);
}

export async function beepError() {
    logger.debug("playing beepError sequence");
    // Three descending beeps: 2000Hz, 1200Hz, 800Hz (LOUDER)
    await sendBeep(80, 2000, 120, 60);
    await sleep(140);
    await sendBeep(80, 1200, 120, 60);
    await sleep(140);
    await sendBeep(80, 800, 180, 80);
}

export async function getVersion() {
    logger.debug("trying to run getVersion");
    return await getVersionString();
}
