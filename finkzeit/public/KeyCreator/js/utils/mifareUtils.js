import logger from "../core/logger.js";

/**
 * Checks if a specific bit is set in a value
 * @param {number} value - The value to check
 * @param {number} bitNumber - The bit number to check (0-based)
 * @returns {boolean} - True if the bit is set, false otherwise
 */
export function checkBit(value, bitNumber) {
    return (value & (1 << bitNumber)) !== 0;
}

/**
 * Identifies MIFARE type based on SAK value
 * @param {number} sakValue - The SAK (Select Acknowledge) value
 * @param {string} context - Context for logging (e.g., "verifyKey", "readKey", "formatKey")
 * @returns {string} - MIFARE type: "ERROR", "MIFARE_CLASSIC", or "MIFARE_DESFIRE"
 */
export function identifyMifareType(sakValue, context = "") {
    logger.debug(`[${context}] Identifying MIFARE type for SAK value: ${sakValue}`);

    // Check bit 1 for error condition
    if (checkBit(sakValue, 1)) {
        return "ERROR";
    }

    // Check bit 3 for MIFARE Classic
    if (checkBit(sakValue, 3)) {
        return "MIFARE_CLASSIC";
    }

    // Default to MIFARE DESFire
    return "MIFARE_DESFIRE";
}

/**
 * Identifies MIFARE type using bitwise operations (alternative implementation)
 * @param {number} sakValue - The SAK (Select Acknowledge) value
 * @param {string} context - Context for logging
 * @returns {string} - MIFARE type: "ERROR", "MIFARE_CLASSIC", or "MIFARE_DESFIRE"
 */
export function identifyMifareTypeBitwise(sakValue, context = "") {
    logger.debug(`[${context}] Identifying MIFARE type for SAK value: ${sakValue}`);

    if ((sakValue & (1 << 1)) !== 0) return "ERROR";
    if ((sakValue & (1 << 3)) !== 0) return "MIFARE_CLASSIC";
    return "MIFARE_DESFIRE";
}
