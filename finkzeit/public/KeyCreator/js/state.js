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

let isFormatting = false;
const stateEmitter = new EventEmitter();

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
