export class Logger {
    constructor(isDevelopment = true) {
        this.isDevelopment = isDevelopment;
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
        if (this.isDevelopment) {
            console.debug("[DEBUG]", ...args);
        }
    }
}

// Create a default instance
const isDevelopment = true; // Set this to false if in production
const logger = new Logger(isDevelopment);

// Export the default instance
export default logger;
