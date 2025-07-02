import { updateSessionInfo } from "../ui.js";
import { parseBytes } from "../handler/protocolHandler.js";
import * as api from "../api.js";
import { hitag1S_ReadBlock, hitag1S_WriteBlock } from "../handler/protocolHandler.js";
import logger from "../logger.js";

export async function hitagScript(transponderConfig) {
    logger.debug("Starting hitagScript function");
    updateSessionInfo("action", "Starte Hitag-Operationen");

    try {
        const writeResponse = await writeHitag(transponderConfig);
        logger.debug("Write Hitag Result", writeResponse);

        if (writeResponse) {
            logger.info("Hitag ID successfully written and verified");
            updateSessionInfo("tag", {
                type: "HITAG",
                uid: transponderConfig.tags.hitag.uid,
                status: "Schreiben erfolgreich",
            });
            return true;
        } else {
            logger.warn("Failed to write or verify Hitag ID");
            updateSessionInfo("tag", {
                type: "HITAG",
                uid: transponderConfig.tags.hitag.uid,
                status: "Schreiben fehlgeschlagen",
            });
            updateSessionInfo("action", "Fehler beim Schreiben oder Verifizieren der Hitag ID");
            return false;
        }
    } catch (error) {
        logger.error("Error in hitagScript:", error);
        updateSessionInfo("tag", {
            type: "HITAG",
            uid: transponderConfig.tags.hitag.uid,
            status: "Fehler",
        });
        updateSessionInfo("action", "Fehler während der Hitag-Operationen");
        return false;
    }
}

export async function readHitag(transponderConfig) {
    logger.debug("Starting readHitag function");
    updateSessionInfo("action", "Lese Hitag");

    const response = await hitag1S_ReadBlock(0x1c);
    if (!response.Result) {
        logger.error("Read operation failed");
        updateSessionInfo("action", "Hitag-Lesevorgang fehlgeschlagen");
        return null;
    }

    const currentTagUID = parseBytes(0, 4, transponderConfig.tags.hitag.uid);
    if (typeof currentTagUID == "undefined") {
        logger.error("currentTagUID is undefined");
        updateSessionInfo("action", "Fehler: Daten können ohne UID nicht entschlüsselt werden");
        return null;
    }

    let dataArray = new Uint8Array(response.Data.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
    let slicedDataArray = dataArray.slice(1, 17);

    let hitagID = await decodeHitagID(currentTagUID, slicedDataArray);
    if (hitagID !== -1) {
        let hitagIdStr = "";
        for (const val of hitagID) {
            hitagIdStr += val.toString(16).padStart(2, "0");
        }
        updateSessionInfo("action", `Hitag ID erfolgreich gelesen: ${hitagIdStr}`);
        return hitagIdStr;
    } else {
        logger.error("Failed to decode Hitag ID");
        updateSessionInfo("action", "Fehler beim Dekodieren der Hitag ID");
        return null;
    }
}

async function writeHitag(transponderConfig) {
    logger.debug("Starting writeHitag function");
    updateSessionInfo("action", "Schreibe auf Hitag");

    const currentTagUID = parseBytes(0, 4, transponderConfig.tags.hitag.uid);
    if (typeof currentTagUID === "undefined") {
        logger.error("OutputHitag", "Data cannot be encrypted without UID");
        updateSessionInfo("action", "Fehler: Daten können ohne UID nicht verschlüsselt werden");
        return false;
    }

    const inputNummer = transponderConfig.tags.hitag.number;
    const dataLen = Math.ceil(Math.log2(inputNummer + 1) / 8);
    if (dataLen === 0) {
        logger.warn("No data provided, exiting writeHitag function");
        updateSessionInfo("action", "Keine Daten bereitgestellt, verlasse writeHitag-Funktion");
        return false;
    } else if (dataLen > 3) {
        logger.warn("Too much data provided, exiting writeHitag function");
        updateSessionInfo("action", "Zu viele Daten bereitgestellt, verlasse writeHitag-Funktion");
        return false;
    }

    let number = parseBytes(0, dataLen, String(inputNummer));
    let data = encodeHitagID(currentTagUID, number, dataLen * 8);
    if (data === -1) {
        logger.error("Failed to encode HitagID");
        updateSessionInfo("action", "Fehler beim Kodieren der HitagID");
        return false;
    }

    const response = await hitag1S_WriteBlock(0x1c, data);
    if (response.Result) {
        const bytesWritten = response.BytesWritten;
        logger.debug(`Write (${bytesWritten} Bytes) successful`);
        updateSessionInfo("action", `Erfolgreich ${bytesWritten} Bytes auf Hitag geschrieben`);

        // Validate the write operation by reading back the data
        const readResult = await readHitag(transponderConfig);
        if (readResult === transponderConfig.tags.hitag.number.toString(10).padStart(6, "0")) {
            updateSessionInfo("tag", {
                type: "HITAG",
                uid: transponderConfig.tags.hitag.uid,
                status: "Schreiben verifiziert",
            });
            updateSessionInfo(
                "action",
                `HitagID ${transponderConfig.tags.hitag.number} erfolgreich geschrieben und auf Schlüssel verifiziert`
            );
            return true;
        } else {
            logger.error("Write verification failed");
            updateSessionInfo("tag", {
                type: "HITAG",
                uid: transponderConfig.tags.hitag.uid,
                status: "Schreibverifizierung fehlgeschlagen",
            });
            updateSessionInfo("action", "Schreibvorgang fehlgeschlagen");
            return false;
        }
    } else {
        logger.error("Write unsuccessful");
        updateSessionInfo("tag", {
            type: "HITAG",
            uid: transponderConfig.tags.hitag.uid,
            status: "Schreiben fehlgeschlagen",
        });
        updateSessionInfo("action", "Schreiben fehlgeschlagen");
        return false;
    }
}

function encodeHitagID(uid, hitagID, idBitCount) {
    if (typeof uid == "undefined") {
        logger.error("UID is undefined. Exiting encodeHitagID function with error.");
        updateSessionInfo("action", "Fehler: Daten können ohne UID nicht verschlüsselt werden");
        return -1;
    }

    if (idBitCount > 96) {
        logger.error("ID Bit Count exceeds 96 bits. Exiting encodeHitagID function with error.");
        updateSessionInfo("action", "Fehler: ID-Bit-Anzahl überschreitet 96 Bits");
        return -1;
    }

    const secretBytes = new Uint8Array(4);
    const byteSum = new Uint8Array(1);
    const dataBlock = new Uint8Array(16);

    secretBytes[0] = uid[0] << 1;
    secretBytes[1] = uid[1] >> 4;
    secretBytes[2] = uid[2] << 2;
    secretBytes[3] = uid[3] >> 3;

    dataBlock[0] = idBitCount;
    let idLength = Math.ceil(idBitCount / 8);

    for (let i = 1; i < idLength + 1; i++) {
        dataBlock[i] = hitagID[i - 1];
    }

    for (let i = 0; i < 16; i++) {
        byteSum[0] += dataBlock[i];
    }
    dataBlock[15] = byteSum[0];

    for (let i = 0; i < 16; i++) {
        dataBlock[i] ^= secretBytes[i % 4];
    }

    return dataBlock;
}

function decodeHitagID(uid, dataBlock) {
    const secretBytes = new Uint8Array(4);
    const byteSum = new Uint8Array(1);

    if (typeof uid == "undefined") {
        logger.error("UID is undefined. Exiting decodeHitagID function with error.");
        updateSessionInfo("action", "Fehler: UID ist nicht definiert");
        return -1;
    }

    secretBytes[0] = uid[0] << 1;
    secretBytes[1] = uid[1] >> 4;
    secretBytes[2] = uid[2] << 2;
    secretBytes[3] = uid[3] >> 3;

    for (let i = 0; i < 16; i++) {
        dataBlock[i] ^= secretBytes[i % 4];
        byteSum[0] += dataBlock[i];
    }
    byteSum[0] -= dataBlock[15];

    if (byteSum[0] != dataBlock[15]) {
        logger.error("Checksum validation failed. ByteSum:", byteSum[0], "Checksum:", dataBlock[15]);
        updateSessionInfo("action", "Prüfsummenvalidierung fehlgeschlagen");
        return -1;
    }

    let idLength = dataBlock[0] / 8;
    if (idLength > 12) {
        logger.error("ID Length exceeds 12 bytes. Exiting decodeHitagID function with error.");
        updateSessionInfo("action", "Fehler: ID-Länge überschreitet 12 Bytes");
        return -1;
    }

    let idBytes = new Uint8Array(idLength);
    for (let i = 0; i < idLength; i++) {
        idBytes[i] = dataBlock[i + 1];
    }

    return idBytes;
}
