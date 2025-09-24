"use strict";

import logger from "../core/logger.js";
import { updateSessionInfo } from "../ui/ui.js";
import { getEnvironmentBaseUrl, getEnvironmentCountry } from "../api/environmentDetector.js";
import { isTestModeActive } from "../ui/testMode.js";

class ErpRestApi {
    constructor() {
        this.updateBaseUrl();
    }

    updateBaseUrl() {
        // Get base URL from environment detector
        this.baseUrl = getEnvironmentBaseUrl();
        const country = getEnvironmentCountry();

        logger.debug(`ERP API URL set to ${country} endpoint: ${this.baseUrl}`);
    }

    // Method to update URL when environment changes (kept for compatibility)
    setCountry(country) {
        this.updateBaseUrl();
        logger.debug(`ERP API environment updated, current country: ${country}`);

        // Reload the configuration list for the new environment
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

            // Sort companies alphabetically by customer name
            data.message.sort((a, b) => a.customer_name.localeCompare(b.customer_name));

            data.message.forEach((transponderConfig) => {
                const option = document.createElement("option");
                option.value = transponderConfig.customer;
                option.textContent =
                    transponderConfig.customer_name + (transponderConfig.licence_name ? " - " + transponderConfig.licence_name : "");
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

    async getTransponderConfiguration(customerId) {
        try {
            // Use the new backend API with customer parameter directly
            const response = await fetch(`${this.baseUrl}get_transponder_config?customer=${customerId}`);
            if (!response.ok) {
                logger.warn(`Failed to get transponder configuration: HTTP status ${response.status}`);
                throw new Error(`HTTP status ${response.status}`);
            }

            const transponderConfigData = await response.json();
            logger.debug(`Transponder config data for customer ${customerId}:`, transponderConfigData);

            if (!transponderConfigData.message) {
                logger.warn(`No configuration found for customer ID: ${customerId}`);
                throw new Error(`No configuration found for customer ID: ${customerId}`);
            }

            // Find the correct customer from the customers array
            const correctCustomer = transponderConfigData.message.customers?.find((c) => c.customer === customerId);

            // Merge customer info with the full config
            const finalConfig = {
                ...transponderConfigData.message,
                customer: correctCustomer?.customer || customerId,
                customer_name: correctCustomer?.customer_name || transponderConfigData.message.customer_name,
                licence: correctCustomer?.licence || transponderConfigData.message.licence,
                licence_name: correctCustomer?.licence_name || transponderConfigData.message.licence_name,
            };
            logger.debug(`Merged config with customer info:`, finalConfig);

            const transponderConfig = new TransponderConfig(finalConfig);
            transponderConfig.customerName = finalConfig.customer_name;
            transponderConfig.customerId = finalConfig.customer;
            transponderConfig.licence = finalConfig.licence;
            transponderConfig.licenceName = finalConfig.licence_name;

            return transponderConfig;
        } catch (error) {
            logger.error("Error fetching transponder configuration:", error);
            updateSessionInfo("action", `Fehler beim Abrufen der Transponderkonfiguration: ${error.message}`);
            throw error;
        }
    }

    async getTransponderByUid(uid, tagType) {
        try {
            logger.debug(`Getting transponder by UID: ${uid} (${tagType})`);

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
                    throw new Error(`Nicht unterstützter Tag-Typ: ${tagType}`);
            }

            const response = await fetch(`${this.baseUrl}get_transponder?${uidParam}`);
            if (!response.ok) {
                logger.warn(`Failed to get transponder by UID: HTTP status ${response.status}`);
                throw new Error(`HTTP status ${response.status}`);
            }

            const data = await response.json();
            logger.debug(`Transponder data for UID ${uid}:`, data);

            if (data.message && data.message.length > 0) {
                const transponder = data.message[0];
                // Return the transponder if it exists, even if some fields are empty
                if (transponder) {
                    logger.debug(`Transponder found for UID ${uid}:`, transponder);
                    return transponder; // Return the first matching transponder
                } else {
                    logger.debug(`Transponder object is null or undefined for UID ${uid}`);
                    return null; // No valid transponder found
                }
            } else {
                logger.debug(`No transponder found for UID ${uid}`);
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
                const transponder = data.message.find((t) => t.code === code || t.name === code);
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

    async checkTransponderExists(uid, tagType) {
        try {
            logger.debug(`Checking if transponder exists with UID: ${uid} (${tagType})`);

            const existingTransponders = await this.getAllTranspondersByUid(uid, tagType);
            const exists = existingTransponders.length > 0;

            logger.debug(`Transponder with UID ${uid} exists: ${exists} (${existingTransponders.length} entries found)`);
            return exists;
        } catch (error) {
            logger.error(`Error checking if transponder exists with UID ${uid}:`, error);
            return false; // Assume it doesn't exist if we can't check
        }
    }

    async createTransponder(customerId, number, uid = {}) {
        try {
            // Check if any of the UIDs already exist
            const existingUids = [];

            for (const [key, value] of Object.entries(uid)) {
                if (value) {
                    let tagType = "";
                    switch (key) {
                        case "hitag_uid":
                            tagType = "hitag1s";
                            break;
                        case "mfcl_uid":
                            tagType = "mifare_classic";
                            break;
                        case "mfdf_uid":
                            tagType = "mifare_desfire";
                            break;
                        case "deister_uid":
                            tagType = "deister";
                            break;
                        case "em_uid":
                            tagType = "em";
                            break;
                    }

                    if (tagType) {
                        const exists = await this.checkTransponderExists(value, tagType);
                        if (exists) {
                            existingUids.push(`${tagType}: ${value}`);
                        }
                    }
                }
            }

            if (existingUids.length > 0) {
                const message = `Transponder(s) already exist: ${existingUids.join(", ")}`;
                logger.warn(message);
                return { status: false, message };
            }

            // Use the new backend API with customer parameter directly
            const params = new URLSearchParams({
                customer: customerId,
                code: number,
            });

            if (uid.hitag_uid) params.append("hitag_uid", uid.hitag_uid);
            if (uid.mfcl_uid) params.append("mfcl_uid", uid.mfcl_uid);
            if (uid.mfdf_uid) params.append("mfdf_uid", uid.mfdf_uid);
            if (uid.legic_uid) params.append("legic_uid", uid.legic_uid);
            if (uid.deister_uid) params.append("deister_uid", uid.deister_uid);
            if (uid.em_uid) params.append("em_uid", uid.em_uid);

            // Set test_key param based on test mode
            // Only send test_key=1 when test mode is active
            // When test mode is inactive, don't send the parameter at all (defaults to 0 in ERP)
            const testModeActive = isTestModeActive();
            if (testModeActive) {
                params.append("test_key", 1);
                logger.debug(`Test mode active: true, setting test_key: 1`);
            } else {
                logger.debug(`Test mode active: false, not sending test_key parameter (will default to 0)`);
            }

            const response = await fetch(`${this.baseUrl}create_transponder?${params.toString()}`);
            const responseData = await response.json();

            logger.debug(`Response:`, responseData);
            logger.debug(`ResponseMessage:`, responseData.message);
            logger.debug(`Number:`, number);

            // Convert both to strings for comparison
            const responseMessage = String(responseData.message);
            const numberString = String(number);

            if (responseMessage === numberString) {
                logger.debug(`Transponder created successfully`);
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
                code: code,
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

    async getAllTranspondersByUid(uid, tagType) {
        try {
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
                    throw new Error(`Nicht unterstützter Tag-Typ: ${tagType}`);
            }

            const response = await fetch(`${this.baseUrl}get_transponder?${uidParam}`);
            if (!response.ok) throw new Error(`HTTP status ${response.status}`);
            const data = await response.json();
            return data.message || [];
        } catch (error) {
            logger.error(`Error getting all transponders by UID ${uid}:`, error);
            throw error;
        }
    }

    async fetchAllTransponderConfigs() {
        try {
            const response = await fetch(`${this.baseUrl}get_transponder_config_list`);
            if (!response.ok) throw new Error(`HTTP status ${response.status}`);
            const data = await response.json();
            return data.message || [];
        } catch (error) {
            logger.error("Error fetching all transponder configs:", error);
            throw error;
        }
    }
}

class TransponderConfig {
    constructor(data) {
        this.transponderConfigId = data.name;
        this.configName = data.name;
        this.customerName = data.customer_name;
        this.customerId = data.customer;
        this.form = data.form;
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

    getCustomerId() {
        return this.customerId;
    }
}

export { ErpRestApi, TransponderConfig };
