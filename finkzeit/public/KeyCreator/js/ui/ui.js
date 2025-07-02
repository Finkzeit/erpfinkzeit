import logger from "../core/logger.js";

export function initializeUI() {
    logger.debug("Initializing elements");
    const elements = {
        firmenSelect: document.querySelector("#firmen"),
        numberInput: document.querySelector("#number"),
        ui: document.querySelector("#uiList"),
        connectReaderButton: document.getElementById("connectReaderButton"),
    };
    logger.debug("Elements initialized:", elements);
    return elements;
}

export function addEventListeners(elements, startSession, handleManualNumberChange, handleConnectReader) {
    logger.debug("Adding event listeners");
    elements.numberInput.addEventListener("change", handleManualNumberChange);
    elements.connectReaderButton.addEventListener("click", handleConnectReader);
    $("#firmen").on("change", startSession);
    logger.debug("Event listeners added");
}

let sessionInfo = {
    status: "Keine Firma ausgewählt",
    number: "Nummer nicht gesetzt",
    tags: {},
    requiredTech: [],
    detectedTech: [],
    wrongTag: null,
    actions: [],
    sessionResult: "ausstehend",
};

const observers = [];

export function notifyObservers() {
    observers.forEach((callback) => callback(sessionInfo));
}

export function updateSessionInfo(type, data) {
    const updaters = {
        status: () => (sessionInfo.status = data),
        requiredTech: () => (sessionInfo.requiredTech = data),
        detectedTech: () => (sessionInfo.detectedTech = data),
        number: () => (sessionInfo.number = data),
        tag: () => (sessionInfo.tags[data.type] = data),
        action: () => {
            if (sessionInfo.actions.length === 0 || data !== sessionInfo.actions[sessionInfo.actions.length - 1]) {
                sessionInfo.actions.push(data);
            }
        },
        wrongTag: () => (sessionInfo.wrongTag = data),
        clearTags: () => {
            sessionInfo.tags = {};
            sessionInfo.wrongTag = null;
        },
        reset: () => {
            const currentActions = sessionInfo.actions; // Store the current actions
            sessionInfo = {
                status: "Keine Firma ausgewählt",
                requiredTech: [],
                detectedTech: [],
                number: "Nummer nicht gesetzt",
                tags: {},
                actions: currentActions, // Keep the current actions
                wrongTag: null,
                sessionResult: "ausstehend",
            };
        },
        sessionResult: () => (sessionInfo.sessionResult = data),
    };

    if (updaters[type]) {
        updaters[type]();
        notifyObservers();
    } else {
        logger.warn(`Unknown update type: ${type}`);
    }
}

function subscribeToSessionUpdates(callback) {
    observers.push(callback);
}

function updateProgressDisplay() {
    const uiList = document.getElementById("uiList");
    uiList.innerHTML = ""; // Clear existing content

    const sections = [createCurrentStatusSection(), createDetectedTagsSection(), createActionsSection()];

    sections.forEach((section) => uiList.appendChild(section));
}

function createCurrentStatusSection() {
    const currentStatus = document.createElement("div");
    
    // Check if number has a value and is not the default
    const hasNumber = sessionInfo.number && sessionInfo.number !== "Nummer nicht gesetzt";
    const numberStyle = hasNumber 
        ? 'font-size: 64px; font-weight: bold; color: black; text-align: center;'
        : '';
    
    currentStatus.innerHTML = `
        <p><strong>Nummer:</strong> ${hasNumber ? `<span style="${numberStyle}">${sessionInfo.number}</span>` : sessionInfo.number}</p>
        <p><strong>Status:</strong> ${sessionInfo.status}</p>
        <p><strong>Erforderliche Technologien:</strong> ${sessionInfo.requiredTech.join(", ")}</p>
        <p><strong>Ergebnis:</strong> ${sessionInfo.sessionResult}</p>
    `;
    return currentStatus;
}

function createDetectedTagsSection() {
    const detectedTags = document.createElement("div");
    detectedTags.innerHTML = `
        <br>
        <h3>Erkannte Tags</h3>
        <ul>
            ${sessionInfo.requiredTech
                .map((tech) => {
                    const tag = sessionInfo.tags[tech.toLowerCase()];
                    if (tag) {
                        switch (tag.status) {
                            case "Abgeschlossen":
                                return `<li>${tech}: UID: ${tag.uid}, Status: Schlüssel ${sessionInfo.number} fertig, neuen Schlüssel auf den Leser legen</li>`;
                            case "Suche":
                                return `<li>${tech}: Suchen</li>`;
                            default:
                                return `<li>${tech}: UID: ${tag.uid}, Status: ${tag.status}</li>`;
                        }
                    } else {
                        return `<li>${tech}: Suchen</li>`;
                    }
                })
                .join("")}
            ${sessionInfo.wrongTag ? `<li style="color: red;">Falscher Tag erkannt: ${sessionInfo.wrongTag}</li>` : ""}
        </ul>
    `;
    return detectedTags;
}

function createActionsSection() {
    const actions = document.createElement("div");
    const uniqueActions = [];
    let lastAction = null;

    for (const action of sessionInfo.actions) {
        if (action !== lastAction) {
            uniqueActions.unshift(action);
            lastAction = action;
        }
    }

    actions.innerHTML = `
        <br>
        <h3>Letzte Aktionen</h3>
        <ul>
            ${uniqueActions
                .slice(0, 2)
                .map((action) => `<li>${action}</li>`)
                .join("")}
        </ul>
        <br>
        <h3>Alle Aktionen</h3>
        <div class="all-actions-container" style="max-height: 180px; overflow-y: auto;">
            <ul>
                ${sessionInfo.actions
                    .slice()
                    .reverse()
                    .map((action) => `<li>${action}</li>`)
                    .join("")}
            </ul>
        </div>
    `;
    return actions;
}

// Subscribe to session updates
subscribeToSessionUpdates(updateProgressDisplay);
