export class Logger {
    constructor() {
        // Automatically detect if we're in development (localhost) or production
        this.isProduction = !this.isLocalhost();
    }

    isLocalhost() {
        const hostname = window.location.hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1';
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
const logger = new Logger();

// Export the default instance
export default logger;
