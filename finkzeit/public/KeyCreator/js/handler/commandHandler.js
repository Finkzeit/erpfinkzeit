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
    logger.info("PortHandler initialized and serial port opened.");
}

export async function sendCommand(command, paramStr) {
    return new Promise((resolve, reject) => {
        commandQueue.push({ command, paramStr, resolve, reject });
        logger.debug(`Command added to queue: ${command}, Params: ${paramStr}`);
        processQueue();
    });
}

async function processQueue() {
    if (isProcessing || commandQueue.length === 0) {
        return;
    }

    isProcessing = true;
    logger.debug("Processing command queue...");

    while (commandQueue.length > 0) {
        const { command, paramStr, resolve, reject } = commandQueue.shift();
        logger.info(`Processing command: ${command}, Params: ${paramStr}`);

        try {
            let byteArr = `${hex(command, 4)}${paramStr}\r`;
            logger.debug(`Sending command: ${byteArr}`);
            await portHandler.serialPortHandler.write(byteArr);

            byteArr = "";
            const timeout = Date.now() + 5000; // 5 seconds timeout

            while (Date.now() < timeout) {
                const bytes = await portHandler.serialPortHandler.read();
                byteArr += bytes;
                if (byteArr.endsWith("\r")) {
                    logger.debug(`Received response: ${byteArr}`);
                    break;
                }
                await new Promise((r) => setTimeout(r, 10)); // Small delay to prevent tight loop
            }

            if (!byteArr.endsWith("\r")) {
                throw new Error("No valid delimiter found in response");
            } else if (byteArr.length < 3) {
                throw new Error("Timeout or incomplete response received");
            } else {
                const errCode = parseInt(byteArr.slice(0, 2), 16);
                if (errCode !== SP_ERROR.ERR_NONE) {
                    throw new Error(`Error code received: ${errCode}`);
                } else {
                    const response = byteArr.slice(2, -1);
                    logger.info(`Command executed successfully, response: ${response}`);
                    resolve(response);
                }
            }
        } catch (error) {
            logger.error(`Error processing command: ${error.message}`);
            reject(error);
        }
    }

    isProcessing = false;
    logger.debug("Finished processing command queue.");
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
