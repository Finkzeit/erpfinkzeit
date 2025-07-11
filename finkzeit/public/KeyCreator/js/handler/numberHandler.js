import { NUM2TECH, DB2TECH } from "../constants/constants.js";
import logger from "../core/logger.js";
import { updateSessionInfo } from "../ui/ui.js";

class NumberHandler {
    constructor() {
        this.currentNumber = null;
        this.relevantKeys = [];
        this.allowedRange = { min: Infinity, max: -Infinity };
        this.inputElement = document.querySelector("#number");
    }

    reset() {
        this.currentNumber = null;
        this.relevantKeys = [];
        this.allowedRange = { min: Infinity, max: -Infinity };
        updateSessionInfo("number", "Nummer nicht gesetzt");
    }

    async initialize(transponderConfig) {
        this.relevantKeys = await transponderConfig.getRequiredKeys();
        logger.debug("Relevant keys:", this.relevantKeys);
        await this.setDefaultNumber();
    }

    readFromInput() {
        if (!this.inputElement) {
            logger.error("Input element not found. Make sure initialize() has been called.");
            updateSessionInfo("action", "Fehler: Nummern-Eingabeelement nicht gefunden");
            return;
        }

        this.currentNumber = parseInt(this.inputElement.value, 10) || this.currentNumber;
        logger.debug("Read number from input:", this.currentNumber);

        if (this.currentNumber != null) {
            updateSessionInfo("number", this.currentNumber.toString());
        }
    }

    writeToInput() {
        if (!this.inputElement) {
            logger.error("Input element not found. Make sure initialize() has been called.");
            updateSessionInfo("action", "Fehler: Nummern-Eingabeelement nicht gefunden");
            return;
        }

        this.inputElement.value = this.currentNumber;
        logger.debug("Written value to input element:", this.currentNumber);

        if (this.currentNumber != null) {
            updateSessionInfo("number", this.currentNumber.toString());
        }
    }

    async setDefaultNumber() {
        const translatedKeys = this.translateKeys(this.relevantKeys);
        let minNumber = Infinity;
        let maxNumber = -Infinity;

        for (const [rangeStartKey, chips] of Object.entries(NUM2TECH)) {
            const rangeStartInt = parseInt(rangeStartKey, 10);
            const rangeEndInt = rangeStartInt + 99999;

            if (translatedKeys.every((key) => chips.includes(key))) {
                minNumber = Math.min(minNumber, rangeStartInt);
                maxNumber = Math.max(maxNumber, rangeEndInt);
            }
        }

        this.allowedRange = {
            min: minNumber === Infinity ? 0 : minNumber,
            max: maxNumber === -Infinity ? 999999 : maxNumber,
        };

        const numberInput = document.querySelector("#number");
        if (numberInput) {
            numberInput.placeholder = `${this.allowedRange.min} bis ${this.allowedRange.min + 99999}`;
            logger.debug("Set placeholder to:", numberInput.placeholder);
            updateSessionInfo("action", `Nummernbereich festgelegt: ${numberInput.placeholder}`);
        }

        return this.currentNumber;
    }

    getCurrentNumber() {
        return this.currentNumber;
    }

    incrementNumber(inputElement) {
        if (this.currentNumber !== null) {
            this.currentNumber += 1;
            this.writeToInput();
            logger.debug("Incremented number:", this.currentNumber);

            if (this.currentNumber != null) {
                updateSessionInfo("number", this.currentNumber.toString());
            }
        }
    }

    async validateNumber(number) {
        if (number === null || number === undefined) {
            logger.error("Number is null or undefined");
            updateSessionInfo("action", "Fehler: Nummer ist null oder undefiniert");
            return false;
        }

        if (number.toString().length !== 6) {
            logger.error(`Number ${number} must be 6 digits long`);
            updateSessionInfo("action", `Fehler: Nummer ${number} muss 6-stellig sein`);
            return false;
        }

        this.currentNumber = number;
        if (this.currentNumber != null) {
            updateSessionInfo("number", this.currentNumber.toString());
        }

        return true;
    }

    translateKeys(keys) {
        return keys.map((key) => DB2TECH[key]);
    }
}

export default new NumberHandler();
