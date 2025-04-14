/**
 * Utility module for processing response validations in parallel
 */
import { createLlmInstance } from './apiServices';
import { defaultSettings, apiConfig } from '../config/llmConfig';

/**
 * Process multiple validation queries in parallel
 * @param {Object} responses - Object containing model responses to validate
 * @param {string} query - The original query that was asked
 * @param {string} criteria - The evaluation criteria to use
 * @param {string} validatorModelName - The model to use for validation
 * @param {Function} onProgress - Optional callback for progress updates (model name)
 * @param {Object} systemPrompts - Optional system prompts for each model
 * @returns {Object} - Object mapping model names to validation results
 */
export const validateResponsesInParallel = async (
  responses,
  query,
  criteria,
  validatorModelName,
  onProgress = null,
  systemPrompts = {}
) => {
  // Prepare the validation tasks array
  const validationTasks = [];
  const processedModels = new Set(); // Track which models we've already processed
  
  console.log("Starting validation task generation with responses:", Object.keys(responses));
  
  // Helper function to determine if a key is a valid model key
  const isModelKey = (key) => {
    // Allow both OpenAI and Azure models
    return key.includes('gpt-') || 
           key.includes('claude-') ||
           key.includes('llama') ||
           key.includes('mistral') ||
           key.includes('gemma') ||
           key.includes('o1-') ||
           key.includes('o3-') ||
           key.includes('azure-');
  };
  
  // Function to check if a model has valid configuration
  const hasValidConfiguration = (modelName, apiConfig) => {
    console.log(`Checking configuration for model: ${modelName}`);
    
    // Get user environment preference
    const useAzureOpenAI = localStorage.getItem('useAzureOpenAI') === 'true';
    console.log(`Environment preference: ${useAzureOpenAI ? 'Azure' : 'OpenAI'}`);
    
    // For Azure models
    if (modelName.startsWith('azure-')) {
      const hasApiKey = !!(apiConfig.azure && apiConfig.azure.apiKey);
      const hasEndpoint = !!(apiConfig.azure && apiConfig.azure.endpoint);
      console.log(`Azure model ${modelName} config:`, {
        hasApiKey,
        hasEndpoint,
        valid: hasApiKey && hasEndpoint
      });
      
      // Only require proper configuration if we're explicitly using Azure
      if (useAzureOpenAI) {
        return hasApiKey && hasEndpoint;
      } else {
        // Otherwise, we'll convert to OpenAI
        console.log('Using OpenAI environment for validation instead of Azure');
        return true;
      }
    }
    
    // For OpenAI models
    if (modelName.startsWith('gpt-') || modelName.startsWith('o1') || modelName.startsWith('o3')) {
      const hasApiKey = !!(apiConfig.openAI && apiConfig.openAI.apiKey);
      console.log(`OpenAI model ${modelName} config:`, { hasApiKey });
      
      // If we're using OpenAI environment, require API key
      if (!useAzureOpenAI) {
        return hasApiKey;
      } else {
        // Otherwise, we'll convert to Azure if Azure is configured
        const hasAzureKey = !!(apiConfig.azure && apiConfig.azure.apiKey);
        const hasAzureEndpoint = !!(apiConfig.azure && apiConfig.azure.endpoint);
        if (hasAzureKey && hasAzureEndpoint) {
          console.log('Using Azure environment for validation instead of OpenAI');
          return true;
        } else {
          // If Azure isn't configured, we need OpenAI config
          return hasApiKey;
        }
      }
    }
    
    // For Anthropic models
    if (modelName.startsWith('claude')) {
      const hasApiKey = !!apiConfig.anthropic.apiKey;
      console.log(`Anthropic model ${modelName} config:`, { hasApiKey });
      return hasApiKey;
    }
    
    // For Ollama models
    if (modelName.includes('llama') || modelName.includes('mistral') || modelName.includes('gemma')) {
      const ollamaEndpoint = apiConfig.ollama?.endpoint || localStorage.getItem('ollamaEndpoint') || defaultSettings.ollamaEndpoint;
      // Check if endpoint is configured without requiring it to be different from default
      const isValid = !!ollamaEndpoint;
      console.log(`Ollama model ${modelName} config:`, { 
        ollamaEndpoint, 
        isValid 
      });
      return isValid;
    }
    
    console.log(`Model ${modelName} has no recognized format for validation`);
    return false;
  };
  
  // Helper function to extract the answer content from a model response
  const extractAnswer = (response) => {
    let answer = '';
    if (typeof response === 'object') {
      if (response.answer && typeof response.answer === 'object' && response.answer.text) {
        answer = response.answer.text;
      } else if (response.answer) {
        answer = response.answer;
      } else if (response.response) {
        answer = response.response;
      } else if (response.text) {
        answer = response.text;
      } else {
        // Try to extract content from any property that might contain the response
        const possibleFields = ['content', 'result', 'output', 'message', 'value'];
        for (const field of possibleFields) {
          if (response[field]) {
            answer = typeof response[field] === 'object' ? JSON.stringify(response[field]) : response[field];
            break;
          }
        }
        
        // If still no content, stringify the entire object
        if (!answer) {
          answer = JSON.stringify(response);
        }
      }
    } else if (typeof response === 'string') {
      answer = response;
    } else {
      answer = "Unable to extract response content";
    }
    return answer;
  };
  
  // Generate validation tasks for each model response
  Object.keys(responses).forEach(key => {
    // Parse the key to extract model information
    // eslint-disable-next-line no-unused-vars
    let modelKey = key;
    let modelName = key;
    let setName = '';
    
    // Check if the key format indicates a set-based model (e.g., "Set 1-gpt-4o-mini")
    if (key.includes('-')) {
      const parts = key.split('-');
      const possibleSetName = parts[0];
      const possibleModelName = parts.slice(1).join('-');
      
      if (possibleSetName.startsWith('Set ') && isModelKey(possibleModelName)) {
        setName = possibleSetName;
        modelName = possibleModelName;
      }
    }
    
    // Skip if we've already processed this model
    const uniqueModelId = `${setName}-${modelName}`.trim();
    if (processedModels.has(uniqueModelId)) {
      console.log(`Skipping duplicate model: ${key} (already processed as ${uniqueModelId})`);
      return;
    }
    
    // Skip if key isn't a model key and doesn't follow the Set X-model pattern
    if (!isModelKey(key) && !key.match(/^Set \d+-/)) {
      // Non-model property, skip it
      console.log(`Skipping non-model key: ${key}`);
      return;
    }
    
    // Skip if model doesn't have valid configuration
    if (!hasValidConfiguration(modelName, apiConfig)) {
      console.log(`Skipping model ${modelName} due to missing configuration (API key or endpoint)`);
      return;
    }
    
    const response = responses[key];
    
    // Skip if response is not a string or object, or if it's a property name
    if (response === null || (typeof response !== 'object' && typeof response !== 'string')) {
      console.log(`Skipping invalid response type for key: ${key}`);
      return;
    }
    
    // Skip keys like "text", "sources", "tokenUsage" when they're standalone properties
    // These should be part of a model response object, not validated separately
    if (['text', 'sources', 'tokenUsage', 'elapsedTime'].includes(key)) {
      console.log(`Skipping property key: ${key}`);
      return;
    }
    
    // Extract the answer content
    const answer = extractAnswer(response);
    
    // Skip empty answers
    if (!answer || answer.trim() === '') {
      console.log(`Skipping empty answer for: ${key}`);
      return;
    }
    
    // Add this model to processed set
    processedModels.add(uniqueModelId);
    
    console.log(`Creating validation task for: ${key} (${uniqueModelId})`);
    // Add validation task
    validationTasks.push({
      modelKey: key,
      displayKey: setName ? `${modelName} / ${setName}` : modelName,
      answer
    });
  });
  
  console.log(`Generated ${validationTasks.length} validation tasks`);
  
  // Early return if no validation tasks
  if (validationTasks.length === 0) {
    console.log("No validation tasks generated. Returning empty results.");
    return {};
  }
  
  // Create validation promises for parallel execution
  const validationPromises = validationTasks.map(async ({ modelKey, displayKey, answer }) => {
    try {
      // Create the evaluation prompt
      const prompt = `
You are an impartial judge evaluating the quality of an AI assistant's response to a user query.

SYSTEM PROMPT:
${systemPrompts[modelKey] || 'No system prompt provided'}

USER QUERY:
${query}

AI ASSISTANT'S RESPONSE:
${answer}

EVALUATION CRITERIA:
${criteria}

IMPORTANT INSTRUCTIONS:
1. You MUST evaluate EACH criterion listed above EXACTLY as written, preserving names and descriptions
2. For EACH criterion, provide:
   - A score from 1-10 (where 1 is poor and 10 is excellent)
   - A brief explanation justifying the score
3. Do not skip any criteria or add new ones
4. You MUST use the EXACT criterion names as provided above - do not modify, reformat, or change the case
5. For unclear statements criterion, explicitly list any unclear or ambiguous statements found

Your evaluation should be structured as a JSON object with these properties:
{
  "criteria": {
    // Use the EXACT criterion names from above, including any numbers or special characters
    "criterion_name": {
      "score": number, // 1-10
      "explanation": "string"
    }
  },
  "strengths": ["string"], // List of specific strengths
  "weaknesses": ["string"], // List of specific areas for improvement
  "unclear_statements": ["string"], // List of unclear or ambiguous statements with explanations
  "overall_score": number, // Average of all criteria scores (1-10)
  "overall_assessment": "string" // Brief summary of the evaluation
}

IMPORTANT: 
- Your response must be valid JSON
- You MUST include ALL criteria provided above with their EXACT names
- Preserve any numbers in criteria names (e.g., "Conciseness3")
- Include unclear statements even if empty

YOUR EVALUATION (in JSON format):
`;
      
      // Get Ollama endpoint from apiConfig, localStorage or default settings
      const ollamaEndpoint = apiConfig.ollama?.endpoint || localStorage.getItem('ollamaEndpoint') || defaultSettings.ollamaEndpoint;
      
      // Create LLM instance for validation
      const llm = createLlmInstance(validatorModelName, '', {
        ollamaEndpoint: ollamaEndpoint,
        // Skip temperature for o3-mini which doesn't support it
        ...(validatorModelName.includes('o3-mini') ? {} : { temperature: 0 }),
        isForValidation: true // Signal this is for validation to prevent fallback issues
      });
      
      // Call the LLM with the evaluation prompt
      const evaluationResult = await llm.invoke(prompt);
      
      // Parse the JSON response with multiple attempts
      // First attempt: direct JSON parse
      try {
        const parsedResult = JSON.parse(evaluationResult);
        return { modelKey, result: parsedResult, success: true };
      } catch (directParseError) {
        // Second attempt: Extract JSON from the response with regex
        const jsonMatch = evaluationResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsedResult = JSON.parse(jsonMatch[0]);
            return { modelKey, result: parsedResult, success: true };
          } catch (jsonError) {
            // Third attempt: Clean up the JSON before parsing
            const cleanedJson = jsonMatch[0]
              .replace(/\\'/g, "'")
              .replace(/\\"/g, '"')
              .replace(/\\n/g, ' ')
              .replace(/\s+/g, ' ')
              .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
              .replace(/,\s*]/g, ']'); // Remove trailing commas in arrays
            
            try {
              const parsedResult = JSON.parse(cleanedJson);
              return { modelKey, result: parsedResult, success: true };
            } catch (cleanJsonError) {
              return { 
                modelKey, 
                result: {
                  error: 'Failed to parse evaluation result JSON',
                  rawResponse: evaluationResult.substring(0, 500)
                },
                success: false 
              };
            }
          }
        }
        
        // If we reach here, all parsing attempts failed
        return { 
          modelKey, 
          result: {
            error: 'Failed to parse evaluation result JSON',
            rawResponse: evaluationResult.substring(0, 500)
          },
          success: false 
        };
      }
    } catch (error) {
      // Handle errors in the validation process
      return { 
        modelKey, 
        result: {
          error: `Validator model error: ${error.message}`,
          rawResponse: null
        },
        success: false 
      };
    }
  });
  
  // Execute all validation tasks in parallel
  const results = await Promise.all(
    validationPromises.map(async (promise, index) => {
      // Report on start of processing
      if (onProgress) {
        const modelKey = validationTasks[index].displayKey;
        onProgress({
          model: modelKey, 
          status: 'started',
          current: index + 1,
          total: validationTasks.length,
          progress: {
            completed: 0,
            pending: validationTasks.length,
            total: validationTasks.length
          }
        });
      }
      
      // Wait for the promise to resolve
      const result = await promise;
      
      // Report on completion
      if (onProgress) {
        const completed = index + 1;
        onProgress({
          model: result.modelKey,
          status: 'completed',
          current: index + 1,
          total: validationTasks.length,
          progress: {
            completed: completed,
            pending: validationTasks.length - completed,
            total: validationTasks.length
          }
        });
      }
      
      return result;
    })
  );
  
  // Convert array of results to an object mapped by model key
  const validationResults = {};
  results.forEach(({ modelKey, result }) => {
    // Normalize and validate result before adding to final results
    if (result && typeof result === 'object' && !result.error) {
      // Ensure criteria object exists
      if (!result.criteria || typeof result.criteria !== 'object') {
        result.criteria = {};
      }
      
      // Normalize criteria scores to ensure they're numbers between 0-10
      if (result.criteria) {
        Object.keys(result.criteria).forEach(key => {
          const value = result.criteria[key];
          if (typeof value === 'object' && value !== null) {
            // Handle case where criteria already has score and explanation
            if (value.score !== undefined) {
              value.score = Math.max(0, Math.min(10, Number(value.score)));
            } else {
              value.score = 5; // Default if no score
            }
          } else {
            // Convert direct score value to object format
            result.criteria[key] = {
              score: Math.max(0, Math.min(10, Number(value) || 5)),
              explanation: `Score normalized for ${key}`
            };
          }
        });
      }
      
      // Calculate overall score from criteria scores
      if (result.criteria && Object.keys(result.criteria).length > 0) {
        const scores = Object.values(result.criteria)
          .map(c => typeof c === 'object' ? c.score : Number(c))
          .filter(score => !isNaN(score));
          
        if (scores.length > 0) {
          result.overall_score = Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1));
        }
      }
      
      // Ensure overall score is a number between 0-10
      result.overall_score = Math.max(0, Math.min(10, Number(result.overall_score || 5)));
      
      // Create overall object if it doesn't exist
      if (!result.overall || typeof result.overall !== 'object') {
        result.overall = {
          score: result.overall_score * 10, // Convert to 0-100 scale
          explanation: result.overall_assessment || 'Score calculated from criteria average'
        };
      } else if (typeof result.overall === 'object') {
        // Ensure overall.score exists and is on 0-100 scale
        result.overall.score = Math.round(result.overall_score * 10);
      }
      
      // Ensure arrays exist
      if (!Array.isArray(result.strengths)) result.strengths = [];
      if (!Array.isArray(result.weaknesses)) result.weaknesses = [];
      if (!Array.isArray(result.unclear_statements)) result.unclear_statements = [];
    }
    
    validationResults[modelKey] = result;
  });
  
  return validationResults;
}; 