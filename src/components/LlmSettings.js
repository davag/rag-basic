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
import { createLlmInstance } from '../utils/apiServices';
import {
  defaultModels,
  defaultSettings,
  vendorColors,
} from '../config/llmConfig';
import axios from 'axios';

const LlmSettings = ({ showAppSettingsOnly = false }) => {
  // Load models from the configuration
  const [models, setModels] = useState(defaultModels);
  
  const [testResults, setTestResults] = useState({});
  const [ollamaEndpoint, setOllamaEndpoint] = useState(defaultSettings.ollamaEndpoint);
  const [promptAdvisorModel, setPromptAdvisorModel] = useState(defaultSettings.promptAdvisorModel);
  const [responseValidatorModel, setResponseValidatorModel] = useState(defaultSettings.responseValidatorModel);
  const [defaultEvaluationCriteria, setDefaultEvaluationCriteria] = useState(defaultSettings.defaultEvaluationCriteria);
  const [defaultQueryTemplate, setDefaultQueryTemplate] = useState('');
  const [useParallelProcessing, setUseParallelProcessing] = useState(defaultSettings.useParallelProcessing);
  // eslint-disable-next-line no-unused-vars
  const [isEmbeddingEnabled, setIsEmbeddingEnabled] = useState(defaultSettings.embeddingEnabled);
  
  // State for API keys
  // eslint-disable-next-line no-unused-vars
  const [openaiKey, setOpenaiKey] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [anthropicKey, setAnthropicKey] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [azureOpenAIKey, setAzureOpenAIKey] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [azureOpenAIEndpoint, setAzureOpenAIEndpoint] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [googleAIKey, setGoogleAIKey] = useState('');
  
  // State for API key visibility
  // eslint-disable-next-line no-unused-vars
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [showAzureKey, setShowAzureKey] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [showGoogleAIKey, setShowGoogleAIKey] = useState(false);
  
  // State for testing connection
  // eslint-disable-next-line no-unused-vars
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [currentModelBeingTested, setCurrentModelBeingTested] = useState('');
  
  // State for model dialog
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [editingModel, setEditingModel] = useState(null);
  const [editModelData, setEditModelData] = useState({
    modelId: '',
    name: '',
    vendor: '',
    maxTokens: 4096,
    contextLength: 8192,
    inputPrice: 0,
    outputPrice: 0,
    capabilities: {
      chat: true,
      images: false,
      vision: false,
      json: false
    },
    apiVersion: '',
    deploymentName: ''
  });
  
  // State for Azure deployments dialog
  const [azureDeployments, setAzureDeployments] = useState([]);
  const [showDeploymentDialog, setShowDeploymentDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showError, setShowError] = useState(false);

  // Add snackbar state management
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  });
  
  // Handle snackbar close
  const handleSnackbarClose = () => {
    setSnackbar({
      ...snackbar,
      open: false
    });
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
      const modelData = models[modelId];
      
      // Configure options based on model vendor
      if (modelData.vendor === 'Ollama') {
        options.ollamaEndpoint = ollamaEndpoint;
      }

      // Create and test LLM instance using the unified createLlmInstance function
      const llm = createLlmInstance(modelId, 'You are a helpful assistant.', options);
      console.log(`Testing model ${modelId} using standard interface`);
      
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

  // Load models from localStorage on component mount
  useEffect(() => {
    const savedModels = localStorage.getItem('llmModels');
    if (savedModels) {
      try {
        setModels(JSON.parse(savedModels));
      } catch (err) {
        console.error('Error parsing saved models:', err);
        setModels(defaultModels);
      }
    } else {
      setModels(defaultModels);
    }
    
    // Load Ollama endpoint from localStorage
    const savedOllamaEndpoint = localStorage.getItem('ollamaEndpoint');
    if (savedOllamaEndpoint) {
      setOllamaEndpoint(savedOllamaEndpoint);
    }
    
    // Load other settings
    const savedPromptAdvisorModel = localStorage.getItem('promptAdvisorModel');
    if (savedPromptAdvisorModel) {
      setPromptAdvisorModel(savedPromptAdvisorModel);
    }
    
    const savedResponseValidatorModel = localStorage.getItem('responseValidatorModel');
    if (savedResponseValidatorModel) {
      setResponseValidatorModel(savedResponseValidatorModel);
    }
    
    const savedDefaultEvaluationCriteria = localStorage.getItem('defaultEvaluationCriteria');
    if (savedDefaultEvaluationCriteria) {
      setDefaultEvaluationCriteria(savedDefaultEvaluationCriteria);
    }
    
    const savedDefaultQueryTemplate = localStorage.getItem('defaultQueryTemplate');
    if (savedDefaultQueryTemplate) {
      setDefaultQueryTemplate(savedDefaultQueryTemplate);
    }
  }, []);
  
  // Save models to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('llmModels', JSON.stringify(models));
  }, [models]);
  
  // Save Ollama endpoint to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('ollamaEndpoint', ollamaEndpoint);
  }, [ollamaEndpoint]);
  
  // Save other settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('promptAdvisorModel', promptAdvisorModel);
  }, [promptAdvisorModel]);
  
  useEffect(() => {
    localStorage.setItem('responseValidatorModel', responseValidatorModel);
  }, [responseValidatorModel]);
  
  useEffect(() => {
    localStorage.setItem('defaultEvaluationCriteria', defaultEvaluationCriteria);
  }, [defaultEvaluationCriteria]);
  
  useEffect(() => {
    localStorage.setItem('defaultQueryTemplate', defaultQueryTemplate);
  }, [defaultQueryTemplate]);

  const handleResetToDefaults = () => {
    console.log('Resetting all LLM settings to defaults');
    setModels(defaultModels);
    setOllamaEndpoint(defaultSettings.ollamaEndpoint);
    setPromptAdvisorModel(defaultSettings.promptAdvisorModel);
    setResponseValidatorModel(defaultSettings.responseValidatorModel);
    setDefaultEvaluationCriteria(defaultSettings.defaultEvaluationCriteria);
    setUseParallelProcessing(defaultSettings.useParallelProcessing);
    
    // Update in localStorage
    localStorage.setItem('llmModels', JSON.stringify(defaultModels));
    localStorage.setItem('ollamaEndpoint', defaultSettings.ollamaEndpoint);
    localStorage.setItem('promptAdvisorModel', defaultSettings.promptAdvisorModel);
    localStorage.setItem('responseValidatorModel', defaultSettings.responseValidatorModel);
    localStorage.setItem('defaultEvaluationCriteria', defaultSettings.defaultEvaluationCriteria);
    localStorage.setItem('useParallelProcessing', defaultSettings.useParallelProcessing.toString());
    
    // Clear test results
    setTestResults({});
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
    setEditingModel(null);
    setEditModelData({
      modelId: '',
      name: '',
      vendor: '',
      maxTokens: 4096,
      contextLength: 8192,
      inputPrice: 0,
      outputPrice: 0,
      capabilities: {
        chat: true,
        images: false,
        vision: false,
        json: false
      },
      apiVersion: '',
      deploymentName: ''
    });
    setShowModelDialog(true);
  };

  const handleEditModel = (modelId) => {
    const model = models[modelId];
    setEditingModel(modelId);
    setEditModelData({
      modelId,
      name: model.name || modelId,
      vendor: model.vendor || '',
      inputPrice: model.input || 0,
      outputPrice: model.output || 0,
      maxTokens: model.maxTokens || 4096,
      contextLength: model.contextLength || 8192,
      capabilities: model.capabilities || {
        chat: true,
        images: false,
        vision: false,
        json: false
      },
      apiVersion: model.apiVersion || '',
      deploymentName: model.deploymentName || ''
    });
    setShowModelDialog(true);
  };

  const handleSaveModel = () => {
    const updatedModels = { ...models };
    
    if (editingModel) {
      // Update existing model
      updatedModels[editingModel] = {
        ...updatedModels[editingModel],
        name: editModelData.name,
        vendor: editModelData.vendor,
        input: parseFloat(editModelData.inputPrice),
        output: parseFloat(editModelData.outputPrice),
        maxTokens: parseInt(editModelData.maxTokens),
        contextLength: parseInt(editModelData.contextLength),
        capabilities: editModelData.capabilities,
        apiVersion: editModelData.apiVersion,
        deploymentName: editModelData.deploymentName
      };
    } else {
      // Create new model
      updatedModels[editModelData.modelId] = {
        name: editModelData.name,
        vendor: editModelData.vendor,
        input: parseFloat(editModelData.inputPrice),
        output: parseFloat(editModelData.outputPrice),
        active: true,
        maxTokens: parseInt(editModelData.maxTokens),
        contextLength: parseInt(editModelData.contextLength),
        capabilities: editModelData.capabilities,
        apiVersion: editModelData.apiVersion,
        deploymentName: editModelData.deploymentName
      };
    }
    
    setModels(updatedModels);
    localStorage.setItem('modelSettings', JSON.stringify(updatedModels));
    setShowModelDialog(false);
    setEditingModel(null);
    
    // Show success message
    setSnackbar({
      open: true,
      message: `Model ${editingModel ? 'updated' : 'added'} successfully`,
      severity: 'success'
    });
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
        maxTokens: 4096,
        contextLength: 8192,
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
                value={editModelData.inputPrice}
                onChange={(e) => setEditModelData({...editModelData, inputPrice: e.target.value})}
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
                value={editModelData.outputPrice}
                onChange={(e) => setEditModelData({...editModelData, outputPrice: e.target.value})}
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
            
            {(editModelData.vendor === 'AzureOpenAI' || 
              (editModelData.modelId && editModelData.modelId.startsWith('azure-'))) && (
              <>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="API Version"
                    value={editModelData.apiVersion || ''}
                    onChange={(e) => 
                      setEditModelData({
                        ...editModelData,
                        apiVersion: e.target.value
                      })
                    }
                    helperText="API version (e.g., 2023-05-15 or 2025-01-31 for o3-mini)"
                    margin="normal"
                    variant="outlined"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Deployment Name"
                    value={editModelData.deploymentName || ''}
                    onChange={(e) => 
                      setEditModelData({
                        ...editModelData,
                        deploymentName: e.target.value
                      })
                    }
                    helperText="The deployment name in your Azure account"
                    margin="normal"
                    variant="outlined"
                  />
                </Grid>
              </>
            )}
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
                            
                            {/* Display API version and deployment name for Azure models */}
                            {model.vendor === 'AzureOpenAI' && (
                              <>
                                <Typography variant="caption" color={textColor} component="div" mb={0.5}>
                                  API Version: {model.apiVersion || '2023-05-15'}
                                </Typography>
                                {model.deploymentName && (
                                  <Typography variant="caption" color={textColor} component="div" mb={0.5}>
                                    Deployment: {model.deploymentName}
                                  </Typography>
                                )}
                              </>
                            )}
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

      {/* Success/error snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default LlmSettings; 