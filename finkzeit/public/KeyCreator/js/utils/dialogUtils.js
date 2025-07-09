import logger from "../core/logger.js";

/**
 * Shows a dialog with the given message
 * @param {string} message - The message to display
 * @returns {Object} - Object containing overlay and dialogElement
 */
export function showDialog(message) {
    logger.debug("Showing dialog:", message);
    const overlay = document.createElement("div");
    overlay.className = "overlay";

    const dialogElement = document.createElement("div");
    dialogElement.className = "dialog";
    dialogElement.innerHTML = `
        <p id="dialogText">${message}</p>
        <p id="countdownText" style="display: none; color: #666; font-size: 0.9em; margin-top: 10px;"></p>
        <div id="dialogButtons">
            <button class="btn" id="cancelBtn">Abbrechen</button>
        </div>
    `;

    overlay.appendChild(dialogElement);
    document.body.appendChild(overlay);

    document.getElementById("cancelBtn").addEventListener("click", () => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    });

    return { overlay, dialogElement };
}

/**
 * Updates the text content of a dialog
 * @param {Object} dialog - The dialog object from showDialog
 * @param {string} message - The new message to display
 */
export function updateDialogText(dialog, message) {
    logger.debug("Updating dialog text:", message);
    const textElement = dialog.dialogElement.querySelector("#dialogText");
    textElement.textContent = message;
}

/**
 * Updates the countdown text in a dialog
 * @param {Object} dialog - The dialog object from showDialog
 * @param {string} message - The countdown message to display
 */
export function updateCountdownText(dialog, message) {
    logger.debug("Updating countdown text:", message);
    const countdownElement = dialog.dialogElement.querySelector("#countdownText");
    if (countdownElement) {
        countdownElement.textContent = message;
        countdownElement.style.display = "block";
    }
}

/**
 * Updates the dialog message globally (for use when dialog object is not available)
 * @param {string} message - The message to display
 */
export function updateDialogMessage(message) {
    logger.debug("Updating dialog message:", message);
    const dialogText = document.getElementById("dialogText");
    if (dialogText) {
        dialogText.textContent = message;
    } else {
        console.log("Dialog message:", message);
    }
}

/**
 * Gets user confirmation with optional additional button
 * @param {Object} dialog - The dialog object from showDialog
 * @param {boolean} showActionButton - Whether to show an action button
 * @param {string} actionButtonText - Text for the action button (default: "Formatieren")
 * @returns {Promise<boolean>} - Promise that resolves to true if action button clicked, false if cancelled
 */
export function getConfirmation(dialog, showActionButton, actionButtonText = "Formatieren") {
    return new Promise((resolve) => {
        const buttonsContainer = dialog.dialogElement.querySelector("#dialogButtons");
        if (showActionButton) {
            const actionButton = document.createElement("button");
            actionButton.className = "btn";
            actionButton.id = "actionBtn";
            actionButton.textContent = actionButtonText;
            actionButton.addEventListener("click", () => {
                buttonsContainer.innerHTML = "";
                resolve(true);
            });
            buttonsContainer.insertBefore(actionButton, buttonsContainer.firstChild);
        }

        const cancelButton = document.getElementById("cancelBtn");
        cancelButton.addEventListener("click", () => {
            buttonsContainer.innerHTML = "";
            resolve(false);
        });
    });
}
