import { SP_ERROR } from "../constants/constants.js";
import { PortHandler } from "./portHandler.js";
import logger from "../logger.js";

/** @type {PortHandler} */
let portHandler;

let commandQueue = [];
let isProcessing = false;

export async function initPortHandler() {
    portHandler = new PortHandler();
    await portHandler.serialPortHandler.open();
}

export async function sendCommand(command, paramStr) {
    return new Promise((resolve, reject) => {
        commandQueue.push({ command, paramStr, resolve, reject });
        processQueue();
    });
}

async function processQueue() {
    if (isProcessing || commandQueue.length === 0) {
        return;
    }

    isProcessing = true;
    const { command, paramStr, resolve, reject } = commandQueue.shift();

    try {
        let byteArr = `${hex(command, 4)}${paramStr}\r`;
        logger.debug(`sendCommand sent: ${byteArr}`);
        await portHandler.serialPortHandler.write(byteArr);

        byteArr = "";
        const timeout = Date.now() + 5000; // Increase timeout to 5 seconds

        while (Date.now() < timeout) {
            const bytes = await portHandler.serialPortHandler.read();
            byteArr += bytes;
            if (byteArr.endsWith("\r")) {
                logger.debug(`Received response: ${byteArr}`);
                break;
            }
        }

        if (!byteArr.endsWith("\r")) {
            logger.warn("No valid delimiter found");
            reject("No valid delimiter found");
        } else if (byteArr.length < 3) {
            logger.error("Timeout or incomplete response");
            reject("Timeout or incomplete response");
        } else {
            const errCode = parseInt(byteArr.slice(0, 2), 16);
            if (errCode !== SP_ERROR.ERR_NONE) {
                logger.warn("Error code found");
                reject("Error code found");
            } else {
                const response = byteArr.slice(2, -1);
                await resolve(response);
            }
        }
    } catch (error) {
        logger.error(`Error in processQueue: ${error}`);
        reject(error);
    } finally {
        isProcessing = false;
        processQueue();
    }
}

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
