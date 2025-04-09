/**
 * Simple logger utility to standardize logging across the application.
 * Uses console methods but could be upgraded to a more robust solution if needed.
 */

// Create a simple createLogger function that returns an object with logging methods
const createLogger = (namespace = 'app') => {
  const formatMessage = (message) => {
    return `[${namespace}] ${message}`;
  };

  return {
    debug: (...args) => {
      if (process.env.REACT_APP_LOG_LEVEL === 'debug') {
        console.debug(formatMessage(args[0]), ...args.slice(1));
      }
    },
    info: (...args) => {
      console.info(formatMessage(args[0]), ...args.slice(1));
    },
    warn: (...args) => {
      console.warn(formatMessage(args[0]), ...args.slice(1));
    },
    error: (...args) => {
      console.error(formatMessage(args[0]), ...args.slice(1));
    }
  };
};

// Export individual log functions
const logDebug = (msg, ...args) => console.debug(msg, ...args);
const logInfo = (msg, ...args) => console.info(msg, ...args);
const logWarn = (msg, ...args) => console.warn(msg, ...args);
const logError = (msg, ...args) => console.error(msg, ...args);

// Use CommonJS exports
module.exports = {
  createLogger,
  logDebug,
  logInfo,
  logWarn,
  logError
}; 