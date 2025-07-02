import logger from "./logger.js";

// Base API path - same for all environments
const BASE_API_PATH = "/api/method/finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration.";

// Environment display names
const ENVIRONMENT_NAMES = {
    'erp-test': 'ERP Test',
    'erp-at': 'ERP Österreich', 
    'erp-ch': 'ERP Schweiz'
};

// Default environment
const DEFAULT_ENVIRONMENT = 'erp-test';

let currentEnvironment = null;

export function detectEnvironment() {
    try {
        const hostname = window.location.hostname;
        const port = window.location.port;
        logger.debug(`Detecting environment from hostname: ${hostname}, port: ${port}`);
        
        // Check if we're on localhost development server
        if (hostname === 'localhost' && port === '3000') {
            currentEnvironment = DEFAULT_ENVIRONMENT;
            logger.debug(`Localhost development detected, using default environment: ${currentEnvironment}`);
            return currentEnvironment;
        }
        
        // Use the hostname directly as the environment for production
        currentEnvironment = hostname;
        logger.debug(`Environment set to hostname: ${currentEnvironment}`);
        return currentEnvironment;
        
    } catch (error) {
        logger.error('Error detecting environment:', error);
        currentEnvironment = DEFAULT_ENVIRONMENT;
        return currentEnvironment;
    }
}

export function getCurrentEnvironment() {
    if (!currentEnvironment) {
        return detectEnvironment();
    }
    return currentEnvironment;
}

export function getEnvironmentDisplayName() {
    const env = getCurrentEnvironment();
    
    // For localhost development, show the fallback environment name
    if (env === 'localhost' || env === '127.0.0.1') {
        return ENVIRONMENT_NAMES[DEFAULT_ENVIRONMENT];
    }
    
    // For known environments, show the display name
    if (ENVIRONMENT_NAMES[env]) {
        return ENVIRONMENT_NAMES[env];
    }
    
    // For unknown environments, show the hostname
    return env;
}

export function getEnvironmentCountry() {
    const env = getCurrentEnvironment();
    
    // For localhost development, use the default environment's country
    if (env === 'localhost' || env === '127.0.0.1') {
        return 'austria';
    }
    
    // Check if it's a Swiss environment
    if (env.includes('ch') || env === 'erp-ch') {
        return 'switzerland';
    }
    
    return 'austria';
}

export function getEnvironmentBaseUrl() {
    const hostname = window.location.hostname;
    const port = window.location.port;
    
    // If we're on localhost development server, use localhost:3000
    if (hostname === 'localhost' && port === '3000') {
        const baseUrl = `http://localhost:3000${BASE_API_PATH}`;
        logger.debug(`Using localhost development URL: ${baseUrl}`);
        return baseUrl;
    }
    
    // For production, use the current hostname with current protocol
    const protocol = window.location.protocol;
    const baseUrl = `${protocol}//${hostname}${BASE_API_PATH}`;
    logger.debug(`Using production URL: ${baseUrl}`);
    return baseUrl;
}

export function updateEnvironmentDisplay() {
    const env = getCurrentEnvironment();
    const displayName = getEnvironmentDisplayName();
    
    // Create or update environment display in the bottom controls
    let envDisplay = document.getElementById('environment-display');
    if (!envDisplay) {
        envDisplay = document.createElement('div');
        envDisplay.id = 'environment-display';
        envDisplay.className = 'environment-display';
        
        // Insert in the bottom controls area
        const bottomControls = document.querySelector('.bottom-controls');
        if (bottomControls) {
            // Insert at the beginning of bottom controls
            bottomControls.insertBefore(envDisplay, bottomControls.firstChild);
        }
    }
    
    // Set the environment display content
    envDisplay.innerHTML = `
        <div class="env-badge">
            <span class="env-icon">🌐</span>
            <span class="env-text">${displayName}</span>
        </div>
    `;
    
    logger.debug(`Environment display updated: ${displayName}`);
}

// Initialize environment detection when module loads
detectEnvironment(); 