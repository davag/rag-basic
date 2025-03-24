/**
 * Utility module for processing LLM queries in parallel
 */
import { createLlmInstance } from './apiServices';
import { defaultSettings } from '../config/llmConfig';
import axios from 'axios';

/**
 * Process multiple LLM queries in parallel
 * @param {Array} models - Array of model names to query
 * @param {string} prompt - The prompt to send to all models
 * @param {Object} options - Additional options
 * @param {Function} getSystemPromptForModel - Function to get system prompt for a model
 * @param {Function} getTemperatureForModel - Function to get temperature for a model
 * @param {Array} sources - Array of sources to include with results
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Object} - Object mapping model names to results
 */
export const processModelsInParallel = async (
  models, 
  prompt, 
  {
    getSystemPromptForModel = () => '',
    getTemperatureForModel = () => 0,
    sources = [],
    onProgress = null
  }
) => {
  // Create an array of promises for querying multiple models in parallel
  const promises = (models || []).map(async (modelName, index) => {
    const startTime = Date.now();
    
    // Report start of processing if callback exists
    if (onProgress) {
      onProgress({
        model: modelName,
        status: 'started',
        current: index + 1,
        total: models.length,
        progress: {
          completed: 0,
          pending: models.length,
          total: models.length
        }
      });
    }
    
    try {
      // Get Ollama endpoint from localStorage
      const ollamaEndpoint = localStorage.getItem('ollamaEndpoint') || defaultSettings.ollamaEndpoint;
      
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
      
      // Report completion if callback exists
      if (onProgress) {
        onProgress({
          model: modelName,
          status: 'completed',
          current: index + 1,
          total: models.length,
          progress: {
            completed: index + 1,
            pending: models.length - (index + 1),
            total: models.length
          }
        });
      }
      
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
      
      // Report error if callback exists
      if (onProgress) {
        onProgress({
          model: modelName,
          status: 'error',
          current: index + 1,
          total: models.length,
          progress: {
            completed: index + 1,
            pending: models.length - (index + 1),
            total: models.length
          }
        });
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

export class ParallelLLMProcessor {
  constructor(options = {}) {
    this.onProgressUpdate = options.onProgressUpdate || (() => {});
  }
  
  async processQuery({
    query,
    vectorStore,
    selectedModels,
    selectedNamespaces,
    promptSets,
    queryId = null // Add queryId parameter with default of null
  }) {
    // Validate inputs
    if (!query || !vectorStore || !selectedModels || !selectedNamespaces) {
      throw new Error('Missing required parameters for query processing');
    }
    
    // Start measuring total operation time
    const retrievalStartTime = Date.now();
    
    // Report progress
    this.updateProgress({
      step: 'Retrieving relevant documents',
      status: 'pending'
    });
    
    // Retrieve relevant documents from vector store
    const docs = await vectorStore.similaritySearch(query, 5);
    
    // Filter documents by namespace if needed
    const filteredDocs = selectedNamespaces.length > 0 ? 
      docs.filter(doc => {
        const docNamespace = doc.metadata?.namespace || 'default';
        return selectedNamespaces.includes(docNamespace);
      }) : 
      docs;
    
    // Format the context from retrieved documents
    const context = filteredDocs.map(doc => doc.pageContent).join('\n\n');
    
    // Create the prompt with context
    const prompt = `
Context information is below.
---------------------
${context}
---------------------
Given the context information and not prior knowledge, answer the question: ${query}
`;
    
    // Calculate retrieval time
    const retrievalEndTime = Date.now();
    const retrievalTime = retrievalEndTime - retrievalStartTime;
    
    // Create a proper separation of metadata and models in the response structure
    const response = {
      metadata: {
        retrievalTime,
        query,
        timestamps: {
          start: retrievalStartTime,
          end: retrievalEndTime
        }
      },
      models: {}
    };
    
    // Get Ollama endpoint from localStorage
    const ollamaEndpoint = localStorage.getItem('ollamaEndpoint') || defaultSettings.ollamaEndpoint;
    
    // Process each prompt set with all models in parallel
    for (const promptSet of promptSets) {
      const setKey = `Set ${promptSet.id}`;
      
      // Initialize the set container in models
      if (!response.models[setKey]) {
        response.models[setKey] = {};
      }
      
      // Report progress
      this.updateProgress({
        step: `Processing all models with prompt set ${promptSet.id}`,
        status: 'pending'
      });
      
      // Create promises for all models
      const modelPromises = selectedModels.map(model => {
        return this.processModel({
          model,
          prompt,
          systemPrompt: promptSet.systemPrompt,
          temperature: promptSet.temperature,
          ollamaEndpoint,
          sources: filteredDocs,
          setKey,
          queryId // Pass queryId to the processModel function
        });
      });
      
      // Wait for all models to complete
      const modelResults = await Promise.allSettled(modelPromises);
      
      // Process results
      modelResults.forEach((result, index) => {
        const model = selectedModels[index];
        
        if (result.status === 'fulfilled') {
          response.models[setKey][model] = result.value;
        } else {
          // Handle errors
          console.error(`Error processing model ${model}:`, result.reason);
          response.models[setKey][model] = {
            error: result.reason.message || 'Unknown error',
            sources: filteredDocs
          };
        }
      });
    }
    
    // Return the response with clear separation between metadata and models
    return response;
  }
  
  async processModel({
    model,
    prompt,
    systemPrompt,
    temperature,
    ollamaEndpoint,
    sources,
    setKey,
    queryId = null // Add queryId parameter with default of null
  }) {
    try {
      // Update progress
      this.updateProgress({
        model: `${model} / ${setKey}`,
        step: `Processing with ${model}`,
        status: 'pending'
      });
      
      // Start timer
      const startTime = Date.now();
      
      // Create LLM instance with custom options
      const llm = createLlmInstance(model, systemPrompt, {
        ollamaEndpoint,
        temperature,
        queryId // Pass queryId to the LLM instance
      });
      
      // Call the LLM with the prompt
      const answer = await llm.invoke(prompt);
      
      // End timer
      const endTime = Date.now();
      const elapsedTime = endTime - startTime;
      
      // Get the answer text
      const answerText = typeof answer === 'object' ? answer.text || answer.content : answer;
      
      // Estimate token usage if not provided by the model
      const tokenUsage = answer.tokenUsage || {
        estimated: true,
        input: Math.round(prompt.length / 4),
        output: Math.round(answerText.length / 4),
        total: Math.round((prompt.length + answerText.length) / 4)
      };
      
      // Extract cost if available in the model response
      const cost = answer.cost || 0;
      
      // Track token usage via API
      try {
        await axios.post('/api/cost-tracking/track-model-usage', {
          model,
          usage: tokenUsage,
          operation: 'chat',
          queryId
        });
        console.log(`Token usage tracking sent for ${model}`);
      } catch (error) {
        // Don't throw - just log the error and continue
        console.warn(`Error tracking token usage for ${model}:`, error.message);
      }
      
      // Update progress
      this.updateProgress({
        model: `${model} / ${setKey}`,
        step: `Completed ${model}`,
        status: 'completed'
      });
      
      // Return model response with metadata
      return {
        text: answerText,
        sources,
        elapsedTime,
        tokenUsage,
        cost
      };
    } catch (error) {
      // Update progress with error
      this.updateProgress({
        model: `${model} / ${setKey}`,
        step: `Error with ${model}: ${error.message}`,
        status: 'error'
      });
      
      // Re-throw the error to be handled by the caller
      throw error;
    }
  }
  
  updateProgress(data) {
    if (typeof this.onProgressUpdate === 'function') {
      this.onProgressUpdate(data);
    }
  }
} 