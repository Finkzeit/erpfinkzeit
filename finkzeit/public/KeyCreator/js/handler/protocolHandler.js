import { sendCommand, hex, swap16, swap32 } from "./commandHandler.js";
import { SP_CMD, TAG_TYPES, DESF } from "../constants/constants.js";
import * as api from "./api.js";
import logger from "../core/logger.js";

// Utility functions
export function parseByte(index, recvStr) {
    return parseInt(recvStr.slice(index, index + 2), 16);
}

export function parseBytes(index, numBytes, recvStr) {
    logger.debug("parseBytes input:", { index, numBytes, recvStr });
    const res = new Uint8Array(numBytes);
    const lastIndex = index + 2 * numBytes - 1;

    if (lastIndex < recvStr.length) {
        for (let i = index; i <= lastIndex; i += 2) {
            res[(i - index) / 2] = parseByte(i, recvStr);
        }
        logger.debug(
            "parseBytes result:",
            Array.from(res)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(" ")
        );
        return res;
    }
    logger.error("parseByte Error: index + number of Bytes * 2 is out of bounds");
}

export function createTagMask(tagArr) {
    let tagMask = 0;

    for (const tag of tagArr) {
        tagMask |= 1 << (tag & 0x1f);
    }

    return tagMask;
}

export function createSingleTagMask(tag) {
    let tagMask = 0;

    if (tag !== TAG_TYPES.NONE) {
        tagMask = 1 << (tag & 0x1f);
    }

    return tagMask;
}

// Command functions
function parseVersion(recvStr) {
    const len = parseByte(0, recvStr); // Adjusted to read the length from the correct position
    if (len * 2 > recvStr.length) {
        // Multiply by 2 because each byte is represented by 2 hex characters
        return `Error: VersionArrayLength (${recvStr.length}) < ParsedLengthParameter (${len * 2})`;
    }

    return String.fromCharCode.apply(String, parseBytes(2, len, recvStr)); // Adjusted to read the correct number of bytes
}

export async function getVersionString() {
    const versStr = await sendCommand(SP_CMD.GET_VERSION_STRING, "FF");
    return parseVersion(versStr);
}

export async function sendBeep(volume, frequency, onTime, offTime) {
    const paramStr = `${hex(volume, 2)}${hex(swap16(frequency), 4)}${hex(swap16(onTime), 4)}${hex(swap16(offTime), 4)}`;
    await sendCommand(SP_CMD.BEEP, paramStr);
}

export async function setTagTypes(tagTypesLF, tagTypesHF) {
    const paramStr = `${hex(swap32(tagTypesLF), 8)}${hex(swap32(tagTypesHF), 8)}`;
    logger.debug("Set tag types command sent parameter:", paramStr);
    await sendCommand(SP_CMD.SET_TAG_TYPES, paramStr);
    logger.debug("Set tag types command sent");
}

export async function searchTag() {
    try {
        logger.debug("Searching for tag");
        const response = await sendCommand(SP_CMD.SEARCH_TAG, "10");

        const recvStr = String(response);

        if (recvStr.slice(0, 2) === "00") {
            logger.info("No tag found");
            return { Result: false, TagType: null, IDBitCount: 0, UID: null };
        }

        const result = recvStr.slice(0, 2) === "01";

        const tagTypeByte = parseByte(2, recvStr);
        const idBitCount = parseByte(4, recvStr);
        const uidByteCount = Math.floor(idBitCount / 8);
        const uid = recvStr.slice(8, 8 + uidByteCount * 2);

        let tagTypeStr;
        if (tagTypeByte === 128) {
            const index = Object.values(TAG_TYPES.HF).findIndex((element) => element === tagTypeByte);
            tagTypeStr = Object.keys(TAG_TYPES.HF)[index];
        } else {
            const index = Object.values(TAG_TYPES.LF).findIndex((element) => element === tagTypeByte);
            tagTypeStr = Object.keys(TAG_TYPES.LF)[index];
        }

        const resultObj = {
            Result: result,
            TagType: tagTypeStr,
            IDBitCount: idBitCount,
            UID: uid,
        };
        logger.debug("Returning result object:", resultObj);
        return resultObj;
    } catch (error) {
        logger.error("Error searching for tag:", error);
        return { Result: false, TagType: null, IDBitCount: 0, UID: null };
    }
}

