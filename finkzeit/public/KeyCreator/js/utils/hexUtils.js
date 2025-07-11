/**
 * Utility functions for hex operations and byte manipulation
 */

/**
 * Converts a number to a hex string with specified length
 * @param {number} value - The number to convert
 * @param {number} length - The desired length of the hex string
 * @returns {string} The hex string padded to the specified length
 */
export function hex(value, length) {
    if (typeof value !== "number" || isNaN(value)) {
        throw new TypeError("Value must be a number");
    }
    return value.toString(16).padStart(length, "0").toUpperCase();
}

/**
 * Swaps the byte order of a 16-bit value
 * @param {number} value - The 16-bit value to swap
 * @returns {number} The value with bytes swapped
 */
export function swap16(value) {
    if (typeof value !== "number" || isNaN(value)) {
        throw new TypeError("Value must be a number");
    }
    const swapped = ((value & 0xff) << 8) | ((value >> 8) & 0xff);
    return swapped;
}

/**
 * Swaps the byte order of a 32-bit value
 * @param {number} value - The 32-bit value to swap
 * @returns {number} The value with bytes swapped (unsigned)
 */
export function swap32(value) {
    if (typeof value !== "number" || isNaN(value)) {
        throw new TypeError("Value must be a number");
    }
    return (((value & 0xff) << 24) | ((value & 0xff00) << 8) | ((value >> 8) & 0xff00) | ((value >> 24) & 0xff)) >>> 0; // Ensure the result is always unsigned
}
