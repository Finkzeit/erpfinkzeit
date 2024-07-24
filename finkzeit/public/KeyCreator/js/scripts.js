import { hitagScript } from "./tags/hitag1s.js";
import { mifareClassicScript } from "./tags/mifareClassic.js";
import { mifareDesfireScript } from "./tags/mifareDesfire.js";
import numberHandler from "./handler/numberHandler.js";
import { updateSessionInfo } from "./ui.js";
import logger from "./logger.js";

async function executeScriptsBasedOnConfig(transponderConfig, erpRestApi) {
    const scriptMapping = {
        hitag: hitagScript,
        mifareClassic: mifareClassicScript,
        mifareDesfire: mifareDesfireScript,
    };

    let allScriptsExecuted = true;
    let sessionResult = "success";
    let errors = [];

    const requiredKeys = transponderConfig.getRequiredKeys();

    for (const key of requiredKeys) {
        if (transponderConfig.isTagAvailable(key)) {
            if (["deister", "legic", "em"].includes(key)) {
                logger.debug(`${key.toUpperCase()} benötigt kein Skript, wird als erfolgreich fortgesetzt`);
                updateSessionInfo("tag", {
                    type: key,
                    uid: transponderConfig.tags[key]?.uid || "N/A",
                    status: "Abgeschlossen",
                });
                continue;
            }

            const script = scriptMapping[key];
            if (script) {
                if (key === "hitag" && transponderConfig.tags.hitag.feig_coding !== 1) {
                    logger.debug("Feig-Skript nicht ausgeführt, da feig nicht 1 ist");
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
                        throw new Error(`Fehler bei der Ausführung des ${key.toUpperCase()}-Skripts`);
                    }
                    logger.debug(`${key.toUpperCase()}-Skript erfolgreich abgeschlossen`);
                    updateSessionInfo("tag", {
                        type: key,
                        uid: transponderConfig.tags[key]?.uid || "N/A",
                        status: "Abgeschlossen",
                    });
                    updateSessionInfo("number", transponderConfig.getNumber());
                } catch (error) {
                    logger.error(`Fehler bei der Ausführung des ${key.toUpperCase()}-Skripts:`, error);
                    if (errors.length === 0) {
                        errors.push(`${error.message}`);
                    }
                    allScriptsExecuted = false;
                    sessionResult = "failed";
                    updateSessionInfo("tag", {
                        type: key,
                        uid: transponderConfig.tags[key]?.uid || "N/A",
                        status: "Fehlgeschlagen",
                    });
                    break;
                }
            } else {
                logger.warn(`${key.toUpperCase()}-Skript nicht gefunden`);
                if (errors.length === 0) {
                    errors.push(`${key.toUpperCase()}-Skript nicht gefunden`);
                }
                allScriptsExecuted = false;
                sessionResult = "failed";
                break;
            }
        } else if (requiredKeys.includes(key)) {
            logger.warn(`${key.toUpperCase()} nicht verfügbar`);
            if (errors.length === 0) {
                errors.push(`${key.toUpperCase()} nicht verfügbar`);
            }
            updateSessionInfo("tag", {
                type: key,
                uid: "N/A",
                status: "Nicht verfügbar",
            });
            sessionResult = "failed";
            break;
        }
    }
    if (sessionResult !== "failed") {
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

            logger.debug("Antwort:", response);
            logger.debug("Antwortnachricht:", response.message);
            logger.debug("Nummer:", number);

            if (response.message === number.toString()) {
                logger.debug("Transponder erfolgreich erstellt");
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
            logger.error("Fehler beim Erstellen des Transponders:", error);
            if (errors.length === 0) {
                errors.push(`Fehler beim Erstellen des Transponders: ${error.message}`);
            }
            sessionResult = "failed";
        }
    } else {
        logger.warn("Überspringen der Transpondererstellung aufgrund vorheriger Fehler");
    }

    updateSessionInfo("sessionResult", sessionResult);
    return { allScriptsExecuted, sessionResult, errors };
}

export { executeScriptsBasedOnConfig };
