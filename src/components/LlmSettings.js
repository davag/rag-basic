import React, { useState } from 'react';
import { 
  Typography, 
  Box, 
  Paper, 
  Button,
  TextField,
  CircularProgress,
  Card,
  CardContent,
  CardActions,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { createLlmInstance } from '../utils/apiServices';

const LlmSettings = ({ showAppSettingsOnly = false }) => {
  // Get model pricing info from the utility
  const [models, setModels] = useState({
    // OpenAI models
    'gpt-4o': {
      vendor: 'OpenAI',
      input: 5.0,
      output: 15.0,
      active: true,
      description: 'Most capable GPT-4 model optimized for chat at a lower price.'
    },
    'gpt-4o-mini': {
      vendor: 'OpenAI',
      input: 0.15,
      output: 0.6,
      active: true,
      description: 'Affordable, faster version of GPT-4o with strong reasoning capabilities.'
    },
    'o1-mini': {
      vendor: 'OpenAI',
      input: 0.15,
      output: 0.6,
      active: true,
      description: 'Most affordable and compact O1 model with strong reasoning capabilities.'
    },
    'o1-preview': {
      vendor: 'OpenAI',
      input: 5.0,
      output: 15.0,
      active: true,
      description: 'OpenAI\'s most advanced reasoning model with strong performance on complex tasks.'
    },
    'o3-mini': {
      vendor: 'OpenAI',
      input: 0.5,
      output: 1.5,
      active: true,
      description: 'OpenAI\'s newest model with improved reasoning capabilities and efficiency.'
    },
    
    // Azure OpenAI models
    'azure-gpt-4o': {
      vendor: 'AzureOpenAI',
      input: 5.0,
      output: 15.0,
      active: true,
      description: 'Azure-hosted GPT-4o - most capable GPT-4 model optimized for chat.',
      deploymentName: 'gpt-4o'
    },
    'azure-gpt-4o-mini': {
      vendor: 'AzureOpenAI',
      input: 0.15,
      output: 0.60,
      active: true,
      description: 'Azure-hosted GPT-4o-mini - affordable, faster version of GPT-4o.',
      deploymentName: 'gpt4o-mini'
    },
    'azure-o1-mini': {
      vendor: 'AzureOpenAI',
      input: 0.15,
      output: 0.60,
      active: true,
      description: 'Azure-hosted o1-mini - affordable compact O1 model with strong reasoning.',
      deploymentName: 'o1-mini'
    },
    'azure-o3-mini': {
      vendor: 'AzureOpenAI',
      input: 0.5,
      output: 1.5,
      active: true,
      description: 'Azure-hosted o3-mini - newest model with improved reasoning capabilities.',
      deploymentName: 'o3-mini'
    },
    
    // Anthropic models
    'claude-3-5-sonnet-latest': {
      vendor: 'Anthropic',
      input: 3.0,
      output: 15.0,
      active: true,
      description: 'Fast and cost-effective Claude model with excellent performance.'
    },
    'claude-3-7-sonnet-latest': {
      vendor: 'Anthropic',
      input: 15.0,
      output: 75.0,
      active: true,
      description: 'Anthropic\'s most advanced Claude model with exceptional reasoning capabilities.'
    },
    
    // Ollama models (free for local inference)
    'llama3.2:latest': {
      vendor: 'Ollama',
      input: 0,
      output: 0,
      active: true,
      description: 'Open source Llama 3 (8B) model for local inference via Ollama.'
    },
    'gemma3:12b': {
      vendor: 'Ollama',
      input: 0,
      output: 0,
      active: true,
      description: 'Open source Gemma 3 (12B) model for local inference via Ollama.'
    },
    'mistral:latest': {
      vendor: 'Ollama',
      input: 0,
      output: 0,
      active: true,
      description: 'Open source Mistral (7B) model for local inference via Ollama.'
    }
  });

  const [testResults, setTestResults] = useState({});
  const [ollamaEndpoint, setOllamaEndpoint] = useState(process.env.REACT_APP_OLLAMA_API_URL || 'http://localhost:11434');
  const [promptAdvisorModel, setPromptAdvisorModel] = useState('gpt-4o-mini'); // Default advisor model
  const [responseValidatorModel, setResponseValidatorModel] = useState('gpt-4o-mini'); // Default validator model
  const [defaultEvaluationCriteria, setDefaultEvaluationCriteria] = useState(
    'Accuracy: Does the response correctly answer the query based on the provided context?\n' +
    'Completeness: Does the response address all aspects of the query?\n' +
    'Relevance: Is the information in the response relevant to the query?\n' +
    'Conciseness: Is the response appropriately concise without omitting important information?\n' +
    'Clarity: Is the response clear, well-structured, and easy to understand?\n' +
    'Exception handling: Only if the output is code then check exceptions paths'
  );
  const [defaultQueryTemplate, setDefaultQueryTemplate] = useState('');

  const vendorColors = {
    'OpenAI': '#10a37f',    // Green
    'AzureOpenAI': '#0078d4',  // Add Azure OpenAI with Microsoft blue color
    'Anthropic': '#5436da',  // Purple
    'Ollama': '#ff6b6b',     // Red
    'Other': '#888888'       // Gray
  };

  // Test LLM connectivity
  const testLlmConnection = async (modelId) => {
    // Update test results for this model to show "testing" status
    setTestResults(prev => ({...prev, [modelId]: 'testing'}));
    
    try {
      const options = {};
      if (models[modelId].vendor === 'Ollama') {
        options.ollamaEndpoint = ollamaEndpoint;
      }

      const llm = createLlmInstance(modelId, 'You are a helpful assistant.', options);
      const response = await llm.invoke('Hello, can you respond with a short greeting?');
      
      setTestResults(prev => ({
        ...prev, 
        [modelId]: { 
          status: 'success', 
          response: typeof response === 'object' ? response.text : response 
        }
      }));
    } catch (err) {
      window.console.error(`Error testing model ${modelId}:`, err);
      setTestResults(prev => ({
        ...prev, 
        [modelId]: { 
          status: 'error', 
          error: err.message 
        }
      }));
    }
  };

  // Reset to default models
  const handleResetToDefaults = () => {
    const defaultModels = {
      // OpenAI models
      'gpt-4o': {
        vendor: 'OpenAI',
        input: 5.0,
        output: 15.0,
        active: true,
        description: 'Most capable GPT-4 model optimized for chat at a lower price.'
      },
      'gpt-4o-mini': {
        vendor: 'OpenAI',
        input: 0.15,
        output: 0.60,
        active: true,
        description: 'Affordable GPT-4 class model for everyday use.'
      },
      'o1-mini': {
        vendor: 'OpenAI',
        input: 0.15,
        output: 0.60,
        active: true,
        description: 'Affordable model optimized for structured outputs.'
      },
      'o1-preview': {
        vendor: 'OpenAI',
        input: 5.0,
        output: 15.0,
        active: true,
        description: 'Most capable OpenAI model for specific control over system behavior.'
      },
      
      // Azure OpenAI models
      'azure-gpt-4o': {
        vendor: 'AzureOpenAI',
        input: 5.0,
        output: 15.0,
        active: true,
        description: 'Azure-hosted GPT-4o - most capable GPT-4 model optimized for chat.',
        deploymentName: 'gpt-4o'
      },
      'azure-gpt-4o-mini': {
        vendor: 'AzureOpenAI',
        input: 0.15,
        output: 0.60,
        active: true,
        description: 'Azure-hosted GPT-4o-mini - affordable, faster version of GPT-4o.',
        deploymentName: 'gpt4o-mini'
      },
      'azure-o1-mini': {
        vendor: 'AzureOpenAI',
        input: 0.15,
        output: 0.60,
        active: true,
        description: 'Azure-hosted o1-mini - affordable compact O1 model with strong reasoning.',
        deploymentName: 'o1-mini'
      },
      'azure-o3-mini': {
        vendor: 'AzureOpenAI',
        input: 0.5,
        output: 1.5,
        active: true,
        description: 'Azure-hosted o3-mini - newest model with improved reasoning capabilities.',
        deploymentName: 'o3-mini'
      },
      
      // Anthropic models
      'claude-3-5-sonnet-latest': {
        vendor: 'Anthropic',
        input: 3.0,
        output: 15.0,
        active: true,
        description: 'Fast and cost-effective Claude model with excellent performance.'
      },
      'claude-3-7-sonnet-latest': {
        vendor: 'Anthropic',
        input: 15.0,
        output: 75.0,
        active: true,
        description: 'Anthropic\'s most advanced Claude model with exceptional reasoning capabilities.'
      },
      
      // Ollama models
      'llama3.2:latest': {
        vendor: 'Ollama',
        input: 0,
        output: 0,
        active: true,
        description: 'Open source Llama 3 (8B) model for local inference via Ollama.'
      },
      'gemma3:12b': {
        vendor: 'Ollama',
        input: 0,
        output: 0,
        active: true,
        description: 'Open source Gemma 3 (12B) model for local inference via Ollama.'
      },
      'mistral:latest': {
        vendor: 'Ollama',
        input: 0,
        output: 0,
        active: true,
        description: 'Open source Mistral (7B) model for local inference via Ollama.'
      }
    };
    
    // Reset all settings to defaults
    setModels(defaultModels);
    localStorage.removeItem('llmModels');
    localStorage.setItem('llmModels', JSON.stringify(defaultModels));
    
    setOllamaEndpoint('http://localhost:11434');
    localStorage.setItem('ollamaEndpoint', 'http://localhost:11434');
    
    setPromptAdvisorModel('gpt-4o-mini');
    localStorage.setItem('promptAdvisorModel', 'gpt-4o-mini');
    
    setResponseValidatorModel('gpt-4o-mini');
    localStorage.setItem('responseValidatorModel', 'gpt-4o-mini');
    
    const defaultCriteria = 'Accuracy: Does the response correctly answer the query based on the provided context?\n' +
      'Completeness: Does the response address all aspects of the query?\n' +
      'Relevance: Is the information in the response relevant to the query?\n' +
      'Conciseness: Is the response appropriately concise without omitting important information?\n' +
      'Clarity: Is the response clear, well-structured, and easy to understand?\n' +
      'Exception handling: Only if the output is code then check exceptions paths'
    
    setDefaultEvaluationCriteria(defaultCriteria);
    localStorage.setItem('defaultEvaluationCriteria', defaultCriteria);
    
    setDefaultQueryTemplate('');
    localStorage.setItem('defaultQueryTemplate', '');
  };

  // Add stub implementations for used functions
  const calculateCostPer1K = (model) => {
    // For 1K tokens, assume 500 input and 500 output
    const inputCost = (model.input * 500) / 1000000;
    const outputCost = (model.output * 500) / 1000000;
    return (inputCost + outputCost).toFixed(4);
  };

  const handleResetClick = () => {
    handleResetToDefaults();
  };

  const handleExportSettings = () => {
    // Export the current model settings to a JSON file
    const settings = {
      models,
      ollamaEndpoint,
      promptAdvisorModel,
      responseValidatorModel,
      defaultEvaluationCriteria,
      defaultQueryTemplate
    };
    
    const jsonStr = JSON.stringify(settings, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    
    // Create a temporary link and trigger the download
    const link = document.createElement('a');
    link.href = href;
    link.download = 'llm-settings.json';
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  };

  const handleImportSettings = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target.result);
        
        // Validate the imported data
        if (settings.models) {
          setModels(settings.models);
          // Save to localStorage
          localStorage.setItem('llmModels', JSON.stringify(settings.models));
        }
        
        if (settings.ollamaEndpoint) {
          setOllamaEndpoint(settings.ollamaEndpoint);
          localStorage.setItem('ollamaEndpoint', settings.ollamaEndpoint);
        }
        
        if (settings.promptAdvisorModel) {
          setPromptAdvisorModel(settings.promptAdvisorModel);
          localStorage.setItem('promptAdvisorModel', settings.promptAdvisorModel);
        }
        
        if (settings.responseValidatorModel) {
          setResponseValidatorModel(settings.responseValidatorModel);
          localStorage.setItem('responseValidatorModel', settings.responseValidatorModel);
        }
        
        if (settings.defaultEvaluationCriteria) {
          setDefaultEvaluationCriteria(settings.defaultEvaluationCriteria);
          localStorage.setItem('defaultEvaluationCriteria', settings.defaultEvaluationCriteria);
        }

        if (settings.defaultQueryTemplate) {
          setDefaultQueryTemplate(settings.defaultQueryTemplate);
          localStorage.setItem('defaultQueryTemplate', settings.defaultQueryTemplate);
        }
        
      } catch (err) {
        window.console.error('Failed to import settings:', err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleAddModel = () => {
    // Just a stub - no functionality needed
  };

  const handleEditModel = () => {
    // Just a stub - no functionality needed
  };

  const addGemmaModel = () => {
    setModels(prev => {
      // Create a copy of the current models
      const updatedModels = { ...prev };
      
      // Add or update the Gemma 3 model
      updatedModels['gemma3:12b'] = {
        vendor: 'Ollama',
        input: 0,
        output: 0,
        active: true,
        description: 'Open source Gemma 3 (12B) model for local inference via Ollama.'
      };
      
      // Save to localStorage
      localStorage.setItem('llmModels', JSON.stringify(updatedModels));
      
      return updatedModels;
    });
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        LLM Settings
      </Typography>
      
      {!showAppSettingsOnly && (
        <>
          <Typography variant="body2" color="textSecondary" paragraph>
            Configure the Large Language Models (LLMs) for use with the RAG system. You can set pricing, add custom models, and configure API settings.
          </Typography>
          
          {/* Ollama Endpoint Settings */}
          <Box mb={4}>
            <Typography variant="h6" gutterBottom>
              Local Inference with Ollama
            </Typography>
            <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
              <TextField
                fullWidth
                label="Ollama API Endpoint"
                value={ollamaEndpoint}
                onChange={e => setOllamaEndpoint(e.target.value)}
                helperText="The endpoint for your local Ollama instance (default: http://localhost:11434)"
                margin="normal"
                variant="outlined"
              />
              <Button 
                variant="outlined" 
                onClick={addGemmaModel}
                sx={{ mt: 1 }}
              >
                Ensure Gemma 3 12B Added
              </Button>
            </Paper>
          </Box>
          
          {/* Prompt Advisor Settings */}
          <Box mb={4}>
            <Typography variant="h6" gutterBottom>
              Prompt Advisor Settings
            </Typography>
            <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
              <FormControl fullWidth margin="normal">
                <InputLabel id="prompt-advisor-model-label">Prompt Advisor Model</InputLabel>
                <Select
                  labelId="prompt-advisor-model-label"
                  id="prompt-advisor-model"
                  value={promptAdvisorModel}
                  onChange={e => setPromptAdvisorModel(e.target.value)}
                  label="Prompt Advisor Model"
                >
                  <MenuItem value="gpt-4o">GPT-4o</MenuItem>
                  <MenuItem value="gpt-4o-mini">GPT-4o-mini</MenuItem>
                  <MenuItem value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</MenuItem>
                  <MenuItem value="llama3.2:latest">Llama 3</MenuItem>
                </Select>
                <FormHelperText>
                  Select the model to use for generating prompt improvement suggestions
                </FormHelperText>
              </FormControl>
              <Button 
                variant="outlined" 
                onClick={() => {
                  localStorage.setItem('promptAdvisorModel', promptAdvisorModel);
                }}
                sx={{ mt: 1 }}
              >
                Save Setting
              </Button>
            </Paper>
          </Box>
          
          {/* Model Pricing */}
          <Box mb={4}>
            <Box display="flex" alignItems="center" mb={2}>
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                Model Pricing & Configuration
              </Typography>
              <Button
                variant="outlined"
                startIcon={<SettingsBackupRestoreIcon />}
                onClick={handleResetClick}
                size="small"
                sx={{ mr: 1 }}
              >
                Reset to Defaults
              </Button>
              <Button
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={handleExportSettings}
                size="small"
                sx={{ mr: 1 }}
              >
                Export
              </Button>
              <Button
                variant="outlined"
                component="label"
                startIcon={<FileUploadIcon />}
                size="small"
              >
                Import
                <input
                  type="file"
                  hidden
                  onChange={handleImportSettings}
                  accept=".json"
                />
              </Button>
            </Box>
            
            <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
              <Box display="flex" justifyContent="flex-end" mb={2}>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={handleAddModel}
                  size="small"
                >
                  Add Custom Model
                </Button>
              </Box>
              
              <Grid container spacing={3}>
                {Object.entries(models)
                  .sort(([, a], [, b]) => {
                    // First by vendor
                    const vendorCompare = (a.vendor || '').localeCompare(b.vendor || '');
                    if (vendorCompare !== 0) return vendorCompare;
                    
                    // Then by cost (lowest first)
                    return (a.input + a.output) - (b.input + b.output);
                  })
                  .map(([modelId, model]) => {
                    const cardBgColor = model.active ? 'inherit' : 'action.disabledBackground';
                    const textColor = model.active ? 'text.primary' : 'text.disabled';
                    const costPerK = calculateCostPer1K(model);
                    
                    return (
                      <Grid item xs={12} sm={6} md={4} key={modelId}>
                        <Card 
                          variant="outlined" 
                          sx={{ 
                            height: '100%', 
                            bgcolor: cardBgColor,
                            border: model.active ? `1px solid ${vendorColors[model.vendor] || '#ccc'}` : undefined,
                          }}
                        >
                          <CardContent sx={{ pb: 1 }}>
                            <Box display="flex" alignItems="center" mb={1}>
                              <Box 
                                width={12} 
                                height={12} 
                                borderRadius="50%" 
                                bgcolor={vendorColors[model.vendor] || '#888'} 
                                mr={1} 
                              />
                              <Typography 
                                variant="subtitle1" 
                                fontWeight="bold"
                                color={textColor}
                                sx={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 1,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {modelId}
                              </Typography>
                            </Box>
                            
                            <Typography 
                              variant="body2" 
                              color={textColor} 
                              mb={2}
                              sx={{
                                minHeight: '40px',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {model.description || `${model.vendor || 'Unknown'} model`}
                            </Typography>
                            
                            <Typography variant="caption" color={textColor} component="div" mb={0.5}>
                              Input: ${model.input.toFixed(2)} per 1M tokens
                            </Typography>
                            <Typography variant="caption" color={textColor} component="div" mb={1}>
                              Output: ${model.output.toFixed(2)} per 1M tokens
                            </Typography>
                            
                            <Box 
                              py={0.75} 
                              px={1.5} 
                              bgcolor={costPerK > 0.1 ? 'error.50' : 'success.50'} 
                              borderRadius={1} 
                              display="inline-block"
                            >
                              <Typography 
                                variant="body2" 
                                fontWeight="bold" 
                                color={costPerK > 0.1 ? 'error.main' : 'success.main'}
                              >
                                ~${costPerK} per 1K tokens
                              </Typography>
                            </Box>
                          </CardContent>
                          
                          <CardActions>
                            <Box display="flex" justifyContent="space-between" width="100%">
                              <Button
                                size="small"
                                onClick={() => handleEditModel(modelId)}
                                startIcon={<EditIcon />}
                                color="primary"
                              >
                                Edit
                              </Button>
                              <Button
                                size="small"
                                onClick={() => testLlmConnection(modelId)}
                                startIcon={
                                  testResults[modelId] === 'testing' ? 
                                    <CircularProgress size={16} /> : 
                                    <VisibilityIcon />
                                }
                                color="secondary"
                                disabled={
                                  !model.active || 
                                  testResults[modelId] === 'testing'
                                }
                              >
                                Test
                              </Button>
                            </Box>
                          </CardActions>
                          
                          {testResults[modelId] && (
                            <Box 
                              p={1} 
                              bgcolor={
                                testResults[modelId] === 'success' ? 'success.50' : 
                                testResults[modelId] === 'error' ? 'error.50' : 
                                'grey.50'
                              }
                              display="flex"
                              alignItems="center"
                            >
                              {testResults[modelId] === 'success' && (
                                <CheckCircleIcon color="success" fontSize="small" sx={{ mr: 1 }} />
                              )}
                              {testResults[modelId] === 'error' && (
                                <ErrorIcon color="error" fontSize="small" sx={{ mr: 1 }} />
                              )}
                              <Typography 
                                variant="caption" 
                                color={
                                  testResults[modelId] === 'success' ? 'success.main' : 
                                  testResults[modelId] === 'error' ? 'error.main' : 
                                  'text.secondary'
                                }
                              >
                                {testResults[modelId].response}
                              </Typography>
                            </Box>
                          )}
                        </Card>
                      </Grid>
                    );
                  })}
              </Grid>
            </Paper>
          </Box>
        </>
      )}
    </Box>
  );
};

export default LlmSettings; 