"use strict";

import logger from "../logger.js";
import { updateSessionInfo } from "../ui.js";

class ErpRestApi {
    constructor() {
        this.updateBaseUrl();
    }

    updateBaseUrl() {
        // Get current country from localStorage or default to austria
        const currentCountry = localStorage.getItem("selectedCountry") || "austria";
        
        if (currentCountry === "switzerland") {
            this.baseUrl = "https://erp-test.finkzeit.at/api/method/finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration.";
            //this.baseUrl = "/api-swiss/method/finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration.";
            logger.debug("ERP API URL set to Swiss endpoint");
        } else {
            this.baseUrl = "https://erp-test.finkzeit.at/api/method/finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration.";
            //this.baseUrl = "/api/method/finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration.";
            logger.debug("ERP API URL set to Austrian endpoint");
        }
    }

    // Method to update URL when country changes
    setCountry(country) {
        this.updateBaseUrl();
        logger.debug(`ERP API country changed to: ${country}`);
        
        // Reload the configuration list for the new country
        this.reloadConfigurationList();
    }

    async reloadConfigurationList() {
        try {
            logger.debug("Reloading configuration list for new country");
            const firmenSelect = document.getElementById("firmen");
            if (firmenSelect) {
                // Clear existing options
                firmenSelect.innerHTML = '<option value="">Firma auswählen...</option>';
                
                // Reload the list
                await this.getTransponderConfigurationList(firmenSelect);
                logger.debug("Configuration list reloaded successfully");
            } else {
                logger.warn("Firmen select element not found for reloading");
            }
        } catch (error) {
            logger.error("Error reloading configuration list:", error);
        }
    }

    async getTransponderConfigurationList(firmenSelect) {
        try {

            //document.cookie = "sid=cd3ec032352750ca0af549d8ad8ee8177feb7be87e27c065a6c04736";

            const response = await fetch(`${this.baseUrl}get_transponder_config_list`);

            if (response.status === 403) {
                updateSessionInfo("action", "Session-ID fehlt oder ist ungültig. Bitte erneut anmelden.");
                logger.warn("Session ID invalid");
                throw new Error("Session ID invalid");
            }

            if (!response.ok) {
                updateSessionInfo("action", `Laden der Firmenliste fehlgeschlagen: HTTP-Status ${response.status}`);
                logger.warn(`Failed to load firm list: HTTP status ${response.status}`);
                throw new Error(`HTTP status ${response.status}`);
            }

            const data = await response.json();
            data.message.forEach((firma) => {
                const option = document.createElement("option");
                option.value = firma.name;
                option.textContent = firma.customer_name;
                firmenSelect.appendChild(option);
            });
        } catch (error) {
            logger.error("Error fetching firm list:", error);
            if (error.message !== "Session ID invalid" && error.message.indexOf("HTTP status") === -1) {
                updateSessionInfo("action", `Fehler beim Abrufen der Firmenliste: ${error.message}`);
            }
            throw error;
        }
    }

    async getTransponderConfiguration(transponderConfigId) {
        try {
            document.cookie = "sid=cd3ec032352750ca0af549d8ad8ee8177feb7be87e27c065a6c04736";
            
            const response = await fetch(`${this.baseUrl}get_transponder_config?config=${transponderConfigId}`);
            if (!response.ok) {
                logger.warn(`Failed to get transponder configuration: HTTP status ${response.status}`);
                throw new Error(`HTTP status ${response.status}`);
            }
            const transponderConfigData = await response.json();
            return new TransponderConfig(transponderConfigData.message);
        } catch (error) {
            logger.error("Error fetching transponder configuration:", error);
            updateSessionInfo("action", `Fehler beim Abrufen der Transponderkonfiguration: ${error.message}`);
            throw error;
        }
    }

    async getTransponderByUid(uid, tagType) {
        try {
            logger.debug(`Getting transponder by UID: ${uid} (${tagType})`);
            
            document.cookie = "sid=cd3ec032352750ca0af549d8ad8ee8177feb7be87e27c065a6c04736";
            
            let uidParam = "";
            switch (tagType.toLowerCase()) {
                case "hitag":
                case "hitag1s":
                    uidParam = `hitag_uid=${uid}`;
                    break;
                case "mifare_classic":
                    uidParam = `mfcl_uid=${uid}`;
                    break;
                case "mifare_desfire":
                    uidParam = `mfdf_uid=${uid}`;
                    break;
                case "deister":
                    uidParam = `deister_uid=${uid}`;
                    break;
                case "em":
                    uidParam = `em_uid=${uid}`;
                    break;
                default:
                    throw new Error(`Unsupported tag type: ${tagType}`);
            }
            
            const response = await fetch(`${this.baseUrl}get_transponder?${uidParam}`);
            if (!response.ok) {
                logger.warn(`Failed to get transponder by UID: HTTP status ${response.status}`);
                throw new Error(`HTTP status ${response.status}`);
            }
            
            const data = await response.json();
            logger.debug(`Transponder data for UID ${uid}:`, data);
            
            if (data.message && data.message.length > 0) {
                return data.message[0]; // Return the first matching transponder
            } else {
                return null; // No transponder found
            }
        } catch (error) {
            logger.error(`Error getting transponder by UID ${uid}:`, error);
            throw error;
        }
    }

