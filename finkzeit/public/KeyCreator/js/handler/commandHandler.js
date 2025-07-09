import { SP_ERROR } from "../constants/constants.js";
import logger from "../core/logger.js";

export class CommandProtocol {
    #portHandler;

    constructor(portHandler) {
        this.#portHandler = portHandler;
    }

    async sendCommand(command, paramStr) {
        // Write command
        const commandStr = `${this.#hex(command, 4)}${paramStr}\r`;
        this.#portHandler.write(commandStr);

        // Read response
        const response = await this.#portHandler.read({
            timeout: 3000,
            delimiter: "\r",
        });

        // Check for delimiter
        if (!response.endsWith("\r")) {
            throw new Error("Invalid response format: missing delimiter");
        }

        // Remove delimiter
        const responseData = response.slice(0, -1);

        // Check error code (first byte)
        const errorCode = parseInt(responseData.slice(0, 2), 16);

        switch (errorCode) {
            case SP_ERROR.ERR_NONE:
                return responseData.slice(2);
            case SP_ERROR.ERR_UNKNOWN_FUNCTION:
                throw new Error("Unknown function");
            case SP_ERROR.ERR_MISSING_PARAMETER:
                throw new Error("Missing parameter");
            case SP_ERROR.ERR_UNUSED_PARAMETERS:
                throw new Error("Unused parameters");
            case SP_ERROR.ERR_INVALID_FUNCTION:
                throw new Error("Invalid function");
            case SP_ERROR.ERR_PARSER:
                throw new Error("Parser error");
            default:
                throw new Error(`Unknown error code: ${errorCode}`);
        }
    }

    #hex(value, length) {
        return value.toString(16).padStart(length, "0").toUpperCase();
    }
}

// Global instance for backward compatibility
let globalCommandProtocol = null;

// Backward compatibility function
export async function sendCommand(command, paramStr) {
    if (!globalCommandProtocol) {
        throw new Error("CommandProtocol not initialized. Call initCommandProtocol() first.");
    }
    return await globalCommandProtocol.sendCommand(command, paramStr);
}

// Initialize function for backward compatibility
export async function initCommandProtocol(portHandler) {
    globalCommandProtocol = new CommandProtocol(portHandler);
}

// Utility functions for backward compatibility
export function hex(value, length) {
    if (typeof value !== "number" || isNaN(value)) {
        throw new TypeError("Value must be a number");
    }
    return value.toString(16).padStart(length, "0").toUpperCase();
}

export function swap16(value) {
    if (typeof value !== "number" || isNaN(value)) {
        throw new TypeError("Value must be a number");
    }
    const swapped = ((value & 0xff) << 8) | ((value >> 8) & 0xff);
    return swapped;
}

export function swap32(value) {
    if (typeof value !== "number" || isNaN(value)) {
        throw new TypeError("Value must be a number");
    }
    return (((value & 0xff) << 24) | ((value & 0xff00) << 8) | ((value >> 8) & 0xff00) | ((value >> 24) & 0xff)) >>> 0; // Ensure the result is always unsigned
}
