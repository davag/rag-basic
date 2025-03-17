import axios from 'axios';

// Custom Ollama integration for local LLM inference
class ChatOllama {
  constructor(options) {
    this.modelName = options.modelName || 'llama3';
    this.temperature = options.temperature || 0;
    this.systemPrompt = options.systemPrompt || '';
    this.endpoint = options.endpoint || 'http://localhost:11434';
    
    // Add compatibility properties
    this._modelType = () => 'ollama';
    this._llmType = () => 'ollama';
    this._identifying_params = { model_name: this.modelName };
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
    this.modelName = options.modelName || 'claude-3-haiku-20240307';
    this.temperature = options.temperature || 0;
    this.systemPrompt = options.systemPrompt || '';
    this.apiKey = options.anthropicApiKey;
    
    // Use a proxy server URL if available, otherwise use the default proxy
    this.proxyUrl = process.env.REACT_APP_API_PROXY_URL || '/api/proxy/anthropic';
    
    // Add compatibility properties
    this._modelType = () => 'anthropic';
    this._llmType = () => 'anthropic';
    this._identifying_params = { model_name: this.modelName };
  }

  async call(messages) {
    try {
      // Format messages for Anthropic API
      const formattedMessages = messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content
      }));
      
      // Use proxy endpoint to avoid CORS
      const response = await axios.post(this.proxyUrl, {
        model: this.modelName,
        messages: [
          { role: 'system', content: this.systemPrompt },
          ...formattedMessages
        ],
        temperature: this.temperature,
        max_tokens: 1024,
        // Pass the API key in the request body to be used by the proxy
        anthropicApiKey: this.apiKey || process.env.REACT_APP_ANTHROPIC_API_KEY
      });
      
      // Handle different response formats
      if (response.data && response.data.content) {
        return response.data.content;
      } else if (response.data && response.data.message && response.data.message.content) {
        return response.data.message.content;
      } else {
        window.console.warn('Unexpected Anthropic API response format:', response.data);
        return response.data.toString();
      }
    } catch (error) {
      window.console.error('Error calling Anthropic API:', error);
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
    this.modelName = options.modelName || 'gpt-3.5-turbo';
    this.temperature = options.temperature || 0;
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
      
      // Make sure we have an API key
      const apiKey = this.apiKey || process.env.REACT_APP_OPENAI_API_KEY;
      
      if (!apiKey) {
        throw new Error('OpenAI API key is required. Please set REACT_APP_OPENAI_API_KEY in your environment variables.');
      }
      
      // Use window.console for logging
      window.console.log('Sending OpenAI request:', {
        endpoint: `${this.proxyUrl}/chat/completions`,
        model: this.modelName,
        messageCount: allMessages.length
      });
      
      // Use proxy endpoint to avoid CORS
      const requestData = {
        model: this.modelName,
        messages: allMessages,
        temperature: this.temperature,
        max_tokens: 1024,
        openaiApiKey: apiKey
      };
      
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

/**
 * Create an LLM instance based on the model name
 * @param {string} model - The model name
 * @param {string} systemPrompt - The system prompt to use
 * @param {Object} options - Additional options
 * @returns {ChatOllama|CustomChatAnthropic|CustomChatOpenAI} - The LLM instance
 */
export const createLlmInstance = (model, systemPrompt, options = {}) => {
  // Always use our custom implementations to avoid CORS issues in the browser
  if (model.startsWith('gpt')) {
    // Get the API key from environment variables
    const openAIApiKey = process.env.REACT_APP_OPENAI_API_KEY;
    
    if (!openAIApiKey) {
      window.console.error('REACT_APP_OPENAI_API_KEY is not set in environment variables');
      throw new Error('OpenAI API key is required. Please set REACT_APP_OPENAI_API_KEY in your .env file.');
    }
    
    return new CustomChatOpenAI({
      openAIApiKey: openAIApiKey,
      modelName: model,
      temperature: 0,
      systemPrompt: systemPrompt
    });
  } else if (model.startsWith('claude')) {
    // Get the API key from environment variables
    const anthropicApiKey = process.env.REACT_APP_ANTHROPIC_API_KEY;
    
    if (!anthropicApiKey) {
      window.console.error('REACT_APP_ANTHROPIC_API_KEY is not set in environment variables');
      throw new Error('Anthropic API key is required. Please set REACT_APP_ANTHROPIC_API_KEY in your .env file.');
    }
    
    return new CustomChatAnthropic({
      anthropicApiKey: anthropicApiKey,
      modelName: model,
      temperature: 0,
      systemPrompt: systemPrompt
    });
  } else if (model.includes('llama') || model.includes('mistral')) {
    // For Ollama models
    return new ChatOllama({
      modelName: model,
      temperature: 0,
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