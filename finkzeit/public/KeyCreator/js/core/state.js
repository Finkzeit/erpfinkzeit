import logger from "./logger.js";

class EventEmitter {
    constructor() {
        this.events = {};
    }

    on(event, listener) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
    }

    emit(event, ...args) {
        if (this.events[event]) {
            this.events[event].forEach((listener) => listener(...args));
        }
    }

    removeListener(event, listenerToRemove) {
        if (!this.events[event]) return;

        this.events[event] = this.events[event].filter((listener) => listener !== listenerToRemove);
    }
}

// Application state
let isFormatting = false;
let isReading = false;
let appActive = true;
let currentSessionId = 0;
let isSessionActive = false;

const stateEmitter = new EventEmitter();

// Formatting state management
export function getIsFormatting() {
    return isFormatting;
}

export function setIsFormatting(value) {
    isFormatting = value;
    stateEmitter.emit("formattingChange", value);
}

export function addFormattingChangeListener(callback) {
    stateEmitter.on("formattingChange", callback);
}

export function removeFormattingChangeListener(callback) {
    stateEmitter.removeListener("formattingChange", callback);
}

// Reading state management
export function getIsReading() {
    return isReading;
}

export function setIsReading(value) {
    isReading = value;
    stateEmitter.emit("readingChange", value);
}

export function addReadingChangeListener(callback) {
    stateEmitter.on("readingChange", callback);
}

export function removeReadingChangeListener(callback) {
    stateEmitter.removeListener("readingChange", callback);
}

// Application state management
export function isAppActive() {
    return appActive;
}

export function killApp() {
    logger.debug("=== NUKING APPLICATION ===");
    appActive = false;
    isSessionActive = false;
    currentSessionId++;
    stateEmitter.emit("appKilled");
    logger.debug("=== APPLICATION NUKED ===");
}

export function resetApp() {
    logger.debug("=== RESETTING APPLICATION ===");
    killApp();
    stateEmitter.emit("appReset");
    
    // Reactivate after reset
    setTimeout(() => {
        appActive = true;
        logger.debug("Application reactivated");
        stateEmitter.emit("appReactivated");
    }, 1000);
    
    logger.debug("=== APPLICATION RESET COMPLETE ===");
}

export function startNewSession() {
    currentSessionId++;
    isSessionActive = true;
    return currentSessionId;
}

export function isSessionValid(sessionId) {
    return appActive && isSessionActive && sessionId === currentSessionId;
}

export function addAppStateListener(event, callback) {
    stateEmitter.on(event, callback);
}

export function removeAppStateListener(event, callback) {
    stateEmitter.removeListener(event, callback);
}
