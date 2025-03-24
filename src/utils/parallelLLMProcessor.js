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
    // Start timer outside try block so it's available in catch
    const startTime = Date.now();
    
    try {
      // Update progress
      this.updateProgress({
        model: `${model} / ${setKey}`,
        step: `Processing with ${model}`,
        status: 'pending'
      });
      
      // Create LLM instance with custom options
      const llm = this.createModelInstance(model, systemPrompt, temperature, queryId);
      
      // Call the LLM with the prompt
      console.log(`[DEBUG] Processing model ${model} with prompt length ${prompt.length}`);
      const answer = await llm.invoke(prompt);
      console.log(`[DEBUG] Received answer from ${model}:`, typeof answer);
      
      // End timer
      const endTime = Date.now();
      const elapsedTime = endTime - startTime;
      
      // Get the answer text with special handling for different return types
      let answerText;
      if (answer === null || answer === undefined) {
        console.error(`[ERROR] ${model} returned null or undefined response`);
        answerText = `Error: ${model} returned an empty response`;
      } else if (typeof answer === 'object') {
        // Log the full object structure for debugging
        console.log(`[DEBUG] ${model} returned an object:`, JSON.stringify(answer, null, 2));
        
        if (model.includes('o3-mini')) {
          // Use specialized helper for extracting content from o3-mini model responses
          answerText = this.extractO3MiniContent(answer);
          
          // If we still don't have an answer, try directly checking the response structure
          if (!answerText || answerText.trim() === '') {
            console.log('[o3-mini DEBUG] Attempting to extract content directly from response structure');
            
            // Check for standard OpenAI API response format
            if (answer.id && answer.choices && answer.choices.length > 0 && answer.choices[0].message?.content) {
              answerText = answer.choices[0].message.content;
              console.log('[o3-mini DEBUG] Extracted content directly from choices[0].message.content:', 
                         answerText.substring(0, 100) + '...');
            }
          }
          
          // If we still don't have an answer, provide a helpful fallback message
          if (!answerText || answerText.trim() === '') {
            answerText = `The model processed your query but returned an empty response. This may indicate the response was truncated due to token limits. Try a shorter prompt or a different model.`;
          }
        } else {
          // Standard extraction for non-o3-mini models
          answerText = answer.text || answer.content || JSON.stringify(answer);
        }
      } else {
        answerText = answer;
      }
      
      // Special handling for o3-mini model - more detailed logging
      if (model.includes('o3-mini')) {
        console.log(`[o3-mini DEBUG] Response type: ${typeof answer}`);
        
        // For empty responses with completion tokens (common with o3-mini)
        if ((!answerText || answerText.trim() === '')) {
          console.error('[o3-mini ERROR] Empty response content');
          
          // Use the special helper to try extracting content from various places
          const extractedContent = this.extractO3MiniContent(answer);
          if (extractedContent && extractedContent !== answerText) {
            console.log('[o3-mini DEBUG] Found alternative content:', extractedContent.substring(0, 100) + '...');
            answerText = extractedContent;
          } else {
            // Try to extract more information from raw response if available
            let responseInfo = '';
            if (typeof answer === 'object') {
              const usage = answer.usage || {};
              const finishReason = answer.choices?.[0]?.finish_reason;
              
              if (finishReason === 'length') {
                responseInfo = ` The model reached its token limit (${usage.completion_tokens || 'unknown'} tokens used).`;
              }
              
              if (answer.cost) {
                responseInfo += ` Cost: $${answer.cost.toFixed(4)}.`;
              }
            }
            
            answerText = `The o3-mini model didn't return a valid response.${responseInfo} Try using a shorter prompt or a different model like azure-gpt-4o-mini.`;
          }
        } else {
          console.log(`[o3-mini DEBUG] Response preview: ${answerText?.substring(0, 100)}...`);
        }
      }
      
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
        cost,
        rawResponse: answer // Add the raw response for more detailed processing downstream
      };
    } catch (error) {
      // Special logging for o3-mini errors
      if (model.includes('o3-mini')) {
        console.error(`[o3-mini ERROR] Failed to process: ${error.message}`);
        console.error('[o3-mini ERROR] Error details:', error);
        
        // Return friendly error message specifically for o3-mini
        return {
          text: `The o3-mini model encountered an error: ${error.message}. This model is in preview and may have limitations. Please try again or use a different model like azure-gpt-4o-mini.`,
          sources,
          elapsedTime: Date.now() - startTime,
          error: true,
          tokenUsage: {
            estimated: true,
            input: Math.round(prompt.length / 4),
            output: 0,
            total: Math.round(prompt.length / 4)
          },
          cost: 0
        };
      }
      
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
  
  createModelInstance(modelId, systemPrompt, temperature, queryId) {
    const options = {
      temperature,
      queryId
    };
    
    // For o3-mini models, omit temperature parameter as it's not supported
    if (modelId.includes('o3-mini')) {
      delete options.temperature;
      console.log(`[MODEL PROCESSOR] Omitting temperature parameter for ${modelId} as it's not supported`);
      
      // Add a hint to encourage detailed reasoning while being mindful of the model's capabilities
      if (systemPrompt && !systemPrompt.includes('detailed')) {
        options.systemPrompt = (systemPrompt || '') + ' Provide detailed reasoning in your answer while staying on topic.';
      } else {
        options.systemPrompt = systemPrompt;
      }
    }
    
    return createLlmInstance(modelId, systemPrompt, options);
  }
  
  /**
   * Special helper to extract any useful content from o3-mini response
   * @param {*} answer - The raw model response
   * @returns {string} - The extracted content or a fallback message
   */
  extractO3MiniContent(answer) {
    if (typeof answer !== 'object') {
      return answer;
    }
    
    console.log('[o3-mini CONTENT] Starting content extraction from response:', JSON.stringify(answer, null, 2));
    
    // First, check for the special case of reasoning tokens without accepted tokens
    if (answer.usage?.completion_tokens_details) {
      const details = answer.usage.completion_tokens_details;
      if (details.reasoning_tokens > 0 && details.accepted_prediction_tokens === 0) {
        console.log(`[o3-mini CONTENT] Found reasoning tokens (${details.reasoning_tokens}) but no accepted prediction tokens`);
        return `[The o3-mini model generated reasoning (${details.reasoning_tokens} tokens) but didn't produce a final answer. This is a known limitation of this model. Try a different model like azure-gpt-4o-mini.]`;
      }
    }
    
    // Check for content in various places the model might return it
    if (answer.choices && answer.choices.length > 0) {
      const choice = answer.choices[0];
      console.log('[o3-mini CONTENT] Examining choice:', JSON.stringify(choice, null, 2));
      
      // Check message.content - most common format for o3-mini responses
      if (choice.message?.content) {
        const content = choice.message.content;
        console.log('[o3-mini CONTENT] Found content in message.content field:', content.substring(0, 100) + '...');
        return content;
      }
      
      // Check for content in other potential places
      if (choice.content) {
        console.log('[o3-mini CONTENT] Found content in choice.content field');
        return choice.content;
      }
      
      // Check for delta content (streaming responses)
      if (choice.delta?.content) {
        console.log('[o3-mini CONTENT] Found content in delta field');
        return choice.delta.content;
      }
      
      // Check completion field (older format)
      if (choice.completion) {
        console.log('[o3-mini CONTENT] Found content in completion field');
        return choice.completion;
      }
      
      // Check finish_reason for clues
      const finishReason = choice.finish_reason;
      if (finishReason === 'length') {
        const tokensUsed = answer.usage?.completion_tokens || 0;
        console.log(`[o3-mini CONTENT] Response truncated due to length limit. ${tokensUsed} tokens generated`);
        return `[Response truncated due to length limit. ${tokensUsed} tokens were generated but the model didn't return content. Try a shorter prompt or use azure-gpt-4o-mini instead.]`;
      }
    }
    
    // Check for full response structure in raw form (for cases where response was wrapped)
    if (answer.id && answer.choices && answer.choices.length > 0) {
      const choice = answer.choices[0];
      if (choice.message?.content) {
        const content = choice.message.content;
        console.log('[o3-mini CONTENT] Found content in top-level response structure:', content.substring(0, 100) + '...');
        return content;
      }
    }
    
    // Check top-level fields as fallbacks
    if (answer.content) {
      console.log('[o3-mini CONTENT] Found content in top-level content field');
      return answer.content;
    }
    
    if (answer.text) {
      console.log('[o3-mini CONTENT] Found content in top-level text field');
      return answer.text;
    }
    
    if (answer.completion) {
      console.log('[o3-mini CONTENT] Found content in top-level completion field');
      return answer.completion;
    }
    
    // If we reach here but have token usage, provide informative message
    if (answer.usage) {
      const completionTokens = answer.usage.completion_tokens || 0;
      const reasoningTokens = answer.usage.completion_tokens_details?.reasoning_tokens || 0;
      
      if (completionTokens > 0) {
        console.log(`[o3-mini CONTENT] No content found but ${completionTokens} tokens were used (${reasoningTokens} reasoning tokens)`);
        return `[The o3-mini model generated ${completionTokens} tokens (including ${reasoningTokens} reasoning tokens) but didn't return structured content. Try a different model like azure-gpt-4o-mini.]`;
      }
    }
    
    // If we reach here, no content was found
    console.log('[o3-mini CONTENT] No content found in any expected field');
    return "[No content was returned from the model. Try using a shorter prompt or switch to azure-gpt-4o-mini.]";
  }
  
  updateProgress(data) {
    if (typeof this.onProgressUpdate === 'function') {
      this.onProgressUpdate(data);
    }
  }
}