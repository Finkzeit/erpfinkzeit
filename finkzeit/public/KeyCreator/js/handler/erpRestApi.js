"use strict";

import logger from "../logger.js";
import { updateSessionInfo } from "../ui.js";

class ErpRestApi {
    constructor() {
        this.baseUrl = "/api/method/finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration.";
    }

    async getTransponderConfigurationList(firmenSelect) {
        try {
            // If running locally, you need to uncomment the following line and set the sid to the one you get from the erp-test.finkzeit.at cookies
            //document.cookie = "sid=eaff457306e216b250f6a085d1a7cb74ffc81075b7ac5918b362221f";
            const response = await fetch(`${this.baseUrl}get_transponder_config_list`);

            if (response.status === 403) {
                const message = "Session-ID fehlt oder ist ungültig. Bitte erneut anmelden.";
                updateSessionInfo("action", message);
                logger.warn(message);
                throw new Error("Session-ID ungültig");
            }

            if (!response.ok) {
                const message = `Laden der Firmenliste fehlgeschlagen: HTTP-Status ${response.status}`;
                updateSessionInfo("action", message);
                logger.warn(message);
                throw new Error(message);
            }

            const data = await response.json();
            data.message.forEach((firma) => {
                const option = document.createElement("option");
                option.value = firma.name;
                option.textContent = firma.customer_name;
                firmenSelect.appendChild(option);
            });
        } catch (error) {
            const message = `Fehler beim Abrufen der Firmenliste: ${error.message}`;
            logger.error(message, error);
            if (error.message !== "Session-ID ungültig" && !error.message.includes("HTTP-Status")) {
                updateSessionInfo("action", message);
            }
            throw error;
        }
    }

    async getTransponderConfiguration(transponderConfigId) {
        try {
            const response = await fetch(`${this.baseUrl}get_transponder_config?config=${transponderConfigId}`);
            if (!response.ok) {
                const message = `Abrufen der Transponderkonfiguration fehlgeschlagen: HTTP-Status ${response.status}`;
                logger.warn(message);
                throw new Error(message);
            }
            const transponderConfigData = await response.json();
            return new TransponderConfig(transponderConfigData.message);
        } catch (error) {
            const message = `Fehler beim Abrufen der Transponderkonfiguration: ${error.message}`;
            logger.error(message, error);
            updateSessionInfo("action", message);
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

            if (responseData.message === number.toString()) {
                logger.debug(`Transponder created successfully with number: ${number}`);
                return { status: true, message: number };
            } else {
                const message = `Erstellen des Transponders fehlgeschlagen: ${responseData.message}`;
                logger.warn(message);
                return { status: false, message: responseData.message };
            }
        } catch (error) {
            const message = `Fehler beim Erstellen des Transponders: ${error.message}`;
            logger.error(message, error);
            throw error;
        }
    }

    async getTransponder(uid = {}) {
        try {
            const params = new URLSearchParams();

            if (uid.hitag_uid) params.append("hitag_uid", uid.hitag_uid);
            else if (uid.mfcl_uid) params.append("mfcl_uid", uid.mfcl_uid);
            else if (uid.mfdf_uid) params.append("mfdf_uid", uid.mfdf_uid);
            else if (uid.deister_uid) params.append("deister_uid", uid.deister_uid);
            else if (uid.em_uid) params.append("em_uid", uid.em_uid);
            else {
                throw new Error("Keine gültige UID angegeben");
            }

            const response = await fetch(`${this.baseUrl}get_transponder?${params.toString()}`);
            if (!response.ok) {
                const message = `Abrufen des Transponders fehlgeschlagen: HTTP-Status ${response.status}`;
                logger.warn(message);
                throw new Error(message);
            }
            const transponderData = await response.json();

            if (!transponderData.message || transponderData.message.length === 0) {
                return { message: [] };
            }

            // Check if the passed UID matches any UID in the response
            const matchingTransponder = transponderData.message.find(
                (transponder) =>
                    (uid.hitag_uid && transponder.hitag_uid === uid.hitag_uid) ||
                    (uid.mfcl_uid && transponder.mfcl_uid === uid.mfcl_uid) ||
                    (uid.mfdf_uid && transponder.mfdf_uid === uid.mfdf_uid) ||
                    (uid.deister_uid && transponder.deister_uid === uid.deister_uid) ||
                    (uid.em_uid && transponder.em_uid === uid.em_uid)
            );

            if (matchingTransponder) {
                return transponderData;
            } else {
                return { message: [] };
            }
        } catch (error) {
            const message = `Fehler beim Abrufen des Transponders: ${error.message}`;
            logger.error(message, error);
            updateSessionInfo("action", message);
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