export async function getSAK() {
    const response = await sendCommand(SP_CMD.GET_SAK, "");
    if (response.slice(0, 2) !== "01") {
        return ERROR;
    }

    return parseInt(response.slice(2), 16);
}

export function ledInit(leds) {
    sendCommand(SP_CMD.LED_INIT, leds);
}

export function ledOn(leds) {
    sendCommand(SP_CMD.LED_ON, leds);
}

export function ledOff(leds) {
    sendCommand(SP_CMD.LED_OFF, leds);
}

export function ledBlink(leds, timeOn, timeOff) {
    sendCommand(SP_CMD.LED_BLINK, leds + hex(swap16(timeOn), 4) + hex(swap16(timeOff), 4));
}

export async function hitag1S_ReadBlock(blockAddress) {
    const response = await sendCommand(SP_CMD.HITAG_READ_BLOCK, hex(blockAddress, 2));

    logger.debug("hitag1S_ReadBlock raw response:", response);
    logger.debug("hitag1S_ReadBlock response length:", response.length);

    if (!response || !response.length > 2) {
        logger.error("Invalid response received:", response);
        return { Result: false, Data: null };
    }

    const result = response.slice(0, 2) === "01";
    const data = result ? response.slice(2) : null;

    logger.debug("hitag1S_ReadBlock result:", result);
    logger.debug("hitag1S_ReadBlock data:", data);

    return {
        Result: result,
        Data: data,
    };
}

export async function hitag1S_WriteBlock(blockAddress, data) {
    // Ensure BlockAddress is a two-digit hexadecimal string
    const blockAddressHex = hex(blockAddress, 2);

    // Convert Uint8Array data to a hexadecimal string
    const dataHex = Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");

    // Construct the command string
    const commandStr = `${blockAddressHex}${dataHex}`;
    const response = await sendCommand(SP_CMD.HITAG_WRITE_BLOCK, commandStr);

    if (!response || response.length < 4) {
        logger.error("Invalid response received:", response);
        return { Result: false, BytesWritten: 0 };
    }

    const result = response.slice(0, 2) === "01";
    const bytesWritten = result ? parseInt(response.slice(2, 4), 16) : 0;

    return {
        Result: result,
        BytesWritten: bytesWritten,
    };
}

export async function MifareClassic_Login(key, keyType, sector) {
    // Convert key to hexadecimal and pad to 12 characters (6 bytes)
    const keyHex = hex(parseInt(key), 12);

    // Ensure sector is a two-digit hexadecimal string
    const sectorHex = hex(parseInt(sector), 2);

    // keyType should already be "00", but we'll ensure it's a string
    const keyTypeHex = keyType.toString();

    logger.debug("MifareClassic_Login command sent with parameters:", keyHex, keyTypeHex, sectorHex);
    await api.mifare();
    const paramStr = `${keyHex}${keyTypeHex}${sectorHex}`;
    const response = await sendCommand(SP_CMD.MIFARE_CLASSIC_LOGIN, paramStr);
    return response === "01";
}

export async function MifareClassic_ReadBlock(block) {
    return await sendCommand(SP_CMD.MIFARE_CLASSIC_READ, hex(block, 2));
}

export async function MifareClassic_WriteBlock(block, data) {
    // Convert block to hexadecimal and pad to 2 characters
    const blockHex = hex(block, 2);
    logger.debug("Block (hex):", blockHex);

    logger.debug("MifareClassic_WriteBlock command sent with parameters:", "Block:", blockHex, "Data:", data);

    const paramStr = `${blockHex}${data}`;
    const response = await sendCommand(SP_CMD.MIFARE_CLASSIC_WRITE, paramStr);
    return response === "01";
}

