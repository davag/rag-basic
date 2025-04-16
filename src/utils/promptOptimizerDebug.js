/**
 * Debug utilities for PromptOptimizer component.
 * 
 * This file contains utilities to help with debugging the
 * PromptOptimizer component, especially regarding synthetic
 * response generation.
 */

/**
 * Debug logger to visualize an actual response retrieval process
 * @param {string} setKey - The validation set key
 * @param {object} validationResults - The validation results object
 * @param {function} getSystemPromptForSet - Function to get system prompt for a set
 * @param {function} getUserQueryFromValidationData - Function to get user query from validation data
 * @param {string} propCurrentQuery - Current query from parent component
 * @returns {void}
 */
export const debugResponseData = (setKey, validationResults, getSystemPromptForSet, getUserQueryFromValidationData, propCurrentQuery) => {
  console.group('%c PromptOptimizer Debug', 'background: #06f; color: white; padding: 3px 6px; border-radius: 3px;');
  
  console.log('Available sets:', validationResults ? Object.keys(validationResults) : 'none');
  
  if (setKey) {
    console.log(`Debugging set: ${setKey}`);
    
    // Debug system prompt
    if (getSystemPromptForSet) {
      const systemPrompt = getSystemPromptForSet(setKey);
      console.log('System prompt:', systemPrompt ? systemPrompt.substring(0, 150) + '...' : 'Not found');
    }
    
    // Debug response data
    debugLogResponseData(setKey, validationResults);
    
    // Debug user query
    if (getUserQueryFromValidationData) {
      console.group('User Query Debug');
      const userQuery = getUserQueryFromValidationData(validationResults, setKey, propCurrentQuery);
      console.log('User query result:', userQuery);
      console.groupEnd();
    }
  } else {
    console.log('Please provide a set key to debug. Available sets:', 
      validationResults ? Object.keys(validationResults) : 'none');
  }
  
  console.groupEnd();
};

/**
 * Debug logger for getting actual response data
 * @param {string} setKey - The validation set key
 * @param {object} validationResults - The validation results object
 * @returns {object} Data about the response and whether it's synthetic
 */
export const debugLogResponseData = (setKey, validationResults) => {
  console.group('%c getActualResponseForSet Debug', 'background: #f06; color: white; padding: 2px 5px; border-radius: 3px;');
  
  console.log('Function parameters:', {
    setKey,
    hasValidationResults: !!validationResults,
    availableSets: validationResults ? Object.keys(validationResults) : 'none'
  });
  
  if (!setKey || !validationResults || !validationResults[setKey]) {
    console.warn('No validation results found for this set');
    console.groupEnd();
    return { response: null, isEvaluationData: false };
  }
  
  // Helper function to safely display response content
  const debugViewResponse = (response) => {
    if (!response) return 'null';
    if (typeof response !== 'string') {
      try {
        return JSON.stringify(response).substring(0, 150) + '...';
      } catch (e) {
        return 'Non-string value (cannot stringify)';
      }
    }
    return response.substring(0, 150) + (response.length > 150 ? '...' : '');
  };
  
  const data = validationResults[setKey];
  console.log('Data structure:', {
    keys: Object.keys(data),
    hasModelResponse: !!data.modelResponse,
    hasAssistantResponse: !!data.assistantResponse,
    hasEvaluatorPrompt: !!data.evaluatorPrompt,
    hasResponses: !!data.responses,
    modelId: data.model || 'unknown'
  });
  
  // Check for model response locations
  if (data.modelResponse) {
    console.log('Found in data.modelResponse:', debugViewResponse(data.modelResponse));
  }
  
  if (data.assistantResponse) {
    console.log('Found in data.assistantResponse:', debugViewResponse(data.assistantResponse));
  }
  
  if (data.evaluatorPrompt) {
    const match = data.evaluatorPrompt.match(/AI ASSISTANT'S RESPONSE:\s*([\s\S]+?)\s*(?=EVALUATION CRITERIA:|$)/i);
    console.log('Evaluator prompt search:', {
      hasMatch: !!match,
      extractedResponse: match ? debugViewResponse(match[1].trim()) : 'none'
    });
  }
  
  if (data.responses && typeof data.responses === 'object') {
    const modelId = data.model || '';
    console.log('Responses object:', {
      keys: Object.keys(data.responses),
      hasModelIdKey: modelId && !!data.responses[modelId],
      modelIdValue: modelId && data.responses[modelId] ? 
        debugViewResponse(data.responses[modelId]) : 'none'
    });
  }
  
  // Final outcome
  let outcome = 'Using placeholder';
  let responseValue = null;
  let isEvaluationData = true;
  
  if (data.modelResponse) {
    outcome = 'Using data.modelResponse';
    responseValue = data.modelResponse;
    isEvaluationData = false;
  }
  else if (data.assistantResponse) {
    outcome = 'Using data.assistantResponse';
    responseValue = data.assistantResponse;
    isEvaluationData = false;
  }
  else if (data.evaluatorPrompt && data.evaluatorPrompt.match(/AI ASSISTANT'S RESPONSE:\s*([\s\S]+?)\s*(?=EVALUATION CRITERIA:|$)/i)) {
    outcome = 'Using response extracted from evaluatorPrompt';
    responseValue = data.evaluatorPrompt.match(/AI ASSISTANT'S RESPONSE:\s*([\s\S]+?)\s*(?=EVALUATION CRITERIA:|$)/i)[1].trim();
    isEvaluationData = false;
  }
  else if (data.responses && typeof data.responses === 'object' && data.model && data.responses[data.model]) {
    outcome = 'Using response from data.responses[modelId]';
    responseValue = data.responses[data.model];
    isEvaluationData = false;
  } else {
    responseValue = `Note: No actual model response was found in the data. 
This is evaluation data, not the model output.

The system is using evaluation data for optimization purposes.
For more accurate optimization, please ensure model responses are available.`;
  }
  
  console.log('%c FINAL OUTCOME', 'background: #0a4; color: white; padding: 4px 8px; border-radius: 3px; font-weight: bold;');
  console.log('Result:', {
    outcome,
    isEvaluationData,
    responsePreview: debugViewResponse(responseValue)
  });
  
  // Option to view full response
  console.log('Full response (click to expand):', responseValue);
  
  console.groupEnd();
  
  return { response: responseValue, isEvaluationData, outcome };
}; 