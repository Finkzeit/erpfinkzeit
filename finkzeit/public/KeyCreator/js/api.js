import { sendBeep, setTagTypes, searchTag, getVersionString, createSingleTagMask } from "./handler/protocolHandler.js";
import { TAG_TYPES } from "./constants/constants.js";
import { initPortHandler } from "./handler/commandHandler.js";
import logger from "./logger.js";

export async function startKeyCreator() {
    await initPortHandler();
}

async function setAndSearchTag(lfTag, hfTag) {
    await setTagTypes(createSingleTagMask(lfTag), createSingleTagMask(hfTag));
    return await searchTag();
}

export async function hitag1s() {
    logger.debug("setAndSearch HITAG1S");
    return await setAndSearchTag(TAG_TYPES.LF.HITAG1S, TAG_TYPES.HF.NONE);
}

export async function mifare() {
    logger.debug("setAndSearch Mifare Classic");
    return await setAndSearchTag(TAG_TYPES.LF.NONE, TAG_TYPES.HF.MIFARE_CLASSIC);
}

export async function deister() {
    logger.debug("setAndSearch Deister");
    return await setAndSearchTag(TAG_TYPES.LF.DEISTER, TAG_TYPES.HF.NONE);
}

export async function em() {
    logger.debug("setAndSearch EM");
    return await setAndSearchTag(TAG_TYPES.LF.EM4102, TAG_TYPES.HF.NONE);
}

export async function beepOk() {
    logger.debug("trying to run beepOk");
    await sendBeep(20, 2000, 500, 500);
}

export async function getVersion() {
    logger.debug("trying to run getVersion");
    return await getVersionString();
}
