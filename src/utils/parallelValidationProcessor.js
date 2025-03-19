/**
 * Utility module for processing response validations in parallel
 */
import { createLlmInstance } from './apiServices';

/**
 * Process multiple validation queries in parallel
 * @param {Object} responses - Object containing model responses to validate
 * @param {string} query - The original query that was asked
 * @param {string} criteria - The evaluation criteria to use
 * @param {string} validatorModelName - The model to use for validation
 * @param {Function} onProgress - Optional callback for progress updates (model name)
 * @returns {Object} - Object mapping model names to validation results
 */
export const validateResponsesInParallel = async (
  responses,
  query,
  criteria,
  validatorModelName,
  onProgress = null
) => {
  // Prepare the validation tasks array
  const validationTasks = [];
  
  // Generate validation tasks for each model response
  Object.keys(responses).forEach(model => {
    // Handle models inside Sets differently
    if (model.startsWith('Set ') && 
        typeof responses[model] === 'object' && 
        !Array.isArray(responses[model])) {
      
      const setContent = responses[model];
      
      // Check if this set contains model keys
      const modelKeys = Object.keys(setContent).filter(key => 
        typeof setContent[key] === 'object' || 
        typeof setContent[key] === 'string'
      );
      
      if (modelKeys.length > 0) {
        // We have nested models inside this set
        modelKeys.forEach(modelKey => {
          const nestedModel = setContent[modelKey];
          // Create result key in the format the rest of the app expects
          const resultKey = `${model}-${modelKey}`;
          const displayKey = `${modelKey} / ${model}`;
          
          // Extract the response content for this nested model
          let answer = '';
          if (typeof nestedModel === 'string') {
            answer = nestedModel;
          } else if (nestedModel) {
            if (nestedModel.answer) {
              answer = typeof nestedModel.answer === 'object' ? nestedModel.answer.text : nestedModel.answer;
            } else if (nestedModel.response) {
              answer = nestedModel.response;
            } else if (nestedModel.text) {
              answer = nestedModel.text;
            } else {
              answer = JSON.stringify(nestedModel);
            }
          }
          
          // Add this validation task
          validationTasks.push({
            modelKey: resultKey,
            displayKey,
            answer
          });
        });
      }
    } else {
      // Handle regular models and sets without nested models
      const response = responses[model];
      
      // Get answer content regardless of response format
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
      
      // Add regular model validation task
      validationTasks.push({
        modelKey: model,
        displayKey: model,
        answer
      });
    }
  });
  
  // Create validation promises for parallel execution
  const validationPromises = validationTasks.map(async ({ modelKey, displayKey, answer }) => {
    try {
      // Create the evaluation prompt
      const prompt = `
You are an impartial judge evaluating the quality of an AI assistant's response to a user query.

USER QUERY:
${query}

AI ASSISTANT'S RESPONSE:
${answer}

EVALUATION CRITERIA:
${criteria}

Please evaluate the response based on the criteria above. Provide a score from 1-10 for each criterion, where 1 is poor and 10 is excellent. 

Your evaluation should be structured as a JSON object with these properties:
- criteria: an object with each criterion as a key and a score as its value
- explanation: a brief explanation for each score
- strengths: an array of strengths in the response
- weaknesses: an array of weaknesses or areas for improvement
- overall_score: the average of all criteria scores (1-10)
- overall_assessment: a brief summary of your evaluation

YOUR EVALUATION (in JSON format):
`;
      
      // Get Ollama endpoint from localStorage
      const ollamaEndpoint = localStorage.getItem('ollamaEndpoint') || 'http://localhost:11434';
      
      // Create LLM instance for validation
      const llm = createLlmInstance(validatorModelName, '', {
        ollamaEndpoint: ollamaEndpoint,
        temperature: 0,
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
          const score = result.criteria[key];
          if (score === undefined || score === null || isNaN(score)) {
            // Default to 5 if score is missing or invalid
            result.criteria[key] = 5;
          } else {
            // Convert to number and clamp between 0-10
            result.criteria[key] = Math.max(0, Math.min(10, Number(score)));
          }
        });
        
        // Ensure common criteria fields exist
        const commonCriteria = ['accuracy', 'completeness', 'relevance', 'conciseness', 'clarity'];
        commonCriteria.forEach(criterion => {
          // Look for the criterion with various casing and formatting
          const criterionKey = Object.keys(result.criteria).find(key => 
            key.toLowerCase() === criterion.toLowerCase() || 
            key.toLowerCase().includes(criterion.toLowerCase())
          );
          
          if (!criterionKey) {
            // If criterion doesn't exist, add it with a default score of 5
            result.criteria[criterion] = 5;
          } else if (criterionKey !== criterion) {
            // If criterion exists but with different casing, normalize the key
            result.criteria[criterion] = result.criteria[criterionKey];
          }
        });
      }
      
      // Ensure overall_score is a valid number
      if (result.overall_score === undefined || result.overall_score === null || isNaN(result.overall_score)) {
        // Calculate from criteria if available, otherwise default to 5
        if (result.criteria && Object.keys(result.criteria).length > 0) {
          const scores = Object.values(result.criteria).filter(score => !isNaN(Number(score)));
          result.overall_score = scores.length > 0 
            ? Number((scores.reduce((sum, score) => sum + Number(score), 0) / scores.length).toFixed(1))
            : 5;
        } else {
          result.overall_score = 5;
        }
      } else {
        // Convert to number and clamp between 0-10
        result.overall_score = Math.max(0, Math.min(10, Number(result.overall_score)));
      }
      
      // Ensure arrays exist
      if (!Array.isArray(result.strengths)) result.strengths = [];
      if (!Array.isArray(result.weaknesses)) result.weaknesses = [];
    }
    
    validationResults[modelKey] = result;
  });
  
  return validationResults;
}; 