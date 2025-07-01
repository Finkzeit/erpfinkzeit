import logger from "./logger.js";

let currentCountry = "austria"; // Default to Austria

export function initializeCountrySelector() {
    logger.debug("Initializing country selector");
    
    const austriaBtn = document.getElementById("austriaMode");
    const switzerlandBtn = document.getElementById("switzerlandMode");
    
    if (!austriaBtn || !switzerlandBtn) {
        logger.error("Country selector buttons not found");
        return;
    }
    
    // Set initial state
    updateCountryMode(currentCountry);
    
    // Add event listeners
    austriaBtn.addEventListener("click", () => {
        logger.debug("Austria mode selected");
        setCountryMode("austria");
    });
    
    switzerlandBtn.addEventListener("click", () => {
        logger.debug("Switzerland mode selected");
        setCountryMode("switzerland");
    });
    
    logger.debug("Country selector initialized");
}

export function setCountryMode(country) {
    if (country !== "austria" && country !== "switzerland") {
        logger.warn(`Invalid country mode: ${country}`);
        return;
    }
    
    // Don't do anything if it's the same country
    if (currentCountry === country) {
        logger.debug(`Country already set to: ${country}`);
        return;
    }
    
    logger.debug(`Switching country from ${currentCountry} to ${country}`);
    currentCountry = country;
    updateCountryMode(country);
    
    // Store in localStorage for persistence
    localStorage.setItem("selectedCountry", country);
    
    // Nuke everything and start fresh
    if (window.resetApplication) {
        logger.debug("Resetting application due to country change");
        window.resetApplication();
    } else {
        logger.warn("resetApplication function not available");
    }
    
    // Notify ERP API about country change
    if (window.erpRestApi) {
        window.erpRestApi.setCountry(country);
        logger.debug(`ERP API notified of country change to: ${country}`);
    } else {
        logger.warn("ERP API not available for country change notification");
    }
    
    // Show country change notification
    showCountryChangeNotification(country);
}

function showCountryChangeNotification(country) {
    const countryName = country === "austria" ? "Österreich" : "Schweiz";
    logger.debug(`Showing country change notification for: ${countryName}`);
    
    // Add a visual notification to the UI
    const notification = document.createElement("div");
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        z-index: 1000;
        font-weight: bold;
        animation: slideIn 0.5s ease-out;
    `;
    
    notification.textContent = `Land gewechselt zu ${countryName}`;
    
    // Add CSS animation
    const style = document.createElement("style");
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

function updateCountryMode(country) {
    const austriaBtn = document.getElementById("austriaMode");
    const switzerlandBtn = document.getElementById("switzerlandMode");
    
    if (country === "austria") {
        austriaBtn.classList.add("active");
        switzerlandBtn.classList.remove("active");
    } else {
        switzerlandBtn.classList.add("active");
        austriaBtn.classList.remove("active");
    }
}

export function getCurrentCountry() {
    return currentCountry;
}

// Load saved country preference on page load
document.addEventListener("DOMContentLoaded", () => {
    const savedCountry = localStorage.getItem("selectedCountry");
    if (savedCountry && (savedCountry === "austria" || savedCountry === "switzerland")) {
        currentCountry = savedCountry;
    }
}); 