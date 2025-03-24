import axios from 'axios';
import { defaultModels, apiConfig } from '../config/llmConfig';

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
    
    // Ensure the model name is correctly formatted for the API
    if (this.modelName === 'claude-3-5-sonnet-latest') {
      // Use the specific dated model name from the Anthropic API
      this.modelName = 'claude-3-5-sonnet-20241022';
    } else if (this.modelName === 'claude-3-7-sonnet-latest') {
      this.modelName = 'claude-3-7-sonnet-20250219';
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
        proxyUrl: this.proxyUrl
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
          max_tokens: 1024,
          temperature: this.temperature,
          anthropicApiKey: apiKey,
          queryId: this.queryId
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
            queryId: this.queryId
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
        queryId: this.queryId
      };
      
      // Handle special cases for o1 and o3 models
      if (this.modelName.startsWith('o1') || this.modelName.startsWith('o3')) {
        // o1 and o3 models use max_completion_tokens instead of max_tokens
        requestData.max_completion_tokens = 1024;
        
        // Don't set temperature for o1 models, but set it for o3 models if specified
        if (this.modelName.startsWith('o3') && this.temperature !== undefined) {
          requestData.temperature = this.temperature;
        }
      } else {
        // For other models, use standard parameters
        requestData.max_tokens = 1024;
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

// Custom Azure OpenAI integration for Azure-hosted models
export class CustomAzureOpenAI {
  constructor(options) {
    this.modelName = options.modelName || 'azure-gpt-4o-mini';
    this.deploymentName = options.deploymentName;
    this.temperature = options.temperature !== undefined ? options.temperature : 0;
    this.systemPrompt = options.systemPrompt || '';
    this.apiKey = options.apiKey || apiConfig.azure.apiKey;
    this.endpoint = options.endpoint || apiConfig.azure.endpoint;
    // Use model-specific API version if available, otherwise fallback to the global one
    this.apiVersion = options.apiVersion || apiConfig.azure.apiVersion || '2023-05-15';
    this.queryId = options.queryId || null;
    
    // Initialize proxyUrl with default value to prevent undefined errors
    this.proxyUrl = options.proxyUrl || apiConfig.openAI.proxyUrl || '/api/proxy/openai';
    
    // If deployment name is not provided, try to get it from model config
    if (!this.deploymentName) {
      const modelConfig = defaultModels[this.modelName];
      if (modelConfig && modelConfig.deploymentName) {
        this.deploymentName = modelConfig.deploymentName;
        
        // If model config has a specific API version, use that
        if (modelConfig.apiVersion) {
          this.apiVersion = modelConfig.apiVersion;
        }
      } else {
        // Default to using the model name without the azure- prefix
        this.deploymentName = this.modelName.replace('azure-', '');
      }
    }
    
    // Add compatibility properties
    this._modelType = () => 'azure-openai';
    this._llmType = () => 'azure-openai';
    this._identifying_params = { model_name: this.modelName, deployment_name: this.deploymentName };
    
    // Use safe logger
    safeLogger.log(`CustomAzureOpenAI initialized with model: ${this.modelName}`);
    safeLogger.log(`Deployment: ${this.deploymentName}`);
    safeLogger.log(`API key provided: ${this.apiKey ? 'Yes' : 'No'}`);
    safeLogger.log(`Endpoint: ${this.endpoint}`);
    safeLogger.log(`API Version: ${this.apiVersion}`);
    safeLogger.log(`Temperature setting: ${this.temperature}`);
  }

  async call(messages, options = {}) {
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
        console.error('[AZURE ERROR] API key missing:', { providedInConstructor: !!this.apiKey, fromEnv: !!apiConfig.azure.apiKey });
        throw new Error('Azure OpenAI API key is required. Please set REACT_APP_AZURE_OPENAI_API_KEY in your environment variables.');
      }
      
      if (!endpoint) {
        console.error('[AZURE ERROR] Endpoint missing:', { providedInConstructor: !!this.endpoint, fromEnv: !!apiConfig.azure.endpoint });
        throw new Error('Azure OpenAI endpoint is required. Please set REACT_APP_AZURE_OPENAI_ENDPOINT in your environment variables.');
      }
      
      // Use the specified deployment name directly
      let finalDeploymentName = this.deploymentName;
      
      // Use safe logger and also log to console for debugging
      safeLogger.log('Sending Azure OpenAI request:', {
        endpoint: this.endpoint,
        modelName: this.modelName,
        deploymentName: finalDeploymentName,
        apiVersion: this.apiVersion,
        messageCount: formattedMessages.length,
        hasSystemPrompt: !!this.systemPrompt,
        temperature: this.temperature
      });
      
      // Log detailed request info
      console.log('[DEBUG] Azure API Request Details:');
      console.log(`- Azure Endpoint: ${endpoint}`);
      console.log(`- Deployment Name: ${finalDeploymentName}`);
      console.log(`- API Version: ${this.apiVersion}`);
      console.log(`- Message Count: ${formattedMessages.length}`);
      console.log(`- First message role: ${formattedMessages[0]?.role}`);
      console.log(`- API Key first 5 chars: ${apiKey.substring(0, 5)}...`);
      
      // Use proxy endpoint to avoid CORS
      const requestData = {
        model: finalDeploymentName,
        messages: formattedMessages,
        azureApiKey: apiKey,
        azureEndpoint: endpoint,
        apiVersion: this.apiVersion,
        deploymentName: finalDeploymentName,
        queryId: this.queryId
      };
      
      // Add temperature if specified and not o3-mini model
      if (this.temperature !== undefined && 
          !this.modelName.includes('o3-mini') && 
          !finalDeploymentName.includes('o3-mini')) {
        requestData.temperature = this.temperature;
      } else if (this.modelName.includes('o3-mini') || finalDeploymentName.includes('o3-mini')) {
        console.log('[DEBUG] Omitting temperature parameter for o3-mini model - not supported');
      }
      
      // Add max tokens
      requestData.max_tokens = 1024;
      
      console.log('[DEBUG] About to make Azure API request');
      console.log(`[DEBUG] Request body: ${JSON.stringify(requestData, null, 2)}`);
      
      // Use direct server endpoint for Azure OpenAI
      const response = await axios.post(
        `/api/proxy/azure/chat/completions`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Use safe logger and also log to console for debugging
      safeLogger.log('Azure OpenAI response status:', response.status);
      console.log('[DEBUG] Azure OpenAI response received with status:', response.status);
      
      if (response.data.error) {
        safeLogger.error('Azure OpenAI API returned an error:', response.data.error);
        console.error('[DEBUG] Azure OpenAI API Error:', response.data.error);
        throw new Error(`Azure OpenAI API error: ${response.data.error.message}`);
      }
      
      return response.data.choices[0].message.content;
    } catch (error) {
      safeLogger.error('Error calling Azure OpenAI API:', error);
      console.error('[DEBUG] Azure OpenAI API Call Failed:', error.message);
      
      // Log more detailed error information for debugging
      if (error.response) {
        safeLogger.error('Response data:', error.response.data);
        safeLogger.error('Response status:', error.response.status);
        safeLogger.error('Response headers:', error.response.headers);
        
        console.error('[DEBUG] Response Status:', error.response.status);
        console.error('[DEBUG] Response Data:', JSON.stringify(error.response.data, null, 2));
        
        // Provide a more specific error message based on the status code
        const status = error.response.status;
        const errorData = error.response.data?.error || {};
        
        if (status === 404 && errorData.code === 'DeploymentNotFound') {
          // Special handling for deployment not found errors
          if (this.deploymentName === 'o3-mini') {
            throw new Error(`Azure OpenAI deployment '${this.deploymentName}' not found. The o3-mini model may not be available in your Azure account. Consider using 'gpt-4o-mini' deployment instead or request access to o3-mini.`);
          } else {
            throw new Error(`Azure OpenAI deployment '${this.deploymentName}' not found. Please check your deployment name in the Azure portal and ensure it's properly configured.`);
          }
        } else if (status === 401) {
          throw new Error(`Azure OpenAI API error: Authentication failed. Please check your API key.`);
        } else if (status === 400) {
          throw new Error(`Azure OpenAI API error: Bad request - ${error.response.data?.error?.message || 'check your request parameters.'}`);
        } else {
          throw new Error(`Azure OpenAI API error: Request failed with status code ${status} - ${error.response.data?.error?.message || error.message}`);
        }
      } else if (error.request) {
        console.error('[DEBUG] No response received for request:', error.request);
        throw new Error(`Azure OpenAI API error: No response received from server. Please check your network connection and Azure endpoint URL.`);
      } else {
        throw new Error(`Azure OpenAI API error: ${error.message}`);
      }
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
      ollamaEndpoint: options.ollamaEndpoint || localStorage.getItem('ollamaEndpoint')
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
    return new CustomAzureOpenAI({
      modelName: model,
      systemPrompt,
      temperature: options.temperature,
      deploymentName: finalModelConfig?.deploymentName,
      apiVersion: finalModelConfig?.apiVersion,
      proxyUrl: openAIProxyUrl, // Use OpenAI proxy for Azure
      queryId: options.queryId
    });
  } else {
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
export const calculateCost = (model, tokenCount) => {
  // Use the imported defaultModels instead of requiring llmConfig
  const modelConfig = defaultModels[model];
  
  if (!modelConfig) {
    safeLogger.warn(`Model ${model} not found in configuration`);
    return 0;
  }
  
  // Assume a 50/50 split between input and output tokens for simplicity
  // In a real implementation, you would track input and output tokens separately
  const inputTokens = Math.round(tokenCount / 2);
  const outputTokens = tokenCount - inputTokens;
  
  // Calculate cost (price per 1M tokens * token count / 1M)
  const inputCost = (modelConfig.input * inputTokens) / 1000000;
  const outputCost = (modelConfig.output * outputTokens) / 1000000;
  
  return inputCost + outputCost;
}; 