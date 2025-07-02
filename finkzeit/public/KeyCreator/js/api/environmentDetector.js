import logger from "../core/logger.js";

// Configuration object - all environment data in one place
const ENVIRONMENTS = {
    'erp-test': {
        name: 'ERP Test',
        country: 'austria',
        flag: '🧪',
        colors: { bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', text: 'white' }
    },
    'erp-at': {
        name: 'ERP Österreich',
        country: 'austria', 
        flag: '🇦🇹',
        colors: { bg: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)', text: 'black' }
    },
    'erp-ch': {
        name: 'ERP Schweiz',
        country: 'switzerland',
        flag: '🇨🇭', 
        colors: { bg: 'linear-gradient(135deg, #d52b1e 0%, #b71c1c 100%)', text: 'white' }
    }
};

const CONFIG = {
    BASE_API_PATH: "/api/method/finkzeit.finkzeit.doctype.transponder_configuration.transponder_configuration.",
    DEFAULT_ENV: 'erp-test',
    DEV_PORT: '3000'
};

let currentEnvironment = null;

// Core environment detection logic
function detectEnvironment() {
    try {
        const { hostname, port, search } = window.location;
        logger.debug(`Detecting environment from hostname: ${hostname}, port: ${port}`);
        
        // URL parameter override for local development
        const urlParams = new URLSearchParams(search);
        const envParam = urlParams.get('env');
        if (envParam && isLocalhost(hostname)) {
            return envParam;
        }
        
        // Localhost development server
        if (isLocalhost(hostname) && port === CONFIG.DEV_PORT) {
            return CONFIG.DEFAULT_ENV;
        }
        
        // Production - extract subdomain from hostname
        const subdomain = hostname.split('.')[0];
        logger.debug(`Extracted subdomain: ${subdomain} from hostname: ${hostname}`);
        return subdomain;
        
    } catch (error) {
        logger.error('Error detecting environment:', error);
        return CONFIG.DEFAULT_ENV;
    }
}

// Helper functions
function isLocalhost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1';
}

function getEnvironmentConfig(env) {
    return ENVIRONMENTS[env] || {
        name: env,
        country: 'austria',
        flag: '🌐',
        colors: { bg: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)', text: '#495057' }
    };
}

// Public API
export function getCurrentEnvironment() {
    if (!currentEnvironment) {
        currentEnvironment = detectEnvironment();
    }
    return currentEnvironment;
}

export function getEnvironmentDisplayName() {
    const env = getCurrentEnvironment();
    const config = getEnvironmentConfig(env);
    return config.name;
}

export function getEnvironmentCountry() {
    const env = getCurrentEnvironment();
    const config = getEnvironmentConfig(env);
    return config.country;
}

export function getEnvironmentBaseUrl() {
    const { hostname, port, protocol } = window.location;
    
    if (isLocalhost(hostname) && port === CONFIG.DEV_PORT) {
        return `http://localhost:${CONFIG.DEV_PORT}${CONFIG.BASE_API_PATH}`;
    }
    
    return `${protocol}//${hostname}${CONFIG.BASE_API_PATH}`;
}

export function updateEnvironmentDisplay() {
    const env = getCurrentEnvironment();
    const config = getEnvironmentConfig(env);
    
    // Find or create display element
    let envDisplay = document.getElementById('environment-display');
    if (!envDisplay) {
        envDisplay = document.createElement('div');
        envDisplay.id = 'environment-display';
        envDisplay.className = 'environment-display';
        
        const bottomControls = document.querySelector('.bottom-controls');
        if (bottomControls) {
            bottomControls.insertBefore(envDisplay, bottomControls.firstChild);
        }
    }
    
    // Update display
    envDisplay.innerHTML = `
        <div class="env-badge" style="background: ${config.colors.bg}; color: ${config.colors.text}">
            <span class="env-icon">${config.flag}</span>
            <span class="env-text">${config.name}</span>
        </div>
    `;
    
    logger.debug(`Environment display updated: ${config.name}`);
}

// Initialize on module load
currentEnvironment = detectEnvironment();

// Global testing function
window.testEnvironment = function(env) {
    const validEnvs = Object.keys(ENVIRONMENTS);
    const shortToFull = { at: 'erp-at', ch: 'erp-ch', test: 'erp-test' };
    
    const targetEnv = shortToFull[env] || env;
    
    if (validEnvs.includes(targetEnv)) {
        currentEnvironment = targetEnv;
        updateEnvironmentDisplay();
        console.log(`Environment switched to: ${currentEnvironment}`);
    } else {
        console.log(`Available environments: ${validEnvs.join(', ')} or short: at, ch, test`);
    }
}; 