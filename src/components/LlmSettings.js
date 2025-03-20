import React, { useState, useEffect } from 'react';
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
  FormHelperText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Chip,
  Snackbar,
  Alert,
  FormControlLabel,
  Switch,
  Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { createLlmInstance, CustomAzureOpenAI } from '../utils/apiServices';
import axios from 'axios';

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
      output: 0.60,
      active: true,
      description: 'Affordable GPT-4 class model for everyday use.'
    },
    'o3-mini': {
      vendor: 'OpenAI',
      input: 0.15,
      output: 0.60,
      active: true,
      description: 'OpenAI\'s newest model with improved reasoning capabilities.'
    },
    
    // Azure OpenAI models
    'azure-gpt-4': {
      vendor: 'AzureOpenAI',
      input: 5.0,
      output: 15.0,
      active: true,
      description: 'Azure-hosted GPT-4 - most capable model for complex tasks.',
      deploymentName: 'gpt-4o'
    },
    'azure-gpt-4o': {
      vendor: 'AzureOpenAI',
      input: 5.0,
      output: 15.0,
      active: true,
      description: 'Azure-hosted GPT-4o - optimized version of GPT-4.',
      deploymentName: 'gpt-4o'
    },
    'azure-gpt-4o-mini': {
      vendor: 'AzureOpenAI',
      input: 0.15,
      output: 0.60,
      active: true,
      description: 'Azure-hosted GPT-4o-mini - affordable, faster version of GPT-4o.',
      deploymentName: 'gpt-4o-mini'
    },
    'azure-o3-mini': {
      vendor: 'AzureOpenAI',
      input: 0.15,
      output: 0.60,
      active: true,
      description: 'Azure-hosted o3-mini - newest model with improved reasoning capabilities.',
      deploymentName: 'gpt-4o-mini'
    },
    
    // Azure OpenAI embedding models
    'azure-text-embedding-3-small': {
      vendor: 'AzureOpenAI',
      input: 0.02,
      output: 0.02,
      active: true,
      description: 'Azure-hosted text-embedding-3-small - optimized for general text with good performance and cost efficiency.',
      deploymentName: 'text-embedding-3-small'
    },
    'azure-text-embedding-3-large': {
      vendor: 'AzureOpenAI',
      input: 0.13,
      output: 0.13,
      active: true,
      description: 'Azure-hosted text-embedding-3-large - better for complex technical content and longer context.',
      deploymentName: 'text-embedding-3-large'
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
  const [useParallelProcessing, setUseParallelProcessing] = useState(true);

  const vendorColors = {
    'OpenAI': '#10a37f',    // Green
    'AzureOpenAI': '#0078d4',  // Add Azure OpenAI with Microsoft blue color
    'Anthropic': '#5436da',  // Purple
    'Ollama': '#ff6b6b',     // Red
    'Other': '#888888'       // Gray
  };

  // Load parallel processing preference from localStorage on mount
  useEffect(() => {
    const savedPreference = localStorage.getItem('useParallelProcessing');
    console.log('LlmSettings - Loading parallel processing setting:', {
      savedPreference,
      asBoolean: savedPreference === 'true'
    });
    if (savedPreference !== null) {
      setUseParallelProcessing(savedPreference === 'true');
    }
  }, []);

  // Save parallel processing preference to localStorage
  useEffect(() => {
    console.log('LlmSettings - Saving parallel processing setting:', {
      value: useParallelProcessing,
      asString: useParallelProcessing.toString()
    });
    localStorage.setItem('useParallelProcessing', useParallelProcessing.toString());
  }, [useParallelProcessing]);

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

  // Test Azure LLM connectivity specifically
  const testAzureLlmConnection = async (modelId) => {
    // Update test results for this model to show "testing" status
    setTestResults(prev => ({...prev, [modelId]: 'testing'}));
    
    try {
      const modelData = models[modelId];
      if (!modelData || modelData.vendor !== 'AzureOpenAI') {
        throw new Error('Not an Azure model');
      }
      
      // Get the deployment name
      const deploymentName = modelData.deploymentName || modelId.replace('azure-', '');
      
      // Get the Azure API key and endpoint from environment variables
      const azureApiKey = process.env.REACT_APP_AZURE_OPENAI_API_KEY;
      const azureEndpoint = process.env.REACT_APP_AZURE_OPENAI_ENDPOINT;
      
      console.log('[AZURE TEST] Testing Azure Model:', {
        modelId,
        deploymentName,
        hasApiKey: !!azureApiKey,
        hasEndpoint: !!azureEndpoint,
        apiKeyLength: azureApiKey ? azureApiKey.length : 0,
        apiKeyFirstFiveChars: azureApiKey ? azureApiKey.substring(0, 5) : '',
        endpoint: azureEndpoint
      });
      
      if (!azureApiKey) {
        throw new Error('Azure API key is not set in environment variables');
      }
      
      if (!azureEndpoint) {
        throw new Error('Azure endpoint is not set in environment variables');
      }
      
      // Create the Azure LLM instance directly
      const llm = new CustomAzureOpenAI({
        azureApiKey,
        azureEndpoint,
        modelName: modelId, 
        deploymentName,
        temperature: 0,
        systemPrompt: 'You are a helpful assistant.',
        apiVersion: process.env.REACT_APP_AZURE_OPENAI_API_VERSION
      });
      
      // Test with a simple query
      const response = await llm.invoke('Hello, can you respond with a short greeting?');
      
      // Update test results on success
      setTestResults(prev => ({
        ...prev, 
        [modelId]: { 
          status: 'success', 
          response: typeof response === 'object' ? response.text : response 
        }
      }));
    } catch (err) {
      window.console.error(`[AZURE TEST] Error testing Azure model ${modelId}:`, err);
      setTestResults(prev => ({
        ...prev, 
        [modelId]: { 
          status: 'error', 
          error: err.message 
        }
      }));
    }
  };

  // Check available Azure deployments
  // eslint-disable-next-line no-unused-vars
  const checkAzureDeployments = async () => {
    try {
      // Get the Azure API key and endpoint from environment variables
      const azureApiKey = process.env.REACT_APP_AZURE_OPENAI_API_KEY;
      const azureEndpoint = process.env.REACT_APP_AZURE_OPENAI_ENDPOINT;
      
      console.log('[AZURE] Checking deployments:', {
        hasApiKey: !!azureApiKey,
        hasEndpoint: !!azureEndpoint, 
        endpoint: azureEndpoint
      });
      
      const response = await axios.post('/api/list-azure-deployments', {
        azureApiKey,
        azureEndpoint
      });
      
      console.log('[AZURE] Available deployments:', response.data);
      
      // Display deployments in a dialog
      setAzureDeployments(response.data.data || []);
      setShowDeploymentDialog(true);
    } catch (err) {
      console.error('[AZURE] Error checking deployments:', err);
      setErrorMessage(`Error checking Azure deployments: ${err.message}`);
      setShowError(true);
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
      'o3-mini': {
        vendor: 'OpenAI',
        input: 0.15,
        output: 0.60,
        active: true,
        description: 'OpenAI\'s newest model with improved reasoning capabilities.'
      },
      
      // Azure OpenAI models
      'azure-gpt-4': {
        vendor: 'AzureOpenAI',
        input: 5.0,
        output: 15.0,
        active: true,
        description: 'Azure-hosted GPT-4 - most capable model for complex tasks.',
        deploymentName: 'gpt-4o'
      },
      'azure-gpt-4o': {
        vendor: 'AzureOpenAI',
        input: 5.0,
        output: 15.0,
        active: true,
        description: 'Azure-hosted GPT-4o - optimized version of GPT-4.',
        deploymentName: 'gpt-4o'
      },
      'azure-gpt-4o-mini': {
        vendor: 'AzureOpenAI',
        input: 0.15,
        output: 0.60,
        active: true,
        description: 'Azure-hosted GPT-4o-mini - affordable, faster version of GPT-4o.',
        deploymentName: 'gpt-4o-mini'
      },
      'azure-o3-mini': {
        vendor: 'AzureOpenAI',
        input: 0.15,
        output: 0.60,
        active: true,
        description: 'Azure-hosted o3-mini - newest model with improved reasoning capabilities.',
        deploymentName: 'gpt-4o-mini'
      },
      
      // Azure OpenAI embedding models
      'azure-text-embedding-3-small': {
        vendor: 'AzureOpenAI',
        input: 0.02,
        output: 0.02,
        active: true,
        description: 'Azure-hosted text-embedding-3-small - optimized for general text with good performance and cost efficiency.',
        deploymentName: 'text-embedding-3-small'
      },
      'azure-text-embedding-3-large': {
        vendor: 'AzureOpenAI',
        input: 0.13,
        output: 0.13,
        active: true,
        description: 'Azure-hosted text-embedding-3-large - better for complex technical content and longer context.',
        deploymentName: 'text-embedding-3-large'
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

  // State for model dialog
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [editingModel, setEditingModel] = useState(null);
  const [editModelData, setEditModelData] = useState({
    modelId: '',
    vendor: 'OpenAI',
    input: 0,
    output: 0,
    active: true,
    description: '',
    deploymentName: ''
  });

  const handleAddModel = () => {
    setEditingModel(null);
    setEditModelData({
      modelId: '',
      vendor: 'OpenAI',
      input: 0,
      output: 0,
      active: true,
      description: '',
      deploymentName: ''
    });
    setShowModelDialog(true);
  };

  const handleEditModel = (modelId) => {
    const model = models[modelId];
    if (model) {
      setEditingModel(modelId);
      setEditModelData({
        modelId: modelId,
        vendor: model.vendor || 'OpenAI',
        input: model.input || 0,
        output: model.output || 0,
        active: model.active !== undefined ? model.active : true,
        description: model.description || '',
        deploymentName: model.deploymentName || ''
      });
      setShowModelDialog(true);
    }
  };

  const handleSaveModel = () => {
    const newModels = { ...models };
    
    // If editing existing model
    if (editingModel) {
      newModels[editingModel] = {
        vendor: editModelData.vendor,
        input: parseFloat(editModelData.input),
        output: parseFloat(editModelData.output),
        active: editModelData.active,
        description: editModelData.description
      };
      
      // Add deploymentName only for Azure models
      if (editModelData.vendor === 'AzureOpenAI' && editModelData.deploymentName) {
        newModels[editingModel].deploymentName = editModelData.deploymentName;
      }
    } 
    // If adding new model
    else if (editModelData.modelId) {
      newModels[editModelData.modelId] = {
        vendor: editModelData.vendor,
        input: parseFloat(editModelData.input),
        output: parseFloat(editModelData.output),
        active: editModelData.active,
        description: editModelData.description
      };
      
      // Add deploymentName only for Azure models
      if (editModelData.vendor === 'AzureOpenAI' && editModelData.deploymentName) {
        newModels[editModelData.modelId].deploymentName = editModelData.deploymentName;
      }
    }
    
    setModels(newModels);
    localStorage.setItem('llmModels', JSON.stringify(newModels));
    setShowModelDialog(false);
  };

  const handleDeleteModel = () => {
    if (editingModel) {
      const newModels = { ...models };
      delete newModels[editingModel];
      setModels(newModels);
      localStorage.setItem('llmModels', JSON.stringify(newModels));
      setShowModelDialog(false);
    }
  };

  // eslint-disable-next-line no-unused-vars
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

  // State for Azure deployments dialog
  const [azureDeployments, setAzureDeployments] = useState([]);
  const [showDeploymentDialog, setShowDeploymentDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showError, setShowError] = useState(false);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {showAppSettingsOnly ? "App Settings" : "LLM Settings"}
      </Typography>
      
      {/* Error Snackbar */}
      <Snackbar 
        open={showError} 
        autoHideDuration={6000} 
        onClose={() => setShowError(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setShowError(false)} severity="error">
          {errorMessage}
        </Alert>
      </Snackbar>
      
      {/* Model Edit Dialog */}
      <Dialog
        open={showModelDialog}
        onClose={() => setShowModelDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {editingModel ? `Edit Model: ${editingModel}` : 'Add New Model'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {!editingModel && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Model ID"
                  value={editModelData.modelId}
                  onChange={(e) => setEditModelData({...editModelData, modelId: e.target.value})}
                  helperText="Unique identifier for the model (e.g., gpt-4o, claude-3.5-sonnet)"
                />
              </Grid>
            )}
            
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Vendor</InputLabel>
                <Select
                  value={editModelData.vendor}
                  onChange={(e) => setEditModelData({...editModelData, vendor: e.target.value})}
                  label="Vendor"
                >
                  <MenuItem value="OpenAI">OpenAI</MenuItem>
                  <MenuItem value="AzureOpenAI">Azure OpenAI</MenuItem>
                  <MenuItem value="Anthropic">Anthropic</MenuItem>
                  <MenuItem value="Ollama">Ollama</MenuItem>
                  <MenuItem value="Other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Input Cost (per 1M tokens)"
                type="number"
                value={editModelData.input}
                onChange={(e) => setEditModelData({...editModelData, input: e.target.value})}
                InputProps={{
                  startAdornment: <Typography sx={{ mr: 1 }}>$</Typography>,
                }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Output Cost (per 1M tokens)"
                type="number"
                value={editModelData.output}
                onChange={(e) => setEditModelData({...editModelData, output: e.target.value})}
                InputProps={{
                  startAdornment: <Typography sx={{ mr: 1 }}>$</Typography>,
                }}
              />
            </Grid>
            
            {editModelData.vendor === 'AzureOpenAI' && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Azure Deployment Name"
                  value={editModelData.deploymentName}
                  onChange={(e) => setEditModelData({...editModelData, deploymentName: e.target.value})}
                  helperText="Exact deployment name from your Azure OpenAI resource"
                />
              </Grid>
            )}
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                multiline
                rows={2}
                value={editModelData.description}
                onChange={(e) => setEditModelData({...editModelData, description: e.target.value})}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset">
                <Typography component="legend">Status</Typography>
                <Chip 
                  label={editModelData.active ? "Active" : "Inactive"}
                  color={editModelData.active ? "success" : "default"}
                  onClick={() => setEditModelData({...editModelData, active: !editModelData.active})}
                  sx={{ cursor: 'pointer' }}
                />
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          {editingModel && (
            <Button 
              onClick={handleDeleteModel} 
              color="error"
              sx={{ mr: 'auto' }}
            >
              Delete
            </Button>
          )}
          <Button onClick={() => setShowModelDialog(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveModel} 
            variant="contained"
            disabled={!editingModel && !editModelData.modelId}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Azure Deployments Dialog */}
      <Dialog 
        open={showDeploymentDialog} 
        onClose={() => setShowDeploymentDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Available Azure OpenAI Deployments</DialogTitle>
        <DialogContent>
          {azureDeployments.length > 0 ? (
            <List>
              {azureDeployments.map((deployment, index) => (
                <ListItem key={index} divider>
                  <ListItemText
                    primary={deployment.id || 'Unknown'}
                    secondary={
                      <>
                        <Typography variant="body2" component="span">
                          Model: {deployment.model || 'Unknown'} | 
                          Status: {deployment.status || 'Unknown'}
                        </Typography>
                        <br />
                        <Typography variant="caption" component="span">
                          {deployment.id && `Use deployment name: "${deployment.id}"`}
                        </Typography>
                      </>
                    }
                  />
                  <Chip 
                    label={deployment.status === 'succeeded' ? 'Active' : deployment.status} 
                    color={deployment.status === 'succeeded' ? 'success' : 'default'}
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography>No deployments found or unable to retrieve deployments.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeploymentDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
      
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
                              <Box>
                                {model.vendor === 'AzureOpenAI' && (
                                  <Button
                                    size="small"
                                    onClick={() => testAzureLlmConnection(modelId)}
                                    startIcon={
                                      testResults[modelId] === 'testing' ? 
                                        <CircularProgress size={16} /> : 
                                        <VisibilityIcon />
                                    }
                                    color="info"
                                    disabled={
                                      !model.active || 
                                      testResults[modelId] === 'testing'
                                    }
                                    sx={{ mr: 1 }}
                                  >
                                    Test Azure
                                  </Button>
                                )}
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

      {showAppSettingsOnly && (
        <>
          <Typography variant="body2" color="textSecondary" paragraph>
            Configure application-wide settings and defaults.
          </Typography>
          
          {/* RAG Query Configuration */}
          <Box mb={4}>
            <Typography variant="h6" gutterBottom>
              RAG Query Configuration
            </Typography>
            <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={useParallelProcessing}
                    onChange={(e) => {
                      console.log('Parallel processing switch toggled:', {
                        newValue: e.target.checked,
                        oldValue: useParallelProcessing,
                        asString: e.target.checked.toString()
                      });
                      setUseParallelProcessing(e.target.checked);
                      localStorage.setItem('useParallelProcessing', e.target.checked.toString());
                    }}
                    color="primary"
                  />
                }
                label={
                  <Box display="flex" alignItems="center">
                    <Typography variant="body1" mr={1}>
                      Parallel Processing
                    </Typography>
                    <Tooltip title="Process all models in parallel for faster responses. Disable for sequential processing if you encounter rate limiting or timeouts.">
                      <HelpOutlineIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Box>
                }
              />
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
                  onChange={e => {
                    setPromptAdvisorModel(e.target.value);
                    localStorage.setItem('promptAdvisorModel', e.target.value);
                  }}
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
            </Paper>
          </Box>
          
          {/* Application Defaults */}
          <Box mb={4}>
            <Typography variant="h6" gutterBottom>
              Application Defaults
            </Typography>
            <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
              <Grid container spacing={2}>
                {/* Response Validator Model */}
                <Grid item xs={12}>
                  <FormControl fullWidth variant="outlined">
                    <InputLabel>Response Validator Model</InputLabel>
                    <Select
                      value={responseValidatorModel}
                      onChange={(e) => {
                        setResponseValidatorModel(e.target.value);
                        localStorage.setItem('responseValidatorModel', e.target.value);
                      }}
                      label="Response Validator Model"
                    >
                      {Object.keys(models)
                        .filter(modelId => models[modelId].active)
                        .sort()
                        .map(modelId => (
                          <MenuItem key={modelId} value={modelId}>
                            {modelId}
                          </MenuItem>
                        ))
                      }
                    </Select>
                    <FormHelperText>Model used for response validation</FormHelperText>
                  </FormControl>
                </Grid>
                
                {/* Default Evaluation Criteria */}
                <Grid item xs={12}>
                  <TextField
                    label="Default Evaluation Criteria"
                    multiline
                    rows={6}
                    fullWidth
                    value={defaultEvaluationCriteria}
                    onChange={(e) => {
                      setDefaultEvaluationCriteria(e.target.value);
                      localStorage.setItem('defaultEvaluationCriteria', e.target.value);
                    }}
                    variant="outlined"
                    helperText="Default criteria for evaluating model responses (one per line)"
                  />
                </Grid>
                
                {/* Default Query Template */}
                <Grid item xs={12}>
                  <TextField
                    label="Default Query Template"
                    multiline
                    rows={3}
                    fullWidth
                    value={defaultQueryTemplate}
                    onChange={(e) => {
                      setDefaultQueryTemplate(e.target.value);
                      localStorage.setItem('defaultQueryTemplate', e.target.value);
                    }}
                    variant="outlined"
                    helperText="Default template for formatting user queries (use {{query}} placeholder)"
                  />
                </Grid>
              </Grid>
            </Paper>
          </Box>
        </>
      )}
    </Box>
  );
};

export default LlmSettings; 