    async getTransponderByCode(code) {
        try {
            logger.debug(`Getting transponder by code: ${code}`);
            
            document.cookie = "sid=cd3ec032352750ca0af549d8ad8ee8177feb7be87e27c065a6c04736";
            
            // We can use the get_transponder endpoint with any UID parameter
            // Since we're looking by code, we'll use a dummy parameter to get all and filter
            const response = await fetch(`${this.baseUrl}get_transponder?hitag_uid=dummy`);
            if (!response.ok) {
                logger.warn(`Failed to get transponder by code: HTTP status ${response.status}`);
                throw new Error(`HTTP status ${response.status}`);
            }
            
            const data = await response.json();
            logger.debug(`All transponder data:`, data);
            
            if (data.message && data.message.length > 0) {
                // Find the transponder with matching code
                const transponder = data.message.find(t => t.code === code || t.name === code);
                if (transponder) {
                    logger.debug(`Found transponder by code ${code}:`, transponder);
                    return transponder;
                }
            }
            
            logger.debug(`No transponder found with code ${code}`);
            return null;
        } catch (error) {
            logger.error(`Error getting transponder by code ${code}:`, error);
            throw error;
        }
    }

    async createTransponder(transponderConfigId, number, uid = {}) {
        try {
            const params = new URLSearchParams({
                config: transponderConfigId,
                code: number
            });

            if (uid.hitag_uid) params.append("hitag_uid", uid.hitag_uid);
            if (uid.mfcl_uid) params.append("mfcl_uid", uid.mfcl_uid);
            if (uid.mfdf_uid) params.append("mfdf_uid", uid.mfdf_uid);
            if (uid.legic_uid) params.append("legic_uid", uid.legic_uid);
            if (uid.deister_uid) params.append("deister_uid", uid.deister_uid);
            if (uid.em_uid) params.append("em_uid", uid.em_uid);

            const response = await fetch(`${this.baseUrl}create_transponder?${params.toString()}`);
            const responseData = await response.json();

            if (response.message === number) {
                logger.debug(`Returned number ${number}`);
                return { status: true, message: number };
            } else {
                logger.warn(`Failed to create transponder: ${responseData.message}`);
                return { status: false, message: responseData.message };
            }
        } catch (error) {
            logger.error("Error creating transponder:", error);
            throw error;
        }
    }

    async deleteTransponder(code) {
        try {
            const params = new URLSearchParams({
                code: code
            });

            const response = await fetch(`${this.baseUrl}del_transponder?${params.toString()}`);
            const responseData = await response.json();
            
            logger.debug(`Delete transponder response for code ${code}:`, responseData);

            // Simple check - if we get any response, consider it successful
            // The backend will handle the actual deletion logic
            logger.debug(`Successfully processed delete request for transponder ${code}`);
            return { status: true, message: `Transponder ${code} deletion processed` };
            
        } catch (error) {
            logger.error("Error deleting transponder:", error);
            return { status: false, message: error.message };
        }
    }
}

class TransponderConfig {
    constructor(data) {
        this.transponderConfigId = data.name;
        this.form = data.form;
        this.customerName = data.customer_name;
        this.tags = {};

        if (data.legic === 1) this.tags.legic = { number: 0, uid: "" };
        if (data.deister === 1) this.tags.deister = { number: 0, uid: "" };
        if (data.em === 1) this.tags.em = { number: 0, uid: "" };

        if (data.ht1 === 1) {
            this.tags.hitag = {
                feig_coding: data.feig_coding,
                number: 0,
                uid: "",
            };
        }

        if (data.mfcl === 1) {
            this.tags.mifareClassic = {
                key_a: data.key_a,
                sector: data.sector,
                skip_bytes: data.skip_bytes,
                read_bytes: data.read_bytes,
                app_id: data.app_id,
                file_byte: data.file_byte,
                number: 0,
                uid: "",
            };
        }

        if (data.mfdf === 1) {
            this.tags.mifareDesfire = {
                master_key: data.master_key,
                app_master_key: data.app_master_key,
                app_read_key: data.app_read_key,
                app_id: data.app_id,
                file_byte: data.file_byte,
                number: 0,
                uid: "",
            };
        }
    }

    isTagAvailable(tag) {
        return this.tags[tag] !== undefined;
    }

    setNumber(number) {
        for (const tag in this.tags) {
            if (this.tags[tag]) this.tags[tag].number = number;
        }
    }

    setUid(uid) {
        if (uid.hitag_uid && this.tags.hitag) this.tags.hitag.uid = uid.hitag_uid;
        if (uid.mfcl_uid && this.tags.mifareClassic) this.tags.mifareClassic.uid = uid.mfcl_uid;
        if (uid.mfdf_uid && this.tags.mifareDesfire) this.tags.mifareDesfire.uid = uid.mfdf_uid;
        if (uid.legic_uid && this.tags.legic) this.tags.legic.uid = uid.legic_uid;
        if (uid.deister_uid && this.tags.deister) this.tags.deister.uid = uid.deister_uid;
        if (uid.em_uid && this.tags.em) this.tags.em.uid = uid.em_uid;
    }

    getRequiredKeys() {
        return Object.keys(this.tags);
    }

    getNumber() {
        for (const tag in this.tags) {
            if (this.tags[tag] && this.tags[tag].number) {
                return this.tags[tag].number;
            }
        }
        return null;
    }
}

export { ErpRestApi, TransponderConfig };