export async function DESFire_CreateApplication(
    cryptoEnv,
    AID,
    changeKeyAccessRights,
    configurationChangeable,
    freeCreateDelete,
    freeDirectoryList,
    allowChangeMasterKey,
    numberOfKeys,
    keyType
) {
    // Combine flags into a single byte
    const flags =
        ((changeKeyAccessRights & 0x0f) << 4) |
        ((configurationChangeable & 0x01) << 3) |
        ((freeCreateDelete & 0x01) << 2) |
        ((freeDirectoryList & 0x01) << 1) |
        (allowChangeMasterKey & 0x01);

    // Construct the parameter string
    const paramStr = `${hex(cryptoEnv, 2)}${hex(swap32(AID), 8)}${hex(flags, 2)}${hex(swap32(numberOfKeys), 8)}${hex(swap32(keyType), 8)}`;

    logger.debug("DESFire_CreateApplication command sent with parameters:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_CREATE_APP, paramStr);
    if (response === "01") {
        logger.info("Application created with id", AID);
    } else {
        logger.warn("Application creation failed or application already exists");
    }
    return response === "01";
}

export async function DESFire_SelectApplication(cryptoEnv, AID) {
    // Construct the parameter string
    const paramStr = `${hex(cryptoEnv, 2)}${hex(swap32(AID), 8)}`;

    logger.debug("DESFire_SelectApplication command sent with parameters:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_SELECT_APP, paramStr);
    return response === "01";
}

export async function DESFire_Authenticate(cryptoEnv, keyNoTag, key, keyType, mode) {
    logger.debug("kryptenv", cryptoEnv, "keynotag", keyNoTag, "key", key, "keytype", keyType, "mode", mode);

    let keyLen;

    if (keyType === DESF.KEYTYPE_3DES) {
        keyLen = DESF.KEYLEN_3DES;
    } else if (keyType === DESF.KEYTYPE_AES) {
        keyLen = DESF.KEYLEN_AES;
    } else if (keyType === DESF.KEYTYPE_3K3DES) {
        keyLen = DESF.KEYLEN_3K3DES;
    } else {
        throw new Error("Invalid key type");
    }
    // Convert parameters to hexadecimal strings
    const cryptoEnvHex = hex(cryptoEnv, 2);
    const keyNoTagHex = hex(keyNoTag, 2);
    const keyHex = hex(keyLen, 2) + key.toString(16).padEnd(keyLen * 2, "0"); // Ensure key is 32 characters (16 bytes)
    const keyTypeHex = hex(keyType, 2);
    const modeHex = hex(mode, 2);

    // Construct the parameter string
    logger.debug("kryptenv", cryptoEnvHex, "keynotag", keyNoTagHex, "key", keyHex, "keytype", keyTypeHex, "mode", modeHex);
    const paramStr = `${cryptoEnvHex}${keyNoTagHex}${keyHex}${keyTypeHex}${modeHex}`;

    logger.debug("DESFire_Authenticate command sent with parameters:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_AUTHENTICATE, paramStr);
    return response === "01";
}

export async function DESFire_GetKeySettings(cryptoEnv) {
    const cryptoEnvHex = hex(cryptoEnv, 2);
    const paramStr = cryptoEnvHex;

    logger.debug("DESFire_GetKeySettings command sent with parameter:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_GET_KEY_SETTINGS, paramStr);

    if (response.length < 2 || response.slice(0, 2) !== "01") {
        return { success: false };
    }

    const keySettingsByte = parseByte(2, response);
    const numberOfKeys = swap32(parseInt(response.slice(4, 12), 16));
    const keyType = swap32(parseInt(response.slice(12, 20), 16));

    return {
        success: true,
        keySettings: {
            raw: keySettingsByte,
            allowChangeMasterKey: (keySettingsByte & 0x01) !== 0,
            freeDirectoryList: (keySettingsByte & 0x02) !== 0,
            freeCreateDelete: (keySettingsByte & 0x04) !== 0,
            configurationChangeable: (keySettingsByte & 0x08) !== 0,
            changeKeyAccessRights: (keySettingsByte & 0xf0) >> 4,
        },
        numberOfKeys,
        keyType,
    };
}

export async function DESFire_ReadData(cryptoEnv, fileNo, offset, length, commSet) {
    const paramStr = `${hex(cryptoEnv, 2)}${hex(fileNo, 2)}${hex(swap16(offset), 4)}${hex(length, 2)}${hex(commSet, 2)}`;
    const response = await sendCommand(SP_CMD.DESFIRE_READ_DATA, paramStr);

    if (response.length < 2) {
        throw new Error("Invalid response length");
    }

    const result = response.slice(0, 2) === "01";
    if (!result) {
        return { success: false, data: null };
    }

    let data = response.slice(4);

    data = swap32(parseInt(data, 16));

    return { success: true, data };
}

export async function DESFire_WriteData(cryptoEnv, fileNo, offset, data, commSet) {
    // Construct the parameter string
    const paramStr = `${hex(cryptoEnv, 2)}${hex(fileNo, 2)}${hex(swap16(offset), 4)}${hex(0x04, 2)}${hex(swap32(data), 8)}${hex(
        commSet,
        2
    )}`;

    logger.debug("DESFire_WriteData command sent with parameters:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_WRITE_DATA, paramStr);
    return response === "01";
}

export async function DESFire_CreateDataFile(cryptoEnv, fileNo, fileType, commSet, accessRights, fileSize) {
    const paramStr = `${hex(cryptoEnv, 2)}${hex(fileNo, 2)}${hex(fileType, 2)}${hex(commSet, 2)}${hex(swap16(accessRights), 4)}${hex(
        swap32(fileSize),
        8
    )}${hex(0, 24)}`;
    logger.debug("DESFire_CreateDataFile command sent with parameters:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_CREATE_DATA_FILE, paramStr);
    return response === "01";
}

export async function DESFire_ChangeKeySettings(
    cryptoEnv,
    changeKeyAccessRights,
    configurationChangeable,
    freeCreateDelete,
    freeDirectoryList,
    allowChangeMasterKey,
    numberOfKeys,
    keyType
) {
    // Combine flags into a single byte
    const flags =
        ((changeKeyAccessRights & 0x0f) << 4) |
        ((configurationChangeable & 0x01) << 3) |
        ((freeCreateDelete & 0x01) << 2) |
        ((freeDirectoryList & 0x01) << 1) |
        (allowChangeMasterKey & 0x01);

    logger.debug(
        `cmd2: cryptoEnv: ${hex(cryptoEnv, 2)} flags: ${hex(flags, 2)} numberOfKeys: ${hex(swap32(numberOfKeys), 8)} keyType: ${hex(
            swap32(keyType),
            8
        )}`
    );
    const paramStr = `${hex(cryptoEnv, 2)}${hex(flags, 2)}${hex(swap32(numberOfKeys), 8)}${hex(swap32(keyType), 8)}`;

    logger.debug("DESFire_ChangeKeySettings command sent with parameters:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_CHANGE_KEY_SETTINGS, paramStr);
    logger.debug("DESFire_ChangeKeySettings response:", response);
    return response === "01";
}

export async function DESFire_ChangeKey(
    cryptoEnv,
    keyNo,
    oldKey,
    newKey,
    keyVersion,
    changeKeyAccessRights,
    configurationChangeable,
    freeCreateDelete,
    freeDirectoryList,
    allowChangeMasterKey,
    numberOfKeys,
    keyType
) {
    // Determine key length based on key type
    let keyLen;
    if (keyType === DESF.KEYTYPE_3DES) {
        keyLen = DESF.KEYLEN_3DES;
    } else if (keyType === DESF.KEYTYPE_AES) {
        keyLen = DESF.KEYLEN_AES;
    } else if (keyType === DESF.KEYTYPE_3K3DES) {
        keyLen = DESF.KEYLEN_3K3DES;
    } else {
        throw new Error("Invalid key type");
    }

    // Function to format key
    const formatKey = (key) => {
        if (typeof key === "string") {
            // If key is a string, assume it's already in hex format
            if (key.length > keyLen * 2) {
                throw new Error(`Key is too long. Expected ${keyLen * 2} characters, got ${key.length}`);
            }
            return key.padEnd(keyLen * 2, "0");
        } else if (typeof key === "number") {
            // If key is a number, convert to hex string
            const hexKey = key.toString(16).padStart(keyLen * 2, "0");
            if (hexKey.length > keyLen * 2) {
                throw new Error(`Key is too long. Expected ${keyLen * 2} characters, got ${hexKey.length}`);
            }
            return hexKey;
        } else {
            throw new Error("Invalid key format. Expected string or number.");
        }
    };

    // Format keys and include the key length byte
    const oldKeyHex = hex(keyLen, 2) + formatKey(oldKey);
    const newKeyHex = hex(keyLen, 2) + formatKey(newKey);

    // Combine flags into a single byte
    const flags =
        ((changeKeyAccessRights & 0x0f) << 4) |
        ((configurationChangeable & 0x01) << 3) |
        ((freeCreateDelete & 0x01) << 2) |
        ((freeDirectoryList & 0x01) << 1) |
        (allowChangeMasterKey & 0x01);

    // Construct the parameter string
    const paramStr = `${hex(cryptoEnv, 2)}${hex(keyNo, 2)}${oldKeyHex}${newKeyHex}${hex(keyVersion, 2)}${hex(flags, 2)}${hex(
        swap32(numberOfKeys),
        8
    )}${hex(swap32(keyType), 8)}`;

    logger.debug("DESFire_ChangeKey command sent with parameters:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_CHANGE_KEY, paramStr);
    return response === "01";
}

export async function DESFire_FormatTag(cryptoEnv) {
    const paramStr = hex(cryptoEnv, 2);
    logger.debug("DESFire_FormatTag command sent with parameter:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_FORMAT_TAG, paramStr);
    return response === "01";
}

//not needed functions maybe remove later
/*
export async function DESFire_GetApplicationIDs(cryptoEnv, MaxAIDCnt) {
    const paramStr = `${hex(cryptoEnv, 2)}${hex(MaxAIDCnt, 2)}`;
    const response = await sendCommand(SP_CMD.DESFIRE_GET_APP_IDS, paramStr);

    if (response.length < 2) {
        throw new Error("Invalid response length");
    }

    const result = response.slice(0, 2) === "01";
    if (!result) {
        return { success: false, AIDs: [] };
    }

    const AIDs = [];
    for (let i = 2; i < response.length; i += 8) {
        if (i + 8 <= response.length) {
            const AID = swap32(parseInt(response.slice(i, i + 8), 16));
            AIDs.push(AID);
        }
    }

    return { success: true, AIDs };
}

export async function DESFire_DeleteApplication(cryptoEnv, AID) {
    // Construct the parameter string
    const paramStr = `${hex(cryptoEnv, 2)}${hex(swap32(AID), 8)}`;

    logger.debug("DESFire_DeleteApplication command sent with parameters:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_DELETE_APP, paramStr);
    return response === "01";
}

export async function DESFire_GetFileIDs(cryptoEnv, maxFileIDCount) {
    const paramStr = `${hex(cryptoEnv, 2)}${hex(maxFileIDCount, 2)}`;
    const response = await sendCommand(SP_CMD.DESFIRE_GET_FILE_IDS, paramStr);

    if (response.length < 2) {
        throw new Error("Invalid response length");
    }

    const result = response.slice(0, 2) === "01";
    if (!result) {
        return { success: false, fileIDs: [] };
    }

    const fileIDs = [];
    for (let i = 2; i < response.length; i += 2) {
        if (i + 2 <= response.length) {
            const fileID = parseInt(response.slice(i, i + 2), 16);
            fileIDs.push(fileID);
        }
    }

    return { success: true, fileIDs };
}

export async function DESFire_GetFileSettings(cryptoEnv, fileNo) {
    const paramStr = `${hex(cryptoEnv, 2)}${hex(fileNo, 2)}`;
    const response = await sendCommand(SP_CMD.DESFIRE_GET_FILE_SETTINGS, paramStr);

    if (response.length < 2) {
        throw new Error("Invalid response length");
    }

    const result = response.slice(0, 2) === "01";
    if (!result) {
        return { success: false, fileSettings: null };
    }

    if (response.length < 42) {
        // 2 (result) + 40 (20 bytes of file settings)
        throw new Error("Invalid file settings length");
    }

    const fileSettings = response.slice(2, 42);

    return { success: true, fileSettings };
}

export async function DESFire_GetVersion(cryptoEnv) {
    const paramStr = hex(cryptoEnv, 2);
    logger.debug("DESFire_GetVersion command sent with parameter:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_GET_VERSION, paramStr);

    if (response.length < 2) {
        throw new Error("Invalid response length");
    }

    const result = response.slice(0, 2) === "01";
    if (!result) {
        return { success: false, version: null };
    }

    if (response.length < 70) {
        // 2 (result) + 68 (34 bytes of version info)
        throw new Error("Invalid version information length");
    }

    const versionInfo = response.slice(2, 70);

    return { success: true, version: versionInfo };
}

export async function DESFire_DeleteFile(cryptoEnv, fileNo) {
    const paramStr = `${hex(cryptoEnv, 2)}${hex(fileNo, 2)}`;
    logger.debug("DESFire_DeleteFile command sent with parameters:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_DELETE_FILE, paramStr);
    return response === "01";
}

export async function DESFire_GetUID(cryptoEnv, bufferSize) {
    const paramStr = `${hex(cryptoEnv, 2)}${hex(bufferSize, 2)}`;
    logger.debug("DESFire_GetUID command sent with parameters:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_GET_UID, paramStr);

    if (response.length < 2) {
        throw new Error("Invalid response length");
    }

    const result = response.slice(0, 2) === "01";
    if (!result) {
        return { success: false, uid: null };
    }

    const uid = response.slice(2);

    return { success: true, uid };
}

export async function DESFire_ReadRecords(cryptoEnv, fileNo, offset, numberOfRecords, recordSize, commSet) {
    const paramStr = `${hex(cryptoEnv, 2)}${hex(fileNo, 2)}${hex(swap16(offset), 4)}${hex(numberOfRecords, 2)}${hex(recordSize, 2)}${hex(
        commSet,
        2
    )}`;
    logger.debug("DESFire_ReadRecords command sent with parameters:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_READ_RECORDS, paramStr);

    if (response.length < 2) {
        throw new Error("Invalid response length");
    }

    const result = response.slice(0, 2) === "01";
    if (!result) {
        return { success: false, data: null };
    }

    const data = response.slice(2);

    return { success: true, data };
}

export async function DESFire_WriteRecord(cryptoEnv, fileNo, offset, data, commSet) {
    const paramStr = `${hex(cryptoEnv, 2)}${hex(fileNo, 2)}${hex(swap16(offset), 4)}${data}${hex(commSet, 2)}`;
    logger.debug("DESFire_WriteRecord command sent with parameters:", paramStr);

    const response = await sendCommand(SP_CMD.DESFIRE_WRITE_RECORD, paramStr);
    return response === "01";
}

*/
