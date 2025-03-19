/**
 * Utility module for processing LLM queries in parallel
 */
import { createLlmInstance } from './apiServices';

/**
 * Process multiple LLM queries in parallel
 * @param {Array} models - Array of model names to query
 * @param {string} prompt - The prompt to send to all models
 * @param {Object} options - Additional options
 * @param {Function} getSystemPromptForModel - Function to get system prompt for a model
 * @param {Function} getTemperatureForModel - Function to get temperature for a model
 * @param {Array} sources - Array of sources to include with results
 * @returns {Object} - Object mapping model names to results
 */
export const processModelsInParallel = async (
  models, 
  prompt, 
  {
    getSystemPromptForModel = () => '',
    getTemperatureForModel = () => 0,
    sources = []
  }
) => {
  // Create an array of promises for querying multiple models in parallel
  const promises = (models || []).map(async (modelName) => {
    const startTime = Date.now();
    try {
      // Get Ollama endpoint from localStorage
      const ollamaEndpoint = localStorage.getItem('ollamaEndpoint') || 'http://localhost:11434';
      
      // Create LLM instance with appropriate configuration
      const llm = createLlmInstance(modelName, getSystemPromptForModel(modelName), {
        ollamaEndpoint: ollamaEndpoint,
        temperature: getTemperatureForModel(modelName)
      });
      
      // Call the LLM with the prompt
      const answer = await llm.invoke(prompt);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // Get the answer text, handling both object and string responses
      const answerText = answer && typeof answer === 'object' ? answer.text : (answer || '');
      
      return {
        modelName,
        success: true,
        response: {
          text: answerText,
          sources: sources || []
        },
        metrics: {
          responseTime,
          elapsedTime: endTime - startTime,
          tokenUsage: {
            estimated: true,
            input: Math.round(prompt.length / 4),
            output: Math.round(answerText.length / 4),
            total: Math.round(prompt.length / 4) + Math.round(answerText.length / 4)
          }
        }
      };
    } catch (error) {
      console.error(`Error processing model ${modelName}:`, error);
      
      // Handle specific API errors
      let errorMessage = 'Unknown error occurred';
      if (error.message?.includes('overloaded') || error.message?.includes('529')) {
        errorMessage = 'Service is currently overloaded. Please try again later.';
      } else if (error.message?.includes('rate limit')) {
        errorMessage = 'Rate limit exceeded. Please wait a moment before trying again.';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Request timed out. Please try again.';
      } else if (error.message?.includes('unauthorized') || error.message?.includes('401')) {
        errorMessage = 'Authentication error. Please check your API keys.';
      }
      
      return {
        modelName,
        success: false,
        error: errorMessage,
        response: {
          text: `Error: ${errorMessage}`,
          sources: sources || []
        },
        metrics: {
          responseTime: Date.now() - startTime,
          elapsedTime: Date.now() - startTime,
          tokenUsage: {
            estimated: true,
            input: Math.round(prompt.length / 4),
            output: 0,
            total: Math.round(prompt.length / 4)
          }
        }
      };
    }
  });

  // Wait for all promises to resolve
  const results = await Promise.all(promises);

  // Separate successful responses and errors
  const responses = {};
  const metricsMap = {};

  results.forEach(result => {
    if (result.success) {
      responses[result.modelName] = result.response;
      metricsMap[result.modelName] = result.metrics;
    } else {
      responses[result.modelName] = result.response;
      metricsMap[result.modelName] = result.metrics;
    }
  });

  return {
    responses: responses || {},
    metrics: metricsMap || {}
  };
}; 