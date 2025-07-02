import logger from "../core/logger.js";

let isMuted = false;

export function initializeMuteToggle() {
    logger.debug("Initializing mute toggle");
    const muteToggleButton = document.getElementById("muteToggle");

    if (!muteToggleButton) {
        logger.error("Mute toggle button not found");
        return;
    }

    muteToggleButton.addEventListener("click", () => {
        logger.debug("Mute toggle button clicked");
        toggleMute();
    });

    logger.debug("Mute toggle initialized");
}

function toggleMute() {
    isMuted = !isMuted;
    const muteToggleButton = document.getElementById("muteToggle");
    const muteIcon = muteToggleButton.querySelector(".mute-icon");
    
    if (isMuted) {
        muteIcon.textContent = "🔇";
        muteToggleButton.setAttribute("data-mute", "on");
        muteToggleButton.setAttribute("aria-pressed", "true");
        logger.debug("Mute enabled");
    } else {
        muteIcon.textContent = "🔊";
        muteToggleButton.setAttribute("data-mute", "off");
        muteToggleButton.setAttribute("aria-pressed", "false");
        logger.debug("Mute disabled");
    }
}

export function isMutedState() {
    return isMuted;
}

// Wrapper functions for beepOk and beepError that respect mute state
export async function beepOkIfNotMuted() {
    if (!isMuted) {
        const { beepOk } = await import("./api.js");
        await beepOk();
    } else {
        logger.debug("Beep suppressed - mute is enabled");
    }
}

export async function beepErrorIfNotMuted() {
    if (!isMuted) {
        const { beepError } = await import("./api.js");
        await beepError();
    } else {
        logger.debug("Beep suppressed - mute is enabled");
    }
} 