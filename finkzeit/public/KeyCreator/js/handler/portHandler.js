import logger from "../core/logger.js";

export class SerialPort {
    #port = undefined;
    #usbVendorId = 2520;
    #baudRate = 115200;
    #onConnectionChange = null;

    #encoder = new TextEncoder();
    #decoder = new TextDecoder();

    constructor(onConnectionChange = null) {
        if (navigator.serial === undefined) {
            throw new Error("Web Serial API not supported");
        }

        this.#onConnectionChange = onConnectionChange;
        navigator.serial.addEventListener("connect", this.#connect.bind(this));
        navigator.serial.addEventListener("disconnect", this.#disconnect.bind(this));
    }

    async connect() {
        if (this.#checkPort()) {
            return;
        }

        try {
            // First try to get an already authorized port
            const ports = await navigator.serial.getPorts();
            if (ports.length > 0) {
                this.#port = ports[0];
                await this.#open();
                logger.info("Reconnected to the most recently accessed port");
                return;
            }

            // If no authorized ports, request a new one
            await this.#requestPort();
        } catch (error) {
            logger.error("Failed to connect to port:", error);
            throw error;
        }
    }

    write(data) {
        if (!this.#checkPort()) {
            throw new Error("No port connected");
        }

        const writer = this.#port.writable.getWriter();
        try {
            const encoded = this.#encoder.encode(data);
            writer.write(encoded);
        } catch (error) {
            logger.error("Write failed:", error);
            throw error;
        } finally {
            writer.releaseLock();
        }
    }

    read(options = {}) {
        if (!this.#checkPort()) {
            throw new Error("No port connected");
        }

        const { timeout = 5000, delimiter = "\r", maxLength = 1024 } = options;

        // Synchronous wrapper around async read
        return new Promise((resolve, reject) => {
            const reader = this.#port.readable.getReader();
            let response = "";
            const startTime = Date.now();

            const readChunk = () => {
                reader
                    .read()
                    .then(({ value, done }) => {
                        if (done) {
                            reader.releaseLock();
                            // If we have some response but no delimiter, return what we have
                            if (response.length > 0) {
                                resolve(response);
                            } else {
                                reject(new Error("Stream ended unexpectedly"));
                            }
                            return;
                        }

                        const chunk = this.#decoder.decode(value, { stream: true });
                        response += chunk;

                        // Check for delimiter
                        if (response.includes(delimiter)) {
                            this.#decoder.decode(); // Final decode
                            reader.releaseLock();
                            resolve(response);
                            return;
                        }

                        // Check for maximum length
                        if (response.length > maxLength) {
                            reader.releaseLock();
                            reject(new Error("Response exceeded maximum length"));
                            return;
                        }

                        // Check timeout
                        if (Date.now() - startTime >= timeout) {
                            reader.releaseLock();
                            // If we have some response but no delimiter, return what we have
                            if (response.length > 0) {
                                resolve(response);
                            } else {
                                reject(new Error(`Read timeout: No delimiter '${delimiter}' found within ${timeout}ms`));
                            }
                            return;
                        }

                        // Continue reading
                        readChunk();
                    })
                    .catch((error) => {
                        reader.releaseLock();
                        logger.error("Read failed:", error);
                        reject(error);
                    });
            };

            readChunk();
        });
    }

    async #connect(event) {
        this.#port = event.target;
        await this.#open();
        if (this.#onConnectionChange) {
            this.#onConnectionChange(true);
        }
        logger.info("Serial port connected:", event);
    }

    async #open() {
        if (!this.#checkPort()) {
            throw new Error("Port is undefined");
        }
        await this.#port.open({ baudRate: this.#baudRate });
        if (this.#onConnectionChange) {
            this.#onConnectionChange(true);
        }
        logger.info("Port opened successfully");
    }

    #disconnect(event) {
        this.#close();
        if (this.#onConnectionChange) {
            this.#onConnectionChange(false);
        }
        logger.info("Serial port disconnected:", event);
    }

    #close() {
        if (!this.#checkPort()) {
            throw new Error("Port is undefined");
        }

        this.#port.close();
        this.#port = undefined;
        if (this.#onConnectionChange) {
            this.#onConnectionChange(false);
        }
        logger.info("Port closed successfully");
    }

    async #requestPort() {
        const filter = { usbVendorId: this.#usbVendorId };
        try {
            const port = await navigator.serial.requestPort({ filters: [filter] });
            return await this.#handleFulfilled(port);
        } catch (error) {
            this.#handleRejected(error);
            throw error;
        }
    }

    async #handleFulfilled(value) {
        this.#port = value;
        await this.#open(value);
        const info = value.getInfo();
        logger.info("Port connected successfully");
        return info;
    }

    #handleRejected(reason) {
        logger.error("Port request rejected:", reason);
    }

    #checkPort() {
        return this.#port !== undefined;
    }

    getInfo() {
        if (!this.#checkPort()) {
            throw new Error("Port is undefined");
        }
        return this.#port.getInfo();
    }

    getPortSelectedHandler() {
        return async () => await this.#requestPort();
    }
}
