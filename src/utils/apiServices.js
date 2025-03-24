import axios from 'axios';

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
    this.endpoint = options.endpoint || options.baseUrl || 'http://localhost:11434';
    
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
    this.temperature = options.temperature !== undefined ? options.temperature : 0;
    this.systemPrompt = options.systemPrompt || '';
    this.apiKey = options.anthropicApiKey;
    this.queryId = options.queryId || null;
    
    // Use a proxy server URL if available, otherwise use the default proxy
    this.proxyUrl = process.env.REACT_APP_API_PROXY_URL || '/api/proxy/anthropic';
    
    // Add compatibility properties
    this._modelType = () => 'anthropic';
    this._llmType = () => 'anthropic';
    this._identifying_params = { model_name: this.modelName };
    
    // Use safe logger
    safeLogger.log(`CustomChatAnthropic initialized with model: ${this.modelName}`);
    safeLogger.log(`API key provided in constructor: ${this.apiKey ? 'Yes' : 'No'}`);
    safeLogger.log(`Environment API key available: ${process.env.REACT_APP_ANTHROPIC_API_KEY ? 'Yes' : 'No'}`);
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
      const apiKey = this.apiKey || process.env.REACT_APP_ANTHROPIC_API_KEY;
      
      if (!apiKey) {
        throw new Error('Anthropic API key is required. Please set REACT_APP_ANTHROPIC_API_KEY in your environment variables.');
      }
      
      // Use safe logger
      safeLogger.log('Sending Anthropic request:', {
        endpoint: `${this.proxyUrl}/messages`,
        model: this.modelName,
        messageCount: formattedMessages.length,
        hasSystemPrompt: !!this.systemPrompt,
        temperature: this.temperature
      });
      
      // Use proxy endpoint to avoid CORS
      // Update to include '/messages' in the URL path
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
          }
        }
      );
      
      // Use safe logger
      safeLogger.log('Anthropic response status:', response.status);
      
      if (response.data.error) {
        safeLogger.error('Anthropic API returned an error:', response.data.error);
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
    this.apiKey = options.openAIApiKey;
    this.queryId = options.queryId || null;
    
    // Use a proxy server URL if available, otherwise use the default proxy
    this.proxyUrl = process.env.REACT_APP_API_PROXY_URL || '/api/proxy/openai';
    
    // Add compatibility properties
    this._modelType = () => 'openai';
    this._llmType = () => 'openai';
    this._identifying_params = { model_name: this.modelName };
    
    // Use safe logger
    safeLogger.log(`CustomChatOpenAI initialized with model: ${this.modelName}`);
    safeLogger.log(`API key provided in constructor: ${this.apiKey ? 'Yes' : 'No'}`);
    safeLogger.log(`Environment API key available: ${process.env.REACT_APP_OPENAI_API_KEY ? 'Yes' : 'No'}`);
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
      const apiKey = this.apiKey || process.env.REACT_APP_OPENAI_API_KEY;
      
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
      if (error.response) {
        safeLogger.error('Response data:', error.response.data);
        safeLogger.error('Response status:', error.response.status);
        safeLogger.error('Response headers:', error.response.headers);
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
    this.modelName = options.modelName || 'gpt-4o';
    this.deploymentName = options.deploymentName || options.modelName;
    this.temperature = options.temperature;
    this.systemPrompt = options.systemPrompt || '';
    this.apiKey = options.azureApiKey;
    this.apiVersion = options.apiVersion;
    this.endpoint = options.azureEndpoint || '';
    this.queryId = options.queryId || null;
    
    // Use a proxy server URL if available, otherwise use the default proxy
    this.proxyUrl = process.env.REACT_APP_API_PROXY_URL || '/api/proxy/azure';
    
    // Add compatibility properties
    this._modelType = () => 'azure-openai';
    this._llmType = () => 'azure-openai';
    this._identifying_params = { model_name: this.modelName, deployment_name: this.deploymentName };
    
    // Use safe logger
    safeLogger.log(`CustomAzureOpenAI initialized with model: ${this.modelName}`);
    safeLogger.log(`Deployment name: ${this.deploymentName}`);
    safeLogger.log(`API key provided in constructor: ${this.apiKey ? 'Yes' : 'No'}`);
    safeLogger.log(`Environment API key available: ${process.env.REACT_APP_AZURE_OPENAI_API_KEY ? 'Yes' : 'No'}`);
    safeLogger.log(`Azure endpoint: ${this.endpoint || 'Not provided'}`);
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
      const apiKey = this.apiKey || process.env.REACT_APP_AZURE_OPENAI_API_KEY;
      const endpoint = this.endpoint || process.env.REACT_APP_AZURE_OPENAI_ENDPOINT;
      
      if (!apiKey) {
        console.error('[AZURE ERROR] API key missing:', { providedInConstructor: !!this.apiKey, fromEnv: !!process.env.REACT_APP_AZURE_OPENAI_API_KEY });
        throw new Error('Azure OpenAI API key is required. Please set REACT_APP_AZURE_OPENAI_API_KEY in your environment variables.');
      }
      
      if (!endpoint) {
        console.error('[AZURE ERROR] Endpoint missing:', { providedInConstructor: !!this.endpoint, fromEnv: !!process.env.REACT_APP_AZURE_OPENAI_ENDPOINT });
        throw new Error('Azure OpenAI endpoint is required. Please set REACT_APP_AZURE_OPENAI_ENDPOINT in your environment variables.');
      }
      
      // Special handling for o3-mini model which doesn't exist
      let finalDeploymentName = this.deploymentName;
      if (this.deploymentName === 'o3-mini') {
        // Fallback to gpt-4o-mini for o3-mini requests
        console.warn('[AZURE WARNING] o3-mini deployment not found, falling back to gpt-4o-mini');
        finalDeploymentName = 'gpt-4o-mini';
      }
      
      // Use safe logger and also log to console for debugging
      safeLogger.log('Sending Azure OpenAI request:', {
        endpoint: `${this.proxyUrl}`,
        modelName: this.modelName,
        deploymentName: finalDeploymentName,
        messageCount: formattedMessages.length,
        hasSystemPrompt: !!this.systemPrompt,
        temperature: this.temperature
      });
      
      // Log detailed request info
      console.log('[DEBUG] Azure API Request Details:');
      console.log(`- Proxy URL: ${this.proxyUrl}`);
      console.log(`- Deployment Name: ${finalDeploymentName}`);
      console.log(`- Message Count: ${formattedMessages.length}`);
      console.log(`- First message role: ${formattedMessages[0]?.role}`);
      console.log(`- API Key first 5 chars: ${apiKey.substring(0, 5)}...`);
      console.log(`- Endpoint: ${endpoint}`);
      
      // Use proxy endpoint to avoid CORS
      const requestData = {
        model: finalDeploymentName,
        messages: formattedMessages,
        azureApiKey: apiKey,
        azureEndpoint: endpoint,
        apiVersion: process.env.REACT_APP_AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
        deploymentName: finalDeploymentName,
        queryId: this.queryId
      };
      
      // Add temperature if specified
      if (this.temperature !== undefined) {
        requestData.temperature = this.temperature;
      }
      
      // Add max tokens
      requestData.max_tokens = 1024;
      
      console.log('[DEBUG] About to make Azure API request');
      console.log(`[DEBUG] Request body: ${JSON.stringify(requestData, null, 2)}`);
      
      // Make the API call
      const response = await axios.post(
        `${this.proxyUrl}/chat/completions`,
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
        if (status === 404) {
          throw new Error(`Azure OpenAI API error: Deployment '${this.deploymentName}' not found. Please check your deployment name and endpoint URL.`);
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
  if (!model) {
    throw new Error('Model is required to create an LLM instance');
  }
  
  const {
    temperature = 0,
    ollamaEndpoint = 'http://localhost:11434',
    queryId = null
  } = options;
  
  // Handle Ollama models
  if (model.startsWith('llama') || model.startsWith('mistral') || model.startsWith('gemma')) {
    console.log(`Creating Ollama instance for model: ${model}`);
    
    // No need to map model names as the UI names match Ollama's exactly
    const ollamaModel = model;
    
    // Use the provided Ollama endpoint if available
    const ollamaUrl = ollamaEndpoint || process.env.REACT_APP_OLLAMA_ENDPOINT || 'http://localhost:11434';
    
    console.log(`Initializing Ollama with model: ${ollamaModel} at endpoint: ${ollamaUrl}`);
    
    return new ChatOllama({
      baseUrl: ollamaUrl,
      model: ollamaModel,
      format: 'json',
      temperature: temperature,
      systemPrompt: systemPrompt,
      queryId: queryId
    });
  }
  
  // Handle Azure OpenAI models
  if (model.startsWith('azure-')) {
    // Extract base model name by removing 'azure-' prefix
    const baseModel = model.replace('azure-', '');
    
    // Extract configuration from env variables
    const azureApiKey = options.azureApiKey || process.env.REACT_APP_AZURE_OPENAI_API_KEY;
    const azureEndpoint = options.azureEndpoint || process.env.REACT_APP_AZURE_OPENAI_ENDPOINT;
    const apiVersion = options.apiVersion || process.env.REACT_APP_AZURE_OPENAI_API_VERSION || '2023-05-15';
    
    // Create instance with Azure configuration
    return new CustomAzureOpenAI({
      azureApiKey,
      azureEndpoint,
      apiVersion,
      deploymentName: options.deploymentName || baseModel,
      model: baseModel,
      temperature,
      systemPrompt,
      queryId
    });
  }
  
  // Handle Anthropic Claude models
  if (model.startsWith('claude')) {
    return new CustomChatAnthropic({
      anthropicApiKey: options.anthropicApiKey || process.env.REACT_APP_ANTHROPIC_API_KEY,
      temperature,
      model,
      systemPrompt,
      queryId
    });
  }
  
  // Default to OpenAI models
  return new CustomChatOpenAI({
    openAIApiKey: options.openaiApiKey || process.env.REACT_APP_OPENAI_API_KEY,
    temperature,
    modelName: model,
    systemPrompt,
    queryId
  });
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

/**
 * Calculate the estimated cost based on token usage for different LLM models
 * @param {string} model - The model name
 * @param {number} tokenCount - The number of tokens used
 * @returns {number} - The estimated cost in USD
 */
export const calculateCost = (model, tokenCount) => {
  // Return 0 if tokenCount is undefined, null, or not a valid number
  if (tokenCount === undefined || tokenCount === null || isNaN(tokenCount)) {
    return 0;
  }
  
  // Try to get custom model pricing from localStorage first
  let customModels = {};
  try {
    const savedModels = localStorage.getItem('llmModels');
    if (savedModels) {
      customModels = JSON.parse(savedModels);
    }
  } catch (err) {
    safeLogger.error('Error loading custom models from localStorage:', err);
  }

  // If the model exists in custom models and is active, use its pricing
  if (customModels[model] && customModels[model].active) {
    const modelPricing = {
      input: customModels[model].input,
      output: customModels[model].output
    };
    
    // Assume a 50/50 split between input and output tokens for simplicity
    const inputTokens = Math.round(tokenCount / 2);
    const outputTokens = tokenCount - inputTokens;
    
    // Calculate cost (price per 1M tokens * token count / 1M)
    const inputCost = (modelPricing.input * inputTokens) / 1000000;
    const outputCost = (modelPricing.output * outputTokens) / 1000000;
    
    return inputCost + outputCost;
  }

  // Default pricing per 1M tokens (in USD) - fallback if not found in localStorage
  const pricing = {
    // OpenAI models
    'gpt-4o': {
      input: 5.0,
      output: 15.0
    },
    'gpt-4o-mini': {
      input: 0.15,
      output: 0.6
    },
    'o3-mini': {
      input: 0.15,
      output: 0.6
    },
    
    // Azure OpenAI models (same pricing as OpenAI models)
    'azure-gpt-4o': {
      input: 5.0,
      output: 15.0
    },
    'azure-gpt-4o-mini': {
      input: 0.15,
      output: 0.6
    },
    'azure-o3-mini': {
      input: 0.15,
      output: 0.6
    },
    
    // Azure OpenAI embedding models
    'azure-text-embedding-3-small': {
      input: 0.02,
      output: 0.02
    },
    'azure-text-embedding-3-large': {
      input: 0.13,
      output: 0.13
    },
    
    // OpenAI embedding models
    'text-embedding-3-small': {
      input: 0.02,
      output: 0.02
    },
    'text-embedding-3-large': {
      input: 0.13,
      output: 0.13
    },
    'text-embedding-ada-002': {
      input: 0.1,
      output: 0.1
    },
    
    // Anthropic models
    'claude-3-5-sonnet-latest': {
      input: 3.0,
      output: 15.0
    },
    'claude-3-7-sonnet-latest': {
      input: 15.0,
      output: 75.0
    },
    
    // Ollama models (free for local inference)
    'llama3.2:latest': {
      input: 0,
      output: 0
    },
    'gemma3:12b': {
      input: 0,
      output: 0
    },
    'mistral:latest': {
      input: 0,
      output: 0
    }
  };
  
  // Default pricing if model not found
  const defaultPricing = {
    input: 0.5,
    output: 1.5
  };
  
  // Get pricing for the model or use default
  const modelPricing = pricing[model] || defaultPricing;
  
  // Assume a 50/50 split between input and output tokens for simplicity
  // In a real implementation, you would track input and output tokens separately
  const inputTokens = Math.round(tokenCount / 2);
  const outputTokens = tokenCount - inputTokens;
  
  // Calculate cost (price per 1M tokens * token count / 1M)
  const inputCost = (modelPricing.input * inputTokens) / 1000000;
  const outputCost = (modelPricing.output * outputTokens) / 1000000;
  
  return inputCost + outputCost;
}; 