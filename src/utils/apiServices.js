import axios from 'axios';

// Custom Ollama integration for local LLM inference
class ChatOllama {
  constructor(options) {
    this.modelName = options.modelName || 'llama3';
    this.temperature = options.temperature !== undefined ? options.temperature : 0;
    this.systemPrompt = options.systemPrompt || '';
    this.endpoint = options.endpoint || 'http://localhost:11434';
    
    // Add compatibility properties
    this._modelType = () => 'ollama';
    this._llmType = () => 'ollama';
    this._identifying_params = { model_name: this.modelName };
    
    window.console.log(`ChatOllama initialized with model: ${this.modelName}`);
    window.console.log(`Temperature setting: ${this.temperature}`);
  }

  async call(messages) {
    try {
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
      window.console.error('Error calling Ollama API:', error);
      throw new Error(`Ollama API error: ${error.message}`);
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
    this.modelName = options.modelName || 'claude-3-5-sonnet-latest';
    this.temperature = options.temperature !== undefined ? options.temperature : 0;
    this.systemPrompt = options.systemPrompt || '';
    this.apiKey = options.anthropicApiKey;
    
    // Use a proxy server URL if available, otherwise use the default proxy
    this.proxyUrl = process.env.REACT_APP_API_PROXY_URL || '/api/proxy/anthropic';
    
    // Add compatibility properties
    this._modelType = () => 'anthropic';
    this._llmType = () => 'anthropic';
    this._identifying_params = { model_name: this.modelName };
    
    window.console.log(`CustomChatAnthropic initialized with model: ${this.modelName}`);
    window.console.log(`API key provided in constructor: ${this.apiKey ? 'Yes' : 'No'}`);
    window.console.log(`Environment API key available: ${process.env.REACT_APP_ANTHROPIC_API_KEY ? 'Yes' : 'No'}`);
    window.console.log(`Temperature setting: ${this.temperature}`);
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
      
      // Use window.console for logging
      window.console.log('Sending Anthropic request:', {
        endpoint: `${this.proxyUrl}`,
        model: this.modelName,
        messageCount: formattedMessages.length,
        hasSystemPrompt: !!this.systemPrompt,
        temperature: this.temperature
      });
      
      // Use proxy endpoint to avoid CORS
      // Note: The API endpoint should just be the base proxy URL, not with "/messages" appended
      // The proxy server will handle the full path construction
      const response = await axios.post(
        this.proxyUrl,
        {
          model: this.modelName,
          messages: formattedMessages,
          system: this.systemPrompt,
          max_tokens: 1024,
          temperature: this.temperature,
          anthropicApiKey: apiKey
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Use window.console for logging
      window.console.log('Anthropic response status:', response.status);
      
      if (response.data.error) {
        window.console.error('Anthropic API returned an error:', response.data.error);
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
        window.console.error('Unexpected response format from Anthropic API:', response.data);
        throw new Error('Unexpected response format from Anthropic API');
      }
    } catch (error) {
      window.console.error('Error calling Anthropic API:', error);
      if (error.response) {
        window.console.error('Response data:', error.response.data);
        window.console.error('Response status:', error.response.status);
        window.console.error('Response headers:', error.response.headers);
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
    
    // Use a proxy server URL if available, otherwise use the default proxy
    this.proxyUrl = process.env.REACT_APP_API_PROXY_URL || '/api/proxy/openai';
    
    // Add compatibility properties
    this._modelType = () => 'openai';
    this._llmType = () => 'openai';
    this._identifying_params = { model_name: this.modelName };
    
    // Use window.console instead of console directly
    window.console.log(`CustomChatOpenAI initialized with model: ${this.modelName}`);
    window.console.log(`API key provided in constructor: ${this.apiKey ? 'Yes' : 'No'}`);
    window.console.log(`Environment API key available: ${process.env.REACT_APP_OPENAI_API_KEY ? 'Yes' : 'No'}`);
    if (this.modelName.startsWith('o1')) {
      window.console.log('Note: o1 models do not support temperature settings');
    } else {
      window.console.log(`Temperature setting: ${this.temperature}`);
    }
  }

  async call(messages) {
    try {
      // Format messages for OpenAI API
      const formattedMessages = messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content
      }));
      
      // Add system message if provided, but handle o1 models differently
      let allMessages;
      if (this.modelName.startsWith('o1')) {
        // For o1 models, convert system message to a user message with special formatting
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
      
      // Use window.console for logging
      window.console.log('Sending OpenAI request:', {
        endpoint: `${this.proxyUrl}/chat/completions`,
        model: this.modelName,
        messageCount: allMessages.length,
        hasSystemPrompt: !!this.systemPrompt,
        isO1Model: this.modelName.startsWith('o1'),
        temperature: this.temperature
      });
      
      // Use proxy endpoint to avoid CORS
      const requestData = {
        model: this.modelName,
        messages: allMessages,
        openaiApiKey: apiKey
      };
      
      // Handle special cases for o1 models
      if (this.modelName.startsWith('o1')) {
        // o1 models use max_completion_tokens instead of max_tokens
        requestData.max_completion_tokens = 1024;
        // o1 models only support default temperature (1)
        // Don't set temperature for o1 models
      } else {
        // For other models, use standard parameters
        requestData.max_tokens = 1024;
        if (this.temperature !== undefined) {
          requestData.temperature = this.temperature;
        }
      }
      
      const response = await axios.post(
        `${this.proxyUrl}/chat/completions`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Use window.console for logging
      window.console.log('OpenAI response status:', response.status);
      
      if (response.data.error) {
        window.console.error('OpenAI API returned an error:', response.data.error);
        throw new Error(`OpenAI API error: ${response.data.error.message}`);
      }
      
      return response.data.choices[0].message.content;
    } catch (error) {
      window.console.error('Error calling OpenAI API:', error);
      if (error.response) {
        window.console.error('Response data:', error.response.data);
        window.console.error('Response status:', error.response.status);
        window.console.error('Response headers:', error.response.headers);
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
class CustomAzureOpenAI {
  constructor(options) {
    this.modelName = options.modelName || 'gpt-4o';
    this.deploymentName = options.deploymentName || options.modelName;
    this.temperature = options.temperature;
    this.systemPrompt = options.systemPrompt || '';
    this.apiKey = options.azureApiKey;
    this.apiVersion = options.apiVersion || '2023-12-01-preview';
    this.endpoint = options.azureEndpoint || '';
    
    // Use a proxy server URL if available, otherwise use the default proxy
    this.proxyUrl = process.env.REACT_APP_API_PROXY_URL || '/api/proxy/azure';
    
    // Add compatibility properties
    this._modelType = () => 'azure-openai';
    this._llmType = () => 'azure-openai';
    this._identifying_params = { model_name: this.modelName, deployment_name: this.deploymentName };
    
    window.console.log(`CustomAzureOpenAI initialized with model: ${this.modelName}`);
    window.console.log(`Deployment name: ${this.deploymentName}`);
    window.console.log(`API key provided in constructor: ${this.apiKey ? 'Yes' : 'No'}`);
    window.console.log(`Environment API key available: ${process.env.REACT_APP_AZURE_OPENAI_API_KEY ? 'Yes' : 'No'}`);
    window.console.log(`Azure endpoint: ${this.endpoint || 'Not provided'}`);
    window.console.log(`Temperature setting: ${this.temperature}`);
  }

  async call(messages) {
    try {
      // Format messages for OpenAI API
      const formattedMessages = messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content
      }));
      
      // Add system message if provided
      const allMessages = this.systemPrompt 
        ? [{ role: 'system', content: this.systemPrompt }, ...formattedMessages]
        : formattedMessages;
      
      // Make sure we have an API key and endpoint
      const apiKey = this.apiKey || process.env.REACT_APP_AZURE_OPENAI_API_KEY;
      const endpoint = this.endpoint || process.env.REACT_APP_AZURE_OPENAI_ENDPOINT;
      
      if (!apiKey) {
        throw new Error('Azure OpenAI API key is required. Please set REACT_APP_AZURE_OPENAI_API_KEY in your environment variables.');
      }
      
      if (!endpoint) {
        throw new Error('Azure OpenAI endpoint is required. Please set REACT_APP_AZURE_OPENAI_ENDPOINT in your environment variables.');
      }
      
      // Use window.console for logging
      window.console.log('Sending Azure OpenAI request:', {
        endpoint: `${this.proxyUrl}/deployments/${this.deploymentName}/chat/completions`,
        modelName: this.modelName,
        deploymentName: this.deploymentName,
        messageCount: allMessages.length,
        hasSystemPrompt: !!this.systemPrompt,
        temperature: this.temperature
      });
      
      // Use proxy endpoint to avoid CORS
      const requestData = {
        model: this.deploymentName,
        messages: allMessages,
        azureApiKey: apiKey,
        azureEndpoint: endpoint,
        apiVersion: this.apiVersion,
        deploymentName: this.deploymentName
      };
      
      // Add temperature if specified
      if (this.temperature !== undefined) {
        requestData.temperature = this.temperature;
      }
      
      // Add max tokens
      requestData.max_tokens = 1024;
      
      const response = await axios.post(
        `${this.proxyUrl}/chat/completions`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Use window.console for logging
      window.console.log('Azure OpenAI response status:', response.status);
      
      if (response.data.error) {
        window.console.error('Azure OpenAI API returned an error:', response.data.error);
        throw new Error(`Azure OpenAI API error: ${response.data.error.message}`);
      }
      
      return response.data.choices[0].message.content;
    } catch (error) {
      window.console.error('Error calling Azure OpenAI API:', error);
      if (error.response) {
        window.console.error('Response data:', error.response.data);
        window.console.error('Response status:', error.response.status);
        window.console.error('Response headers:', error.response.headers);
      }
      throw new Error(`Azure OpenAI API error: ${error.message}`);
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
  // Try to get custom model settings from localStorage
  let customModels = {};
  try {
    const savedModels = localStorage.getItem('llmModels');
    if (savedModels) {
      customModels = JSON.parse(savedModels);
    }
  } catch (err) {
    window.console.error('Error loading custom models from localStorage:', err);
  }

  // Get the vendor from custom models if available
  const vendor = customModels[model]?.vendor;
  
  window.console.log(`Processing model: ${model}, vendor: ${vendor || 'not specified'}`);
  
  // Detect Azure models ONLY by prefix or vendor
  const isAzureModel = vendor === 'AzureOpenAI' || model.startsWith('azure-');
  
  window.console.log(`Model ${model} detected as Azure model: ${isAzureModel}`);

  // Route to the appropriate implementation based on vendor or model prefix
  if (isAzureModel) {
    // Use Azure OpenAI Services
    const azureApiKey = process.env.REACT_APP_AZURE_OPENAI_API_KEY;
    const azureEndpoint = process.env.REACT_APP_AZURE_OPENAI_ENDPOINT;
    
    if (!azureApiKey) {
      window.console.error('REACT_APP_AZURE_OPENAI_API_KEY is not set in environment variables');
      throw new Error('Azure OpenAI API key is required. Please set REACT_APP_AZURE_OPENAI_API_KEY in your .env file.');
    }
    
    if (!azureEndpoint) {
      window.console.error('REACT_APP_AZURE_OPENAI_ENDPOINT is not set in environment variables');
      throw new Error('Azure OpenAI endpoint is required. Please set REACT_APP_AZURE_OPENAI_ENDPOINT in your .env file.');
    }
    
    // Strip the "azure-" prefix for deployment name if it exists
    const deploymentName = model.startsWith('azure-') ? model.substring(6) : model;
    
    window.console.log(`Using Azure OpenAI with model: ${model}, deployment: ${deploymentName}`);
    window.console.log(`Azure endpoint: ${azureEndpoint}, API version: ${process.env.REACT_APP_AZURE_OPENAI_API_VERSION || '2023-12-01-preview'}`);
    
    return new CustomAzureOpenAI({
      azureApiKey: azureApiKey,
      azureEndpoint: azureEndpoint,
      modelName: model,
      deploymentName: deploymentName,
      temperature: options.temperature !== undefined ? options.temperature : 0,
      systemPrompt: systemPrompt,
      apiVersion: process.env.REACT_APP_AZURE_OPENAI_API_VERSION || '2023-12-01-preview'
    });
  } else if ((vendor === 'OpenAI') || (!vendor && (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')))) {
    // Get the API key from environment variables
    const openAIApiKey = process.env.REACT_APP_OPENAI_API_KEY;
    
    if (!openAIApiKey) {
      window.console.error('REACT_APP_OPENAI_API_KEY is not set in environment variables');
      throw new Error('OpenAI API key is required. Please set REACT_APP_OPENAI_API_KEY in your .env file.');
    }
    
    return new CustomChatOpenAI({
      openAIApiKey: openAIApiKey,
      modelName: model,
      temperature: model.startsWith('o1') ? undefined : (options.temperature !== undefined ? options.temperature : 0),
      systemPrompt: systemPrompt
    });
  } else if ((vendor === 'OpenAI' || vendor === 'AzureOpenAI') && model.includes('embedding')) {
    // For embedding models
    if (vendor === 'AzureOpenAI' || model.startsWith('azure-')) {
      const azureApiKey = process.env.REACT_APP_AZURE_OPENAI_API_KEY;
      const azureEndpoint = process.env.REACT_APP_AZURE_OPENAI_ENDPOINT;
      
      if (!azureApiKey) {
        window.console.error('REACT_APP_AZURE_OPENAI_API_KEY is not set in environment variables');
        throw new Error('Azure OpenAI API key is required. Please set REACT_APP_AZURE_OPENAI_API_KEY in your .env file.');
      }
      
      if (!azureEndpoint) {
        window.console.error('REACT_APP_AZURE_OPENAI_ENDPOINT is not set in environment variables');
        throw new Error('Azure OpenAI endpoint is required. Please set REACT_APP_AZURE_OPENAI_ENDPOINT in your .env file.');
      }
      
      // Strip the "azure-" prefix for deployment name if it exists
      const deploymentName = model.startsWith('azure-') ? model.substring(6) : model;
      
      // Return a special embedding handler for Azure
      return {
        invoke: async (text) => {
          // Implement Azure OpenAI embedding API call
          // This is a stub that returns a fake embedding
          window.console.log(`[STUB] Using Azure OpenAI embedding model ${deploymentName} for text: ${text.substring(0, 50)}...`);
          return {
            text: `Embedding generated with ${deploymentName}`,
            embedding: Array(model.includes('large') ? 3072 : 1536).fill(0).map(() => Math.random())
          };
        }
      };
    } else {
      // Handle regular OpenAI embedding models
      const openAIApiKey = process.env.REACT_APP_OPENAI_API_KEY;
      
      if (!openAIApiKey) {
        window.console.error('REACT_APP_OPENAI_API_KEY is not set in environment variables');
        throw new Error('OpenAI API key is required. Please set REACT_APP_OPENAI_API_KEY in your .env file.');
      }
      
      // Return a special embedding handler
      return {
        invoke: async (text) => {
          // Implement OpenAI embedding API call
          // This is a stub that returns a fake embedding
          window.console.log(`[STUB] Using OpenAI embedding model ${model} for text: ${text.substring(0, 50)}...`);
          return {
            text: `Embedding generated with ${model}`,
            embedding: Array(model.includes('large') ? 3072 : 1536).fill(0).map(() => Math.random())
          };
        }
      };
    }
  } else if ((vendor === 'Anthropic') || (!vendor && model.startsWith('claude'))) {
    // Get the API key from environment variables
    const anthropicApiKey = process.env.REACT_APP_ANTHROPIC_API_KEY;
    
    if (!anthropicApiKey) {
      window.console.error('REACT_APP_ANTHROPIC_API_KEY is not set in environment variables');
      throw new Error('Anthropic API key is required. Please set REACT_APP_ANTHROPIC_API_KEY in your .env file.');
    }
    
    return new CustomChatAnthropic({
      anthropicApiKey: anthropicApiKey,
      modelName: model,
      temperature: options.temperature !== undefined ? options.temperature : 0,
      systemPrompt: systemPrompt
    });
  } else if ((vendor === 'Ollama') || (!vendor && (model.includes('llama') || model.includes('mistral') || model.includes('gemma')))) {
    // For Ollama models
    return new ChatOllama({
      modelName: model,
      temperature: options.temperature !== undefined ? options.temperature : 0,
      systemPrompt: systemPrompt,
      endpoint: options.ollamaEndpoint || process.env.REACT_APP_OLLAMA_API_URL || 'http://localhost:11434'
    });
  }
  
  throw new Error(`Unsupported model: ${model}`);
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
        window.console.error('Error in QA chain:', error);
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
    window.console.error('Error executing query:', error);
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
    window.console.error('Error loading custom models from localStorage:', err);
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
    'o1-mini': {
      input: 0.15,
      output: 0.6
    },
    'o1-preview': {
      input: 5.0,
      output: 15.0
    },
    'o3-mini': {
      input: 0.5,
      output: 1.5
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
    'azure-o1-mini': {
      input: 0.15,
      output: 0.6
    },
    'azure-o3-mini': {
      input: 0.5,
      output: 1.5
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