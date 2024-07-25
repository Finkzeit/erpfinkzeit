const delimiter = "\r";
import logger from "../logger.js";

export class PortHandler {
    constructor() {
        if (!("serial" in navigator)) {
            logger.error("Web Serial API is not supported in your browser.");
            return;
        }

        this.serialPortHandler = new SerialPortHandler({ baudRate: 115200 }, this.#onDisconnect.bind(this));
    }

    #onDisconnect() {
        logger.info("Device disconnected.");
        this.#disconnectHandler();
    }

    async #disconnectHandler() {
        if (!this.serialPortHandler.isOpened) return;
        await this.serialPortHandler.close();
    }
}

class SerialPortHandler {
    constructor(options, onConnect, onDisconnect) {
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
        this.onConnect = onConnect;
        this.onDisconnect = onDisconnect;
        this.options = options;
        this.port = null;
        this.isOpened = false;
        this.writeQueue = Promise.resolve();
        this.readQueue = Promise.resolve();
        this.#setupListeners();
    }

    async open() {
        try {
            const ports = await navigator.serial.getPorts();
            if (ports.length > 0) {
                this.port = ports[0];
                await this.port.open(this.options);
                logger.info("Reconnected to the most recently accessed port");
            } else {
                this.port = await navigator.serial.requestPort();
                await this.port.open(this.options);
                logger.info("Port opened successfully");
            }

            this.isOpened = true;
            return this.port.getInfo();
        } catch (error) {
            logger.error("Failed to open port:", error);
            throw error;
        }
    }

    async close() {
        if (this.port) {
            try {
                await this.port.close();
                this.isOpened = false;
                logger.info("Port closed successfully");
            } catch (error) {
                logger.error("Failed to close port:", error);
            }
        }
    }

    async write(data) {
        if (!this.isOpened) {
            await this.open();
        }

        await this.clearBuffer(); // Clear the buffer before writing

        const writer = this.port.writable.getWriter();
        try {
            const encoded = this.encoder.encode(data);
            await writer.write(encoded);
        } catch (error) {
            logger.error("Failed to write data (Porthandler):", error);
            throw error;
        } finally {
            writer.releaseLock();
        }
    }

    async read() {
        if (!this.isOpened) {
            await this.open();
        }

        while (this.port.readable) {
            const reader = this.port.readable.getReader();
            let chunks = "";

            try {
                while (true) {
                    const { value, done } = await reader.read();
                    const decoded = this.decoder.decode(value);
                    chunks += decoded;

                    if (done || decoded.includes(delimiter)) {
                        break;
                    }
                }
                return chunks;
            } catch (error) {
                logger.error("Failed to read data (Porthandler):", error);
                throw error;
            } finally {
                reader.releaseLock();
            }
        }
    }

    async clearBuffer() {
        if (this.port && this.port.readable) {
            const reader = this.port.readable.getReader();
            const timeout = 5; // 5ms timeout to clear buffer
            let dataCleared = false;

            try {
                await Promise.race([
                    (async () => {
                        while (true) {
                            const { value, done } = await reader.read();
                            if (value) {
                                dataCleared = true;
                            }
                            if (done) {
                                break;
                            }
                        }
                    })(),
                    new Promise((resolve) => setTimeout(resolve, timeout)),
                ]);

                if (dataCleared) {
                    logger.debug("Buffer cleared");
                }
            } catch (error) {
                logger.error("Failed to clear buffer", error);
            } finally {
                reader.releaseLock();
            }
        }
    }

    #setupListeners() {
        navigator.serial.addEventListener("disconnect", this.onDisconnect);
    }
}
