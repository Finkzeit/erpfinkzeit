import { parseByte } from "../handler/protocolHandler.js";
import * as protocolHandler from "../handler/protocolHandler.js";
import { hex, swap32 } from "../handler/commandHandler.js";
import { updateSessionInfo } from "../ui.js";
import logger from "../logger.js";

export async function mifareClassicScript(transponderConfig) {
    logger.debug("Starting mifareClassicScript with config:", transponderConfig);
    updateSessionInfo("action", "Starte MIFARE Classic Operationen");

    try {
        const loginResponse = await loginMifareClassic(transponderConfig);
        if (!loginResponse) {
            logger.warn("mifareClassicScript abgebrochen aufgrund von Anmeldefehler");
            updateSessionInfo("action", "MIFARE Classic Anmeldung fehlgeschlagen");
            return false;
        }

        const writeKeyResponse = await writeLoginKey(transponderConfig);
        if (!writeKeyResponse) {
            logger.warn("mifareClassicScript abgebrochen aufgrund von Fehler beim Schreiben des Anmeldeschlüssels");
            updateSessionInfo("action", "MIFARE Classic Anmeldeschlüssel schreiben fehlgeschlagen");
            return false;
        }

        const writeResponse = await writeMifareClassic(transponderConfig);
        if (!writeResponse) {
            logger.warn("mifareClassicScript abgebrochen aufgrund von Schreibfehler");
            updateSessionInfo("action", "MIFARE Classic schreiben fehlgeschlagen");
            return false;
        }

        const readResponse = await readMifareClassic(transponderConfig);
        logger.debug("readResponse:", readResponse);
        if (readResponse === transponderConfig.tags.mifareClassic.number) {
            updateSessionInfo("action", "MIFARE Classic Verifizierung erfolgreich");
            logger.debug("mifareClassicScript erfolgreich abgeschlossen");
            return true;
        } else {
            updateSessionInfo("action", "MIFARE Classic Verifizierung fehlgeschlagen");
            logger.warn("mifareClassicScript fehlgeschlagen aufgrund von Verifizierungsabweichung");
            return false;
        }
    } catch (error) {
        logger.error("Fehler in mifareClassicScript:", error);
        updateSessionInfo("action", `Fehler während MIFARE Classic Operationen: ${error.message}`);
        return false;
    }
}

export async function loginMifareClassic(transponderConfig) {
    const { sector } = transponderConfig.tags.mifareClassic;
    logger.debug("Starte loginMifareClassic mit Sektor:", sector);
    updateSessionInfo("action", "Versuche MIFARE Classic Anmeldung");

    try {
        const result = await protocolHandler.MifareClassic_Login(281474976710655, "00", sector);

        if (result) {
            logger.debug("Anmeldung erfolgreich");
            updateSessionInfo("action", "MIFARE Classic Anmeldung erfolgreich");
            return result;
        }

        logger.warn("Anmeldung fehlgeschlagen: Kein neuer Schlüssel");
        return null;
    } catch (error) {
        logger.error("Fehler während MIFARE_CLASSIC_LOGIN:", error);
        updateSessionInfo("action", `Fehler während MIFARE Classic Anmeldung: ${error.message}`);
        throw error;
    }
}

export async function writeMifareClassic(transponderConfig) {
    logger.debug("Starte writeMifareClassic mit Konfiguration:", transponderConfig);
    updateSessionInfo("action", "Schreibe zu MIFARE Classic");

    const { skip_bytes, read_bytes, sector, number: data } = transponderConfig.tags.mifareClassic;
    const block = skip_bytes >> 4;
    logger.debug("Übersprungene Bytes:", skip_bytes, "Sektor:", sector, "Daten (Nummer):", data);

    const spBlock = (sector << 2) + block;
    logger.debug("Berechneter SP-Block:", spBlock);

    const swappedData = swap32(data >>> 0);
    const dataHex = hex(swappedData, 2 * read_bytes);
    logger.debug("Daten-Swap-Hex:", dataHex);

    let dataArray = new Uint8Array(16);
    for (let i = 0; i < dataHex.length / 2; i++) {
        dataArray[skip_bytes + i] = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
    }
    logger.debug("DatenArray:", dataArray);

    let dataStr = Array.from(dataArray)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    logger.debug("Verarbeitete Daten:", dataStr);

    try {
        updateSessionInfo("tag", {
            type: "MIFARECLASSIC",
            uid: transponderConfig.tags.mifareClassic.uid,
            status: "Schreiben",
        });

        const result = await protocolHandler.MifareClassic_WriteBlock(spBlock, dataStr);
        if (result) {
            logger.debug("Schreiben erfolgreich");
            updateSessionInfo("action", "MIFARE Classic schreiben erfolgreich");
            updateSessionInfo("tag", {
                type: "MIFARECLASSIC",
                uid: transponderConfig.tags.mifareClassic.uid,
                status: "Schreiben erfolgreich",
            });
            return result;
        }

        logger.warn("Schreiben fehlgeschlagen: Daten konnten nicht geschrieben werden");
        updateSessionInfo("tag", {
            type: "MIFARECLASSIC",
            uid: transponderConfig.tags.mifareClassic.uid,
            status: "Schreiben fehlgeschlagen",
        });
        return null;
    } catch (error) {
        logger.error("Fehler während MIFARE_CLASSIC_WRITE:", error);
        updateSessionInfo("action", `Fehler während MIFARE Classic schreiben: ${error.message}`);
        throw error;
    }
}

export async function readMifareClassic(transponderConfig) {
    const { skip_bytes, read_bytes, sector } = transponderConfig.tags.mifareClassic;
    const block = skip_bytes >> 4;
    const spBlock = (sector << 2) + block;

    logger.debug("Starte readMifareClassic", {
        block,
        sector,
        skip_bytes,
        read_bytes,
        spBlock,
    });
    updateSessionInfo("action", "Lese MIFARE Classic");

    try {
        const result = await protocolHandler.MifareClassic_ReadBlock(spBlock);

        if (parseByte(0, result) === 1) {
            const dataHex = result.slice(2, 34);
            logger.debug("Rohe gelesene Daten:", dataHex);

            let dataArray = new Uint8Array(16);
            for (let i = 0; i < 32; i += 2) {
                dataArray[i / 2] = parseInt(dataHex.slice(i, i + 2), 16);
            }

            let extractedData = dataArray.slice(skip_bytes, skip_bytes + read_bytes);

            let dataInt = 0;
            for (let i = 0; i < extractedData.length; i++) {
                dataInt |= extractedData[i] << (8 * i);
            }

            logger.debug("Extrahierte Daten (vor Swap):", dataInt);

            const dataStr = `Daten: ${dataInt}`;
            return dataInt;
        } else {
            const errorMsg = "OutputMifareClassic: Daten: Es konnten keine Daten gefunden werden";
            logger.warn(errorMsg);
            return null;
        }
    } catch (error) {
        logger.error("Fehler während MIFARE_CLASSIC_READ:", error);
        updateSessionInfo("action", `Fehler während MIFARE Classic lesen: ${error.message}`);
        throw error;
    }
}

export async function writeLoginKey(transponderConfig) {
    logger.debug("Starte writeLoginKey mit Konfiguration:", transponderConfig);
    updateSessionInfo("action", "Schreibe Anmeldeschlüssel zu MIFARE Classic");

    const { sector, key_a } = transponderConfig.tags.mifareClassic;
    const block = 3;

    const spBlock = (sector << 2) + block;
    logger.debug("Berechneter SP-Block für Schlüsselschreiben:", spBlock);

    let dataArray = new Uint8Array(16);

    for (let i = 0; i < Math.min(key_a.length, 12); i += 2) {
        dataArray[i / 2] = parseInt(key_a.slice(i, i + 2), 16);
    }

    const accessBytes = [0xff, 0x07, 0x80, 0x69];
    dataArray.set(accessBytes, 6);

    const keyB = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
    dataArray.set(keyB, 10);

    let dataStr = Array.from(dataArray)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    logger.debug("Vollständige Sektortrailerdaten zum Schreiben:", dataStr);

    try {
        const result = await protocolHandler.MifareClassic_WriteBlock(spBlock, dataStr);
        if (result) {
            logger.debug("Schlüsselschreiben erfolgreich");
            updateSessionInfo("action", "MIFARE Classic Anmeldeschlüssel schreiben erfolgreich");
            return result;
        }

        logger.warn("Schlüsselschreiben fehlgeschlagen: Daten konnten nicht geschrieben werden");
        return null;
    } catch (error) {
        logger.error("Fehler während MIFARE_CLASSIC_WRITE_KEY:", error);
        updateSessionInfo("action", `Fehler während MIFARE Classic Anmeldeschlüssel schreiben: ${error.message}`);
        throw error;
    }
}
