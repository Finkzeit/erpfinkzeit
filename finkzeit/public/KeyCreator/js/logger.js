export class Logger {
    constructor(isProduction = false) {
        this.isProduction = isProduction;
    }

    info(...args) {
        console.log("[INFO]", ...args);
    }

    warn(...args) {
        console.warn("[WARN]", ...args);
    }

    error(...args) {
        console.error("[ERROR]", ...args);
    }

    debug(...args) {
        if (!this.isProduction) {
            console.debug("[DEBUG]", ...args);
        }
    }
}

// Create a default instance
const logger = new Logger(window.env?.NODE_ENV === "production");

// Export the default instance
export default logger;
