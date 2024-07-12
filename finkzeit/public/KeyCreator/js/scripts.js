import { hitagScript } from "./tags/hitag1s.js";
import { mifareClassicScript } from "./tags/mifareClassic.js";
import { mifareDesfireScript } from "./tags/mifareDesfire.js";
import numberHandler from "./handler/numberHandler.js";
import { updateSessionInfo } from "./ui.js";
import logger from "./logger.js";

async function executeScriptsBasedOnConfig(transponderConfig, requiredKeys, erpRestApi) {
    const scriptMapping = {
        hitag: hitagScript,
        mifareClassic: mifareClassicScript,
        mifareDesfire: mifareDesfireScript,
    };

    let allScriptsExecuted = true;
    let sessionResult = "success";
    let errors = [];

    for (const key of requiredKeys) {
        if (transponderConfig.isTagAvailable(key)) {
            const script = scriptMapping[key];
            if (script) {
                if (key === "hitag" && transponderConfig.tags.hitag.feig_coding !== 1) {
                    logger.debug("Feig script not executed as feig is not 1");
                    continue;
                }
                if (!(await transponderConfig.getNumber())) {
                    errors.push("Nummer nicht verfügbar");
                    allScriptsExecuted = false;
                    sessionResult = "failed";
                    break;
                }
                numberHandler.writeToInput();
                try {
                    const scriptResult = await script(transponderConfig);
                    if (!scriptResult) {
                        throw new Error(`Failed to write data to ${key.toUpperCase()} tag`);
                    }
                    logger.debug(`${key.toUpperCase()} script completed successfully`);
                    updateSessionInfo("tag", {
                        type: key,
                        uid: transponderConfig.tags[key]?.uid || "N/A",
                        status: "Abgeschlossen",
                    });
                    updateSessionInfo("number", transponderConfig.getNumber());
                } catch (error) {
                    logger.error(`Error executing ${key.toUpperCase()} script:`, error);
                    if (errors.length === 0) {
                        errors.push(`${key.toUpperCase()}: ${error.message}`);
                    }
                    allScriptsExecuted = false;
                    sessionResult = "failed";
                    updateSessionInfo("tag", {
                        type: key,
                        uid: transponderConfig.tags[key]?.uid || "N/A",
                        status: "Fehlgeschlagen",
                    });
                    break; // Exit the loop after the first error
                }
            } else {
                logger.warn(`${key.toUpperCase()} script not found`);
                if (errors.length === 0) {
                    errors.push(`${key.toUpperCase()} script nicht gefunden`);
                }
                allScriptsExecuted = false;
                sessionResult = "failed";
                break; // Exit the loop after the first error
            }
        } else if (requiredKeys.includes(key)) {
            logger.warn(`${key.toUpperCase()} not available`);
            if (errors.length === 0) {
                errors.push(`${key.toUpperCase()} nicht verfügbar`);
            }
            updateSessionInfo("tag", {
                type: key,
                uid: "N/A",
                status: "Nicht verfügbar",
            });
            sessionResult = "failed";
            break; // Exit the loop after the first error
        }
    }

    try {
        const number = transponderConfig.getNumber();
        const uid = {
            hitag_uid: transponderConfig.tags.hitag?.uid,
            mfcl_uid: transponderConfig.tags.mifareClassic?.uid,
            mfdf_uid: transponderConfig.tags.mifareDesfire?.uid,
            legic_uid: transponderConfig.tags.legic?.uid,
            deister_uid: transponderConfig.tags.deister?.uid,
            em_uid: transponderConfig.tags.em?.uid,
        };
        const response = await erpRestApi.createTransponder(transponderConfig.transponderConfigId, number, uid);

        logger.debug("Response:", response);
        logger.debug("ResponseMessage:", response.message);
        logger.debug("Number:", number);

        if (response.message === number.toString()) {
            logger.debug("Transponder created successfully");
            updateSessionInfo("action", `Transponder mit Nummer ${number} erfolgreich erstellt`);
        } else {
            logger.warn(response.message);
            if (response.message === "This transponder already exists") {
                errors.push("Transponder existiert bereits im ERP");
            } else if (errors.length === 0) {
                errors.push(response.message);
            }
            sessionResult = "failed";
        }
    } catch (error) {
        logger.error("Error creating transponder:", error);
        if (errors.length === 0) {
            errors.push(`Fehler beim Erstellen des Transponders: ${error.message}`);
        }
        sessionResult = "failed";
    }

    updateSessionInfo("sessionResult", sessionResult);
    return { allScriptsExecuted, sessionResult, errors };
}

export { executeScriptsBasedOnConfig };
