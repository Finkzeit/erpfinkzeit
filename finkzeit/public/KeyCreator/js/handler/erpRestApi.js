"use strict";

import logger from "../logger.js";
import { updateSessionInfo } from "../ui.js";

class ErpRestApi {
    constructor() {
        this.baseUrl = "/api/method/finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration.";
    }

    async getTransponderConfigurationList(firmenSelect) {
        try {
            //you need to get the sid out of cookies sid=... in erp-test.finkzeit.at
            //document.cookie = "sid=b48eb00b6f03de2e645e81e620ce006bb27c585441fb1ba250b37a7b";
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

    async createTransponder(transponderConfigId, number, uid = {}) {
        try {
            const params = new URLSearchParams({
                config: transponderConfigId,
                code: number,
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
