import { DESF } from "../constants/constants.js";
import * as protocolHandler from "../handler/protocolHandler.js";
import { updateSessionInfo } from "../ui.js";
import logger from "../logger.js";

const CRYPTO_ENV = DESF.CRYPTO_ENV0;

export async function mifareDesfireScript(transponderConfig) {
    logger.debug("Starting mifareDesfireScript with config:", transponderConfig);
    updateSessionInfo("action", "Starte MIFARE DESFire Operationen");

    try {
        if (!(await login0Key())) throw new Error("Anmeldung mit 0-Schlüssel fehlgeschlagen");
        const readMasterKeySettingsResult = await readMasterKeySettings();
        if (!readMasterKeySettingsResult) throw new Error("Lesen der Master-Schlüsseleinstellungen fehlgeschlagen");
        logger.debug("readMasterKeySettingsResult", readMasterKeySettingsResult);

        if (!(await changeMasterKeySettings(readMasterKeySettingsResult.keySettings, readMasterKeySettingsResult.numberOfKeys)))
            throw new Error("Ändern der Master-Schlüsseleinstellungen fehlgeschlagen");
        if (!(await changeMasterKey(transponderConfig, readMasterKeySettingsResult.keySettings, readMasterKeySettingsResult.numberOfKeys)))
            throw new Error("Ändern des Master-Schlüssels fehlgeschlagen");
        if (!(await loginMasterKey(transponderConfig))) throw new Error("Anmeldung mit Master-Schlüssel fehlgeschlagen");
        if (!(await createApplication(transponderConfig, readMasterKeySettingsResult.keySettings)))
            throw new Error("Erstellen der Anwendung fehlgeschlagen");
        if (!(await selectApplication(transponderConfig))) throw new Error("Auswählen der Anwendung fehlgeschlagen");
        if (!(await loginAppZeroKeyAES())) throw new Error("Anmeldung mit Anwendungs-Null-Schlüssel AES fehlgeschlagen");
        if (
            !(await changeAppMasterKey(
                transponderConfig,
                readMasterKeySettingsResult.keySettings,
                readMasterKeySettingsResult.numberOfKeys
            ))
        )
            throw new Error("Ändern des Anwendungs-Master-Schlüssels fehlgeschlagen");
        if (!(await loginAppMasterKey(transponderConfig))) throw new Error("Anmeldung mit Anwendungs-Master-Schlüssel fehlgeschlagen");
        if (
            !(await changeApplicationReadKey(
                transponderConfig,
                readMasterKeySettingsResult.keySettings,
                readMasterKeySettingsResult.numberOfKeys
            ))
        )
            throw new Error("Ändern des Anwendungs-Lese-Schlüssels fehlgeschlagen");
        if (!(await selectApplication(transponderConfig))) throw new Error("Auswählen der Anwendung fehlgeschlagen");
        if (!(await loginAppMasterKey(transponderConfig))) throw new Error("Anmeldung mit Anwendungs-Master-Schlüssel fehlgeschlagen");
        if (!(await createDataFile(transponderConfig))) throw new Error("Erstellen der Datendatei fehlgeschlagen");
        if (!(await writeToFile(transponderConfig))) throw new Error("Schreiben in die Datei fehlgeschlagen");
        if (!(await loginApplicationReadKey(transponderConfig))) throw new Error("Anmeldung mit Anwendungs-Lese-Schlüssel fehlgeschlagen");
        if (!(await readAndVerifyFile(transponderConfig))) throw new Error("Lesen und Verifizieren der Datei fehlgeschlagen");

        updateSessionInfo("tag", {
            type: "MIFAREDESFIRE",
            uid: transponderConfig.tags.mifareDesfire.uid,
            status: "Operationen abgeschlossen",
        });
        updateSessionInfo("action", "MIFARE DESFire Operationen erfolgreich abgeschlossen");
        return true;
    } catch (error) {
        logger.error("Fehler in mifareDesfireScript:", error);
        updateSessionInfo("tag", {
            type: "MIFAREDESFIRE",
            uid: transponderConfig.tags.mifareDesfire.uid,
            status: "Fehler",
        });
        updateSessionInfo("action", `Fehler bei MIFARE DESFire Operationen: ${error.message}`);
        return false;
    }
}

async function login0Key() {
    const keyNoTag = 0x00;
    const key = 0x00000000000000000000000000000000;
    //dev
    //const keyType = DESF.KEYTYPE_AES;
    const keyType = DESF.KEYTYPE_3DES;
    const mode = DESF.AUTHMODE_EV1;

    logger.debug("Logging in with Zero-Key and 3DES");
    const login0KeyResult = await protocolHandler.DESFire_Authenticate(CRYPTO_ENV, keyNoTag, key, keyType, mode);
    if (!login0KeyResult) {
        logger.error("Failed to log in with Zero-Key and 3DES");
        updateSessionInfo("action", "Anmeldung mit Zero-Key und 3DES fehlgeschlagen");
        return false;
    }
    logger.debug("Logged in with Zero-Key and 3DES");
    updateSessionInfo("action", "Anmeldung mit Zero-Key und 3DES erfolgreich");
    return true;
}

async function readMasterKeySettings() {
    logger.debug("Reading Master Key Settings");
    const readMasterKeySettingsResult = await protocolHandler.DESFire_GetKeySettings(CRYPTO_ENV);
    logger.debug("Master Key Settings:", readMasterKeySettingsResult);
    updateSessionInfo("action", "Master Key Einstellungen erfolgreich gelesen");
    return readMasterKeySettingsResult;
}

async function changeMasterKeySettings(keySettings, numberOfKeys) {
    const keyType = DESF.KEYTYPE_AES;

    logger.debug("Changing Master Key Settings");
    const changeMasterKeySettingsResult = await protocolHandler.DESFire_ChangeKeySettings(
        CRYPTO_ENV,
        keySettings.changeKeyAccessRights,
        keySettings.configurationChangeable,
        keySettings.freeCreateDelete,
        keySettings.freeDirectoryList,
        keySettings.allowChangeMasterKey,
        numberOfKeys,
        keyType
    );
    logger.debug("Changed Master Key Settings");
    updateSessionInfo("action", "Master Key Einstellungen erfolgreich geändert");
    return changeMasterKeySettingsResult;
}

async function changeMasterKey(transponderConfig, keySettings, numberOfKeys) {
    logger.debug("Changing Master Key");

    const oldKey = 0x00000000000000000000000000000000;
    const newKey = transponderConfig.tags.mifareDesfire.master_key;
    const keyNo = 0x00;
    const keyVersion = 0x00;
    const keyType = DESF.KEYTYPE_AES;

    const changeMasterKeyResult = await protocolHandler.DESFire_ChangeKey(
        CRYPTO_ENV,
        keyNo,
        oldKey,
        newKey,
        keyVersion,
        keySettings.changeKeyAccessRights,
        keySettings.configurationChangeable,
        keySettings.freeCreateDelete,
        keySettings.freeDirectoryList,
        keySettings.allowChangeMasterKey,
        numberOfKeys,
        keyType
    );
    logger.debug("Changed Master Key");
    updateSessionInfo("action", "Master Key erfolgreich geändert");
    return changeMasterKeyResult;
}

async function loginMasterKey(transponderConfig) {
    const keyNoTag = 0x00;
    const key = transponderConfig.tags.mifareDesfire.master_key;
    const keyType = DESF.KEYTYPE_AES;
    const mode = DESF.AUTHMODE_EV1;

    const loginMasterKeyResult = await protocolHandler.DESFire_Authenticate(CRYPTO_ENV, keyNoTag, key, keyType, mode);
    logger.debug("Logged in with Master Key");
    updateSessionInfo("action", "Anmeldung mit Master Key erfolgreich");
    return loginMasterKeyResult;
}

async function createApplication(transponderConfig, keySettings) {
    logger.debug("Creating Application");

    const AID = transponderConfig.tags.mifareDesfire.app_id;
    const keyType = DESF.KEYTYPE_AES;
    const numberOfKeys = 2;

    const createApplicationResult = await protocolHandler.DESFire_CreateApplication(
        CRYPTO_ENV, //1 byte
        AID, //4 bytes
        keySettings.changeKeyAccessRights, //4 bit
        keySettings.configurationChangeable, //1 bit
        keySettings.freeCreateDelete, //1 bit
        keySettings.freeDirectoryList, //1 bit
        keySettings.allowChangeMasterKey, //1 bit
        numberOfKeys, //4 bytes
        keyType //4 bytes
    );
    logger.debug("Created Application");
    updateSessionInfo("action", "Anwendung erfolgreich erstellt");
    return createApplicationResult;
}

async function selectApplication(transponderConfig) {
    const AID = transponderConfig.tags.mifareDesfire.app_id;
    const selectApplicationResult = await protocolHandler.DESFire_SelectApplication(CRYPTO_ENV, AID);
    logger.debug("Selected Application");
    updateSessionInfo("action", "Anwendung erfolgreich ausgewählt");
    return selectApplicationResult;
}

async function loginAppZeroKeyAES() {
    const keyNoTag = 0x00;
    const key = 0x00000000000000000000000000000000;
    const keyType = DESF.KEYTYPE_AES;
    const mode = DESF.AUTHMODE_EV1;

    const loginZeroKeyAESResult = await protocolHandler.DESFire_Authenticate(CRYPTO_ENV, keyNoTag, key, keyType, mode);
    logger.debug("Logged in with Zero-Key and AES");
    updateSessionInfo("action", "Anmeldung mit Zero-Key und AES erfolgreich");
    return loginZeroKeyAESResult;
}

async function changeAppMasterKey(transponderConfig, keySettings, numberOfKeys) {
    logger.debug("Changing App-MasterKey");

    const oldKey = 0x00000000000000000000000000000000;
    const newKey = transponderConfig.tags.mifareDesfire.app_master_key;
    const keyNo = 0x00;
    const keyVersion = 0x00;
    const keyType = DESF.KEYTYPE_AES;

    const changeAppMasterKeyResult = await protocolHandler.DESFire_ChangeKey(
        CRYPTO_ENV,
        keyNo,
        oldKey,
        newKey,
        keyVersion,
        keySettings.changeKeyAccessRights,
        keySettings.configurationChangeable,
        keySettings.freeCreateDelete,
        keySettings.freeDirectoryList,
        keySettings.allowChangeMasterKey,
        numberOfKeys,
        keyType
    );
    logger.debug("Changed App-MasterKey");
    updateSessionInfo("action", "App-MasterKey erfolgreich geändert");
    return changeAppMasterKeyResult;
}

async function loginAppMasterKey(transponderConfig) {
    const keyNoTag = 0x00;
    const key = transponderConfig.tags.mifareDesfire.app_master_key;
    const keyType = DESF.KEYTYPE_AES;
    const mode = DESF.AUTHMODE_EV1;

    const loginAppMasterKeyResult = await protocolHandler.DESFire_Authenticate(CRYPTO_ENV, keyNoTag, key, keyType, mode);
    logger.debug("Logged in with App-MasterKey");
    updateSessionInfo("action", "Anmeldung mit App-MasterKey erfolgreich");
    return loginAppMasterKeyResult;
}

async function changeApplicationReadKey(transponderConfig, keySettings, numberOfKeys) {
    logger.debug("Changing Application Key");

    const oldKey = 0x00000000000000000000000000000000;
    const newKey = transponderConfig.tags.mifareDesfire.app_read_key;
    const keyNo = 0x01;
    const keyVersion = 0x00;
    const keyType = DESF.KEYTYPE_AES;

    const changeApplicationReadKeyResult = await protocolHandler.DESFire_ChangeKey(
        CRYPTO_ENV,
        keyNo,
        oldKey,
        newKey,
        keyVersion,
        keySettings.changeKeyAccessRights,
        keySettings.configurationChangeable,
        keySettings.freeCreateDelete,
        keySettings.freeDirectoryList,
        keySettings.allowChangeMasterKey,
        numberOfKeys,
        keyType
    );
    logger.debug("Changed Application Key");
    updateSessionInfo("action", "Anwendungsschlüssel erfolgreich geändert");
    return changeApplicationReadKeyResult;
}

async function createDataFile(transponderConfig) {
    const fileNo = transponderConfig.tags.mifareDesfire.file_byte;
    const fileType = DESF.FILETYPE_STDDATAFILE;
    const commSet = DESF.COMMSET_PLAIN;
    const accessRights = 0x1000;
    const fileSize = 0x04;

    const createEncryptedDataFileResult = await protocolHandler.DESFire_CreateDataFile(
        CRYPTO_ENV,
        fileNo,
        fileType,
        commSet,
        accessRights,
        fileSize
    );
    logger.debug("Created Encrypted Data File:", createEncryptedDataFileResult);
    updateSessionInfo("action", "Verschlüsselte Datei erfolgreich erstellt");
    return createEncryptedDataFileResult;
}

async function writeToFile(transponderConfig) {
    logger.debug("Starting writeToFile function");
    const data = transponderConfig.tags.mifareDesfire.number;
    const fileNo = transponderConfig.tags.mifareDesfire.file_byte;
    const offset = 0x00;
    const commSet = DESF.COMMSET_PLAIN;

    const writeToFileResult = await protocolHandler.DESFire_WriteData(CRYPTO_ENV, fileNo, offset, data, commSet);
    if (!writeToFileResult) {
        logger.error("mifareDesfire write failed");
        updateSessionInfo("action", "mifareDesfire schreiben fehlgeschlagen");
        return false;
    }
    logger.debug("mifareDesfire write successful");
    updateSessionInfo("action", "Daten erfolgreich in Datei geschrieben");
    return true;
}

async function loginApplicationReadKey(transponderConfig) {
    const keyNoTag = 0x00;
    const key = transponderConfig.tags.mifareDesfire.app_read_key;
    const keyType = DESF.KEYTYPE_AES;
    const mode = DESF.AUTHMODE_EV1;

    const loginApplicationReadKeyResult = await protocolHandler.DESFire_Authenticate(CRYPTO_ENV, keyNoTag, key, keyType, mode);
    logger.debug("Logged in with Application Key");
    updateSessionInfo("action", "Anmeldung mit Anwendungsschlüssel erfolgreich");
    return loginApplicationReadKeyResult;
}

async function readAndVerifyFile(transponderConfig) {
    const fileNo = transponderConfig.tags.mifareDesfire.file_byte;
    const offset = 0x00;
    const length = 0x04;
    const commSet = DESF.COMMSET_PLAIN;
    const readAndVerifyFileResult = await protocolHandler.DESFire_ReadData(CRYPTO_ENV, fileNo, offset, length, commSet);
    logger.debug("Read and Verified File Result:", readAndVerifyFileResult);
    if (!readAndVerifyFileResult.success || readAndVerifyFileResult.data !== transponderConfig.tags.mifareDesfire.number) {
        logger.error("MIFARE DESFire verification failed");
        updateSessionInfo("action", "MIFARE DESFire Verifizierung fehlgeschlagen");
        return false;
    }
    updateSessionInfo("action", "MIFARE DESFire Verifizierung erfolgreich");
    return true;
}
