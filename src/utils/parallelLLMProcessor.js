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
    getSystemPromptForModel, 
    getTemperatureForModel,
    sources = []
  }
) => {
  // Create an array of query promises for all models
  const modelQueries = models.map(model => {
    // Get the appropriate system prompt for this model
    const systemPrompt = getSystemPromptForModel(model);
    
    // Get the appropriate temperature for this model
    const temperature = getTemperatureForModel(model);
    
    // Get Ollama endpoint from localStorage
    const ollamaEndpoint = localStorage.getItem('ollamaEndpoint') || 'http://localhost:11434';
    
    // Create LLM instance with appropriate configuration
    const llm = createLlmInstance(model, systemPrompt, {
      ollamaEndpoint: ollamaEndpoint,
      temperature: temperature
    });
    
    // Return a promise that will resolve with model name and result
    return (async () => {
      try {
        const startTime = Date.now();
        
        // Call the LLM directly with the prompt
        const answer = await llm.invoke(prompt);
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        const elapsedTime = endTime - startTime; // Track actual elapsed time
        
        // Get the answer text
        const answerText = typeof answer === 'object' ? answer.text : answer;
        
        // Simple token estimation: 4 characters per token is a rough approximation
        const inputTokenEstimate = Math.ceil(prompt.length / 4);
        const outputTokenEstimate = Math.ceil(answerText.length / 4);
        const totalTokenEstimate = inputTokenEstimate + outputTokenEstimate;
        
        // Return the result for this model
        return {
          model,
          result: {
            answer: answerText,
            responseTime,
            sources: sources.map(doc => ({
              content: doc.pageContent,
              source: doc.metadata.source,
              namespace: doc.metadata.namespace || 'default'
            }))
          },
          metrics: {
            responseTime,
            elapsedTime, // Include actual elapsed time
            tokenUsage: {
              estimated: true,
              input: inputTokenEstimate,
              output: outputTokenEstimate,
              total: totalTokenEstimate
            }
          }
        };
      } catch (error) {
        window.console.error(`Error processing model ${model}:`, error);
        return {
          model,
          error: error.message
        };
      }
    })();
  });
  
  // Execute all model queries in parallel
  const results = await Promise.all(modelQueries);
  
  // Process the results into a map of model -> result
  const responsesMap = {};
  const systemPromptsUsed = {};
  const temperaturesUsed = {};
  const metricsMap = {};
  
  for (const result of results) {
    systemPromptsUsed[result.model] = getSystemPromptForModel(result.model);
    temperaturesUsed[result.model] = getTemperatureForModel(result.model);
    
    if (result.error) {
      // Handle error for this model
      responsesMap[result.model] = {
        answer: `Error: ${result.error}`,
        error: result.error,
        sources: sources.map(doc => ({
          content: doc.pageContent,
          source: doc.metadata.source,
          namespace: doc.metadata.namespace || 'default'
        }))
      };
      
      // Add empty metrics for error case
      metricsMap[result.model] = {
        responseTime: 0,
        elapsedTime: 0, // Add elapsedTime
        tokenUsage: {
          estimated: true,
          input: 0,
          output: 0,
          total: 0
        }
      };
    } else {
      // Store successful response
      responsesMap[result.model] = result.result;
      
      // Store metrics
      metricsMap[result.model] = {
        responseTime: result.result.responseTime,
        elapsedTime: result.metrics.elapsedTime, // Include elapsed time
        tokenUsage: result.metrics.tokenUsage
      };
      
      // Log response time for this model
      window.console.log(`${result.model} responded in ${result.result.responseTime}ms`);
    }
  }
  
  return {
    responses: responsesMap,
    metrics: {
      ...metricsMap,
      systemPrompts: systemPromptsUsed,
      temperatures: temperaturesUsed,
    }
  };
}; 