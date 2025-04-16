import axios from 'axios';
import { defaultModels, apiConfig, calculateCost as configCalculateCost } from '../config/llmConfig';

// Define a safe logger implementation inside src/ to avoid external imports
const safeLogger = {
  log: (...args) => typeof window !== 'undefined' && window.console && window.console.log ? window.console.log(...args) : null,
  error: (...args) => typeof window !== 'undefined' && window.console && window.console.error ? window.console.error(...args) : null,
  warn: (...args) => typeof window !== 'undefined' && window.console && window.console.warn ? window.console.warn(...args) : null,
  info: (...args) => typeof window !== 'undefined' && window.console && window.console.info ? window.console.info(...args) : null
};

// Custom Ollama integration for local LLM inference
class ChatOllama {
  constructor(options) {
    // Set default model or use the provided one
    // The UI displays models with tags (like "llama3.2:latest"), but Ollama might need different format
    this.modelName = options.model || options.modelName || 'llama3';
    this.temperature = options.temperature !== undefined ? options.temperature : 0;
    this.systemPrompt = options.systemPrompt || '';
    this.endpoint = options.endpoint || options.baseUrl || options.ollamaEndpoint || 'http://localhost:11434';
    
    // Add compatibility properties
    this._modelType = () => 'ollama';
    this._llmType = () => 'ollama';
    this._identifying_params = { model_name: this.modelName };
    
    // Use safe logger
    safeLogger.log(`ChatOllama initialized with model: ${this.modelName}`);
    safeLogger.log(`Endpoint: ${this.endpoint}`);
    safeLogger.log(`Temperature setting: ${this.temperature}`);
    
    // Verify if the model is available at initialization time
    this.verifyModel();
  }
  
  // Verify that the model exists in Ollama
  async verifyModel() {
    try {
      // Check if model exists by querying the Ollama models list
      const response = await axios.get(`${this.endpoint}/api/tags`);
      const models = response.data.models || [];
      
      safeLogger.log(`Available Ollama models: ${models.map(m => m.name).join(', ')}`);
      
      const modelExists = models.some(m => m.name === this.modelName);
      
      if (!modelExists) {
        safeLogger.warn(`Warning: Model "${this.modelName}" not found in Ollama. Available models: ${models.map(m => m.name).join(', ')}`);
        safeLogger.warn(`Try running: ollama pull ${this.modelName}`);
      }
    } catch (error) {
      safeLogger.error(`Failed to verify Ollama model availability: ${error.message}`);
      // Don't throw error here, let it attempt to run first
    }
  }

  async call(messages) {
    try {
      console.log(`Calling Ollama API with model: ${this.modelName}`);
      const response = await axios.post(`${this.endpoint}/api/chat`, {
        model: this.modelName,
        messages: [
          { role: 'system', content: this.systemPrompt },
          ...messages
        ],
        temperature: this.temperature,
        stream: false
      });
      
      return response.data.message.content;
    } catch (error) {
      safeLogger.error('Error calling Ollama API:', error);
      
      // Provide a more detailed error message
      let errorMessage = `Ollama API error: ${error.message}`;
      
      // Check if the error is related to model not found
      if (error.response?.data?.error?.includes('not found')) {
        errorMessage = `Model "${this.modelName}" not found in Ollama. Please pull it first by running: ollama pull ${this.modelName}`;
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = `Could not connect to Ollama at ${this.endpoint}. Is Ollama running?`;
      }
      
      throw new Error(errorMessage);
    }
  }

  async invoke(input) {
    if (typeof input === 'string') {
      return this.call([{ role: 'user', content: input }]);
    } else {
      return this.call(input);
    }
  }
}

// Custom Anthropic integration to avoid CORS issues
class CustomChatAnthropic {
  constructor(options) {
    this.modelName = options.modelName || 'claude-3-haiku-20240307';
    this.queryId = options.queryId || null;
    
    // Only convert model names for deliberate calls (those with a queryId)
    // This prevents automatic conversions when no models are explicitly selected
    if (this.queryId) {
      // Ensure the model name is correctly formatted for the API
      if (this.modelName === 'claude-3-5-sonnet-latest') {
        // Use the specific dated model name from the Anthropic API
        console.log('Converting claude-3-5-sonnet-latest to claude-3-5-sonnet-20241022 for API call');
        this.modelName = 'claude-3-5-sonnet-20241022';
      } else if (this.modelName === 'claude-3-7-sonnet-latest') {
        console.log('Converting claude-3-7-sonnet-latest to claude-3-7-sonnet-20250219 for API call');
        this.modelName = 'claude-3-7-sonnet-20250219';
      } else if (this.modelName === 'claude-3-5-sonnet') {
        // Convert base model name to versioned name required by API
        console.log('Converting claude-3-5-sonnet to claude-3-5-sonnet-20241022 for API call');
        this.modelName = 'claude-3-5-sonnet-20241022';
      } else if (this.modelName === 'claude-3-7-sonnet') {
        // Convert base model name to versioned name required by API
        console.log('Converting claude-3-7-sonnet to claude-3-7-sonnet-20250219 for API call');
        this.modelName = 'claude-3-7-sonnet-20250219';
      }
    } else {
      console.log(`Skipping model name conversion for ${this.modelName} as this appears to be an automatic call`);
    }
    
    this.temperature = options.temperature !== undefined ? options.temperature : 0;
    this.systemPrompt = options.systemPrompt || '';
    this.apiKey = options.anthropicApiKey || apiConfig.anthropic.apiKey;
    this.queryId = options.queryId || null;
    
    // Use a proxy server URL if available, otherwise use the default proxy
    this.proxyUrl = options.proxyUrl || apiConfig.anthropic.proxyUrl || '/api/proxy/anthropic';
    
    // Add compatibility properties
    this._modelType = () => 'anthropic';
    this._llmType = () => 'anthropic';
    this._identifying_params = { model_name: this.modelName };
    
    // Use safe logger
    safeLogger.log(`CustomChatAnthropic initialized with model: ${this.modelName}`);
    safeLogger.log(`API key provided in constructor: ${this.apiKey ? 'Yes' : 'No'}`);
    safeLogger.log(`Environment API key available: ${apiConfig.anthropic.apiKey ? 'Yes' : 'No'}`);
    safeLogger.log(`Temperature setting: ${this.temperature}`);
  }

  async call(messages) {
    try {
      // Create a model-specific queryId to ensure proper cost tracking
      const modelSpecificQueryId = this.queryId ? `${this.queryId}-${this.modelName}` : null;
      
      // Format messages for Anthropic API
      const formattedMessages = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));
      
      // Make sure we have an API key
      const apiKey = this.apiKey || apiConfig.anthropic.apiKey;
      
      if (!apiKey) {
        throw new Error('Anthropic API key is required. Please set REACT_APP_ANTHROPIC_API_KEY in your environment variables.');
      }
      
      // Use safe logger and browser console for debugging
      console.log('Sending Anthropic request:', {
        endpoint: `${this.proxyUrl}/messages`,
        model: this.modelName,
        messageCount: formattedMessages.length,
        hasSystemPrompt: !!this.systemPrompt,
        temperature: this.temperature,
        proxyUrl: this.proxyUrl,
        queryId: modelSpecificQueryId
      });
      
      // Use proxy endpoint to avoid CORS
      console.log('Full Anthropic request URL:', `${this.proxyUrl}/messages`);
      
      // Use proxy endpoint to avoid CORS
      const response = await axios.post(
        `${this.proxyUrl}/messages`,
        {
          model: this.modelName,
          messages: formattedMessages,
          system: this.systemPrompt,
          max_tokens: 4096,
          temperature: this.temperature,
          anthropicApiKey: apiKey,
          queryId: modelSpecificQueryId,
          isDeliberateCall: true  // Add this flag to indicate this is an explicit user-selected model call
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60 second timeout
        }
      );
      
      // Use safe logger
      safeLogger.log('Anthropic response status:', response.status);
      console.log('Anthropic API response:', response.data);
      
      if (response.data.error) {
        safeLogger.error('Anthropic API returned an error:', response.data.error);
        console.error('Anthropic API error:', response.data.error);
        throw new Error(`Anthropic API error: ${response.data.error.message}`);
      }
      
      // Handle different response formats
      if (response.data.content && Array.isArray(response.data.content)) {
        // New Anthropic API format
        return response.data.content[0].text;
      } else if (response.data.completion) {
        // Legacy format
        return response.data.completion;
      } else {
        safeLogger.error('Unexpected response format from Anthropic API:', response.data);
        throw new Error('Unexpected response format from Anthropic API');
      }
    } catch (error) {
      safeLogger.error('Error calling Anthropic API:', error);
      if (error.response) {
        safeLogger.error('Response data:', error.response.data);
        safeLogger.error('Response status:', error.response.status);
        safeLogger.error('Response headers:', error.response.headers);
      } else if (error.request) {
        // The request was made but no response was received
        safeLogger.error('No response received from Anthropic API. Request details:', error.request);
      } else {
        // Something happened in setting up the request
        safeLogger.error('Error setting up Anthropic API request:', error.message);
      }
      throw new Error(`Anthropic API error: ${error.message || 'Unknown error'}`);
    }
  }

  async invoke(input) {
    if (typeof input === 'string') {
      return this.call([{ role: 'user', content: input }]);
    } else {
      return this.call(input);
    }
  }
}

// Custom OpenAI integration to avoid CORS issues
class CustomChatOpenAI {
  constructor(options) {
    this.modelName = options.modelName || 'gpt-4o-mini';
    this.temperature = options.temperature;
    this.systemPrompt = options.systemPrompt || '';
    this.apiKey = options.openAIApiKey || apiConfig.openAI.apiKey;
    this.queryId = options.queryId || null;
    
    // Use a proxy server URL if available, otherwise use the default proxy
    // Added explicit fallback to ensure proxyUrl is never undefined
    this.proxyUrl = options.proxyUrl || apiConfig.openAI.proxyUrl || '/api/proxy/openai';
    
    // Add compatibility properties
    this._modelType = () => 'openai';
    this._llmType = () => 'openai';
    this._identifying_params = { model_name: this.modelName };
    
    // Use safe logger
    safeLogger.log(`CustomChatOpenAI initialized with model: ${this.modelName}`);
    safeLogger.log(`API key provided in constructor: ${this.apiKey ? 'Yes' : 'No'}`);
    safeLogger.log(`Environment API key available: ${apiConfig.openAI.apiKey ? 'Yes' : 'No'}`);

    safeLogger.log(`Proxy URL: ${this.proxyUrl}`);
    
    // Additional debug for gpt-4o-mini specifically
    if (this.modelName === 'gpt-4o-mini') {
      console.log('DEBUG: Initializing gpt-4o-mini model');
      console.log('DEBUG: Using proxy URL:', this.proxyUrl);
      console.log('DEBUG: API key available:', this.apiKey ? 'Yes' : 'No');
    }
    
    if (this.modelName.startsWith('o1') || this.modelName.startsWith('o3')) {
      safeLogger.log(`Note: ${this.modelName.startsWith('o1') ? 'o1' : 'o3'} models use max_completion_tokens instead of max_tokens`);
      if (this.modelName.startsWith('o1')) {
        safeLogger.log('Note: o1 models do not support temperature settings');
      } else {
        safeLogger.log(`Temperature setting: ${this.temperature}`);
      }
    } else {
      safeLogger.log(`Temperature setting: ${this.temperature}`);
    }
  }

  async call(messages) {
    try {
      // Create a model-specific queryId to ensure proper cost tracking
      const modelSpecificQueryId = this.queryId ? `${this.queryId}-${this.modelName}` : null;
      
      // Special handling for gpt-4o-mini
      if (this.modelName === 'gpt-4o-mini') {
        console.log('DIRECT DEBUG: Using direct server endpoint for gpt-4o-mini');
        
        // Format messages
        const formattedMessages = messages.map(msg => ({
          role: msg.role || 'user',
          content: msg.content
        }));
        
        // Add system message if provided
        const allMessages = this.systemPrompt 
          ? [{ role: 'system', content: this.systemPrompt }, ...formattedMessages]
          : formattedMessages;
        
        // Make sure we have an API key
        const apiKey = this.apiKey || apiConfig.openAI.apiKey;
        
        if (!apiKey) {
          throw new Error('OpenAI API key is required for gpt-4o-mini');
        }
        
        // Ensure proxyUrl is not undefined and use a fallback if needed
        const proxyUrl = this.proxyUrl || '/api/proxy/openai';
        console.log('DIRECT DEBUG: Using proxy URL for gpt-4o-mini:', proxyUrl);
        
        const response = await axios.post(
          `${proxyUrl}/chat/completions`,
          {
            model: 'gpt-4o-mini',
            messages: allMessages,
            max_tokens: 1024,
            temperature: this.temperature !== undefined ? this.temperature : 0.7,
            openaiApiKey: apiKey,
            queryId: modelSpecificQueryId
          },
          {
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log('DIRECT DEBUG: gpt-4o-mini response received:', response.status);
        
        if (response.data.error) {
          console.error('DIRECT DEBUG: Error in response:', response.data.error);
          throw new Error(`OpenAI API error: ${response.data.error.message}`);
        }
        
        return response.data.choices[0].message.content;
      }
      
      // Regular handling for other models
      // Format messages for OpenAI API
      const formattedMessages = messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content
      }));
      
      // For o1 models, convert system message to a user message with special formatting
      let allMessages;
      if (this.modelName.startsWith('o1')) {
        if (this.systemPrompt) {
          allMessages = [
            { role: 'user', content: `\n${this.systemPrompt}\n\n${formattedMessages[0]?.content || ''}` },
            ...formattedMessages.slice(1)
          ];
        } else {
          allMessages = formattedMessages;
        }
      } else {
        // For other models, use standard system message
        allMessages = this.systemPrompt 
          ? [{ role: 'system', content: this.systemPrompt }, ...formattedMessages]
          : formattedMessages;
      }
      
      // Make sure we have an API key
      const apiKey = this.apiKey || apiConfig.openAI.apiKey;
      
      if (!apiKey) {
        throw new Error('OpenAI API key is required. Please set REACT_APP_OPENAI_API_KEY in your environment variables.');
      }
      
      // Use safe logger
      safeLogger.log('Sending OpenAI request:', {
        endpoint: `${this.proxyUrl}/chat/completions`,
        model: this.modelName,
        messageCount: allMessages.length,
        hasSystemPrompt: !!this.systemPrompt,
        isO1Model: this.modelName.startsWith('o1'),
        isO3Model: this.modelName.startsWith('o3'),
        temperature: this.temperature
      });
      
      // Use proxy endpoint to avoid CORS
      const requestData = {
        model: this.modelName,
        messages: allMessages,
        openaiApiKey: apiKey,
        queryId: modelSpecificQueryId
      };
      
      // Handle special cases for o1, o3, and o4 models
      if (
        this.modelName.startsWith('o1') ||
        this.modelName.startsWith('o3') ||
        this.modelName.startsWith('o4')
      ) {
        // o1, o3, and o4 models use max_completion_tokens instead of max_tokens
        requestData.max_completion_tokens = 4096;
        // Don't set temperature for o1 models, and for o4 models do NOT send temperature at all
        if (this.modelName.startsWith('o3') && this.temperature !== undefined) {
          requestData.temperature = this.temperature;
        }
        // For o4 models, do not set temperature (OpenAI only supports default=1)
      } else {
        // For other models, use standard parameters
        requestData.max_tokens = 4096;
        if (this.temperature !== undefined) {
          requestData.temperature = this.temperature;
        }
      }
      
      // Log full request data for debugging
      console.log(`OpenAI Request for model ${this.modelName}:`, {
        modelType: this.modelName.startsWith('o1') ? 'o1' : (this.modelName.startsWith('o3') ? 'o3' : 'standard'),
        requestData
      });
      
      console.log('DEBUG: Sending request to:', `${this.proxyUrl}/chat/completions`);
      
      const response = await axios.post(
        `${this.proxyUrl}/chat/completions`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Use safe logger
      safeLogger.log('OpenAI response status:', response.status);
      
      if (response.data.error) {
        safeLogger.error('OpenAI API returned an error:', response.data.error);
        throw new Error(`OpenAI API error: ${response.data.error.message}`);
      }
      
      return response.data.choices[0].message.content;
    } catch (error) {
      safeLogger.error('Error calling OpenAI API:', error);
      
      // Enhanced error logging for gpt-4o-mini
      if (this.modelName === 'gpt-4o-mini') {
        console.error('DEBUG: Error with gpt-4o-mini request:', error.message);
      }
      
      if (error.response) {
        safeLogger.error('Response data:', error.response.data);
        safeLogger.error('Response status:', error.response.status);
        safeLogger.error('Response headers:', error.response.headers);
        
        // Enhanced error debug for gpt-4o-mini
        if (this.modelName === 'gpt-4o-mini') {
          console.error('DEBUG: gpt-4o-mini error response:', {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
          });
        }
      }
      throw new Error(`OpenAI API error: ${error.message || 'Unknown error'}`);
    }
  }

  async invoke(input) {
    if (typeof input === 'string') {
      return this.call([{ role: 'user', content: input }]);
    } else {
      return this.call(input);
    }
  }
}

// New improved Azure OpenAI class with better deploymentName handling
export class CustomAzureOpenAI2 {
  constructor(options) {
    this.modelName = options.modelName || 'azure-gpt-4o';
    
    // ALWAYS derive deployment name from model name 
    if (this.modelName.startsWith('azure-')) {
      this.deploymentName = this.modelName.replace('azure-', '');
    } else {
      this.deploymentName = this.modelName;
    }
    
    console.log(`[AZURE2 INIT] Model: ${this.modelName}, DeploymentName: ${this.deploymentName}`);
    
    this.temperature = options.temperature !== undefined ? options.temperature : 0;
    this.systemPrompt = options.systemPrompt || '';
    this.apiKey = options.apiKey || apiConfig.azure.apiKey;
    this.endpoint = options.endpoint || apiConfig.azure.endpoint;
    this.apiVersion = options.apiVersion || apiConfig.azure.apiVersion || '2023-05-15';
    this.queryId = options.queryId || null;
    this.proxyUrl = options.proxyUrl || '/api/proxy/azure/chat/completions';
    
    // Add compatibility properties
    this._modelType = () => 'azure-openai';
    this._llmType = () => 'azure-openai';
    this._identifying_params = { model_name: this.modelName, deployment_name: this.deploymentName };
  }

  async call(messages, options = {}) {
    const startTime = Date.now();
    try {
      // Format messages ensuring system message is first if present
      let formattedMessages = [];
      
      // Add system message if present
      if (this.systemPrompt) {
        formattedMessages.push({
          role: 'system',
          content: this.systemPrompt
        });
      }
      
      // Add user messages
      formattedMessages = formattedMessages.concat(messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content
      })));

      // Make sure we have an API key and endpoint
      const apiKey = this.apiKey || apiConfig.azure.apiKey;
      const endpoint = this.endpoint || apiConfig.azure.endpoint;
      
      if (!apiKey) {
        throw new Error('Azure OpenAI API key is required');
      }
      
      if (!endpoint) {
        throw new Error('Azure OpenAI endpoint is required');
      }
      
      console.log(`[AZURE2 REQUEST] Using deployment name: ${this.deploymentName}`);
      
      // Create request data with ALL required fields
      const requestData = {
        model: this.modelName, 
        deploymentName: this.deploymentName, // EXPLICIT deployment name
        messages: formattedMessages,
        azureApiKey: apiKey,
        azureEndpoint: endpoint,
        apiVersion: this.apiVersion,
        queryId: this.queryId
      };
      
      // VERIFICATION LOGS 
      console.log(`[AZURE2 VERIFICATION] Final model: ${requestData.model}`);
      console.log(`[AZURE2 VERIFICATION] Final deploymentName: ${requestData.deploymentName}`);
      
      // Add temperature if specified
      if (this.temperature !== undefined) {
        requestData.temperature = this.temperature;
      }
      
      // Add max tokens 
      requestData.max_tokens = 4096;
      
      // Send request to proxy 
      const apiResponse = await axios.post(this.proxyUrl, requestData);
      
      // Calculate elapsed time properly - ensure we use the current time, not the response time
      const endTime = Date.now();
      const elapsedTime = endTime - startTime;
      
      console.log(`[AZURE2 TIMING] Start time: ${startTime}, End time: ${endTime}, Elapsed: ${elapsedTime}ms`);
      
      // Return formatted response
      return {
        text: apiResponse.data.choices[0].message.content,
        content: apiResponse.data.choices[0].message.content, 
        tokenUsage: apiResponse.data.usage,
        rawResponse: apiResponse.data,
        elapsedTime: elapsedTime, // Use our calculated elapsed time, not the response time
        elapsedTimeType: 'duration', // Add a clear indicator that this is a duration, not a timestamp
        calculatedCost: apiResponse.data.cost || null
      };
    } catch (error) {
      console.error(`Error in CustomAzureOpenAI2.call: ${error.message}`);
      throw error;
    }
  }

  async invoke(input) {
    if (typeof input === 'string') {
      return this.call([{ role: 'user', content: input }])
        .then(response => response.text);
    } else {
      return this.call(input).then(response => response.text);
    }
  }
}

/**
 * Create an LLM instance with the specified configuration
 * @param {string} model - The model name
 * @param {string} systemPrompt - The system prompt to use
 * @param {Object} options - Additional options
 * @returns {ChatOllama|CustomChatAnthropic|CustomChatOpenAI} - The LLM instance
 */
export const createLlmInstance = (model, systemPrompt, options = {}) => {
  // Get the model configuration
  const modelConfig = defaultModels[model];
  const vendor = modelConfig ? modelConfig.vendor : (
    model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') ? 'OpenAI' :
    model.startsWith('claude') ? 'Anthropic' :
    model.startsWith('azure-') ? 'AzureOpenAI' :
    'Ollama'
  );
  
  // Special case for validation - ensure we don't default to claude models
  // when the isForValidation flag is set and no valid model is specified
  if (options.isForValidation && (!model || model.includes('claude'))) {
    console.log(`Avoiding Claude model for validation. Using gpt-4o-mini instead of ${model}`);
    return createLlmInstance('gpt-4o-mini', systemPrompt, {
      ...options,
      isForValidation: true
    });
  }
  
  // Ensure we have proxy URLs with fallbacks
  const openAIProxyUrl = apiConfig.openAI.proxyUrl || '/api/proxy/openai';
  const anthropicProxyUrl = apiConfig.anthropic.proxyUrl || '/api/proxy/anthropic';
  
  // Load custom Azure model configurations from localStorage if available
  let customAzureConfig = null;
  try {
    const savedConfig = localStorage.getItem('azureModelsConfig');
    if (savedConfig) {
      customAzureConfig = JSON.parse(savedConfig);
    }
  } catch (e) {
    console.error('Error loading custom Azure config from localStorage:', e);
  }
  
  // Merge default model config with custom config if available
  let finalModelConfig = { ...modelConfig };
  if (customAzureConfig && customAzureConfig[model]) {
    console.log(`Using custom configuration for ${model} from localStorage:`, customAzureConfig[model]);
    finalModelConfig = {
      ...finalModelConfig,
      ...customAzureConfig[model]
    };
  }
  
  // Create the appropriate LLM instance based on vendor
  if (vendor === 'Ollama') {
    return new ChatOllama({
      modelName: model,
      systemPrompt,
      temperature: options.temperature,
      ollamaEndpoint: options.ollamaEndpoint || localStorage.getItem('ollamaEndpoint') || apiConfig.ollama?.endpoint
    });
  } else if (vendor === 'Anthropic') {
    return new CustomChatAnthropic({
      modelName: model,
      systemPrompt,
      temperature: options.temperature,
      anthropicApiKey: options.anthropicApiKey,
      proxyUrl: anthropicProxyUrl,
      queryId: options.queryId
    });
  } else if (vendor === 'AzureOpenAI') {
    console.log(`Creating Azure OpenAI instance for ${model} with deployment name ${finalModelConfig.deploymentName || model.replace('azure-', '')}`);
    
    // Ensure we have a deployment name from the model config
    const deploymentName = finalModelConfig.deploymentName || model.replace('azure-', '');
    
    // Log debug information about Azure model configuration
    console.log('[AZURE CONFIG] Creating Azure OpenAI instance with:');
    console.log(`- Model: ${model}`);
    console.log(`- Deployment Name: ${deploymentName}`);
    console.log(`- API Version: ${finalModelConfig.apiVersion || 'default'}`);
    
    // Ensure deploymentName is never undefined (important for Azure API calls)
    let finalDeploymentName = deploymentName;
    if (!finalDeploymentName) {
      console.error('[AZURE CONFIG ERROR] Deployment name is undefined! This will cause API errors.');
      // Force a fallback to the base model name as a last resort
      finalDeploymentName = model.replace('azure-', '');
      console.log(`[AZURE CONFIG] Using fallback deployment name: ${finalDeploymentName}`);
    }
    
    console.log(`[AZURE INSTANCE CREATION] Final deployment name: ${finalDeploymentName}`);
    console.log(`[AZURE INSTANCE CREATION] Model: ${model}`);
    console.log(`[AZURE INSTANCE CREATION] Using API version: ${finalModelConfig.apiVersion || '2023-05-15'}`);
    
    // Use dedicated Azure proxy URL instead of OpenAI proxy
    const azureProxyUrl = '/api/proxy/azure/chat/completions';
    
    // Special handling for o3-mini to allow fallback
    if (model === 'azure-o3-mini' || finalDeploymentName === 'o3-mini-early-access') {
      return new CustomAzureOpenAI2({
        modelName: model,
        deploymentName: finalDeploymentName,
        systemPrompt,
        temperature: undefined, // Explicitly undefined since o3-mini doesn't support temperature
        apiKey: options.azureApiKey,
        endpoint: options.azureEndpoint,
        apiVersion: finalModelConfig.apiVersion || '2024-02-01',
        proxyUrl: azureProxyUrl,
        queryId: options.queryId,
        fallbackOnError: true // Enable automatic fallback to gpt-4o-mini if o3-mini fails
      });
    }
    
    return new CustomAzureOpenAI2({
      modelName: model,
      deploymentName: finalDeploymentName,
      systemPrompt,
      temperature: options.temperature,
      apiKey: options.azureApiKey,
      endpoint: options.azureEndpoint,
      apiVersion: finalModelConfig.apiVersion,
      proxyUrl: azureProxyUrl,
      queryId: options.queryId
    });
  } else {
    // Special handling for o3-mini which doesn't support temperature
    if (model === 'o3-mini' || model.includes('o3-mini')) {
      console.log(`Creating OpenAI instance for ${model} with temperature=undefined (not supported)`);
      return new CustomChatOpenAI({
        modelName: model,
        systemPrompt,
        temperature: undefined, // Explicitly undefined since o3-mini doesn't support temperature
        openAIApiKey: options.openAIApiKey,
        proxyUrl: openAIProxyUrl,
        queryId: options.queryId
      });
    }
    
    return new CustomChatOpenAI({
      modelName: model,
      systemPrompt,
      temperature: options.temperature,
      openAIApiKey: options.openAIApiKey,
      proxyUrl: openAIProxyUrl,
      queryId: options.queryId
    });
  }
};

/**
 * Create a QA chain for a given LLM and vector store
 * @param {ChatOllama|CustomChatAnthropic|CustomChatOpenAI} llm - The LLM instance
 * @param {VectorStore} vectorStore - The vector store
 * @param {Object} options - Additional options
 * @returns {Object} - The QA chain object
 */
export const createQaChain = (llm, vectorStore, options = {}) => {
  let retriever = vectorStore.asRetriever(options.topK || 4);
  
  // Create a simple chain-like object
  return {
    llm,
    retriever,
    call: async ({ query }) => {
      try {
        const docs = await retriever.getRelevantDocuments(query);
        
        // Format the context from retrieved documents
        const context = docs.map(doc => doc.pageContent).join('\n\n');
        
        // Create the prompt with context
        const prompt = `
Context information is below.
---------------------
${context}
---------------------
Given the context information and not prior knowledge, answer the question: ${query}
`;
        
        // Call the LLM directly
        const answer = await llm.invoke(prompt);
        
        return {
          text: answer,
          sourceDocuments: docs
        };
      } catch (error) {
        safeLogger.error('Error in QA chain:', error);
        throw new Error(`Error in QA chain: ${error.message}`);
      }
    }
  };
};

/**
 * Execute a query against a QA chain
 * @param {Object} chain - The QA chain object
 * @param {string} query - The query to execute
 * @returns {Promise<Object>} - The query result
 */
export const executeQuery = async (chain, query) => {
  const startTime = Date.now();
  
  try {
    // Call the chain with the query
    const result = await chain.call({
      query: query
    });
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    return {
      result,
      metrics: {
        responseTime,
        tokenUsage: {
          estimated: true,
          total: Math.round(result.text.length / 4) // Very rough estimate
        }
      }
    };
  } catch (error) {
    safeLogger.error('Error executing query:', error);
    throw new Error(`Error executing query: ${error.message}`);
  }
};

// Calculate cost for token usage with a specific model - use the centralized function
export const calculateCost = (model, tokenUsage) => {
  // Handle different ways the token count might be provided
  let inputTokens = 0;
  let outputTokens = 0;
  
  if (typeof tokenUsage === 'number') {
    // Simple total token count case
    inputTokens = tokenUsage / 2;  // Estimate 50/50 split
    outputTokens = tokenUsage / 2;
  } else if (tokenUsage && typeof tokenUsage === 'object') {
    // Check if this is an API response object that contains usage data
    if (tokenUsage.rawResponse?.usage) {
      console.log('[Cost Debug] Found raw API response usage data, using accurate token counts');
      inputTokens = tokenUsage.rawResponse.usage.prompt_tokens || 0;
      outputTokens = tokenUsage.rawResponse.usage.completion_tokens || 0;
    }
    // Handle format with input/output
    else if (tokenUsage.input !== undefined && tokenUsage.output !== undefined) {
      inputTokens = tokenUsage.input || 0;
      outputTokens = tokenUsage.output || 0;
    } 
    // Handle OpenAI/Azure format with prompt_tokens/completion_tokens
    else if (tokenUsage.prompt_tokens !== undefined || tokenUsage.completion_tokens !== undefined) {
      inputTokens = tokenUsage.prompt_tokens || 0;
      outputTokens = tokenUsage.completion_tokens || 0;
    }
    // Handle promptTokens/completionTokens format
    else if (tokenUsage.promptTokens !== undefined || tokenUsage.completionTokens !== undefined) {
      inputTokens = tokenUsage.promptTokens || 0;
      outputTokens = tokenUsage.completionTokens || 0;
    }
    // Just total tokens provided - estimate split
    else if (tokenUsage.total !== undefined) {
      inputTokens = tokenUsage.total / 2;
      outputTokens = tokenUsage.total / 2;
    }
    // Handle total_tokens format (some API responses)
    else if (tokenUsage.total_tokens !== undefined) {
      inputTokens = tokenUsage.total_tokens / 2;
      outputTokens = tokenUsage.total_tokens / 2;
    }
    // Handle totalTokens format
    else if (tokenUsage.totalTokens !== undefined) {
      inputTokens = tokenUsage.totalTokens / 2;
      outputTokens = tokenUsage.totalTokens / 2;
    }
  }
  
  // Log the normalized token usage for debugging
  console.log(`Token usage normalized for ${model}: input=${inputTokens}, output=${outputTokens}`);
  
  // If no valid token counts, return 0
  if (isNaN(inputTokens) || isNaN(outputTokens)) {
    return { inputCost: 0, outputCost: 0, totalCost: 0 };
  }

  // Use the centralized calculation function
  const result = configCalculateCost(model, { input: inputTokens, output: outputTokens });
  return result;
};

/**
 * Check if Ollama is running and responding
 * @param {string} endpoint - The Ollama endpoint URL
 * @returns {Promise<boolean>} - True if Ollama is running, false otherwise
 */
export const checkOllamaStatus = async (endpoint) => {
  try {
    const url = endpoint || apiConfig.ollama?.endpoint || 'http://localhost:11434';
    safeLogger.log(`Checking Ollama status at ${url}`);
    const response = await axios.get(`${url}/api/tags`, { timeout: 2000 });
    safeLogger.log('Ollama status check successful:', response.data);
    return true;
  } catch (error) {
    safeLogger.error('Error checking Ollama status:', error);
    return false;
  }
}; 