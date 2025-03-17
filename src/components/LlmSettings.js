import React, { useState, useEffect } from 'react';
import { 
  Typography, 
  Box, 
  Paper, 
  Button,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  CardActions,
  Grid,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
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

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [currentModel, setCurrentModel] = useState(null);
  const [testingModel, setTestingModel] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [error, setError] = useState(null);
  const [ollamaEndpoint, setOllamaEndpoint] = useState(process.env.REACT_APP_OLLAMA_API_URL || 'http://localhost:11434');
  const [promptAdvisorModel, setPromptAdvisorModel] = useState('gpt-4o-mini'); // Default advisor model
  const [responseValidatorModel, setResponseValidatorModel] = useState('gpt-4o-mini'); // Default validator model
  const [defaultEvaluationCriteria, setDefaultEvaluationCriteria] = useState(
    'Accuracy: Does the response correctly answer the query based on the provided context?\n' +
    'Completeness: Does the response address all aspects of the query?\n' +
    'Relevance: Is the information in the response relevant to the query?\n' +
    'Conciseness: Is the response appropriately concise without omitting important information?\n' +
    'Clarity: Is the response clear, well-structured, and easy to understand?'
  );
  const [defaultQueryTemplate, setDefaultQueryTemplate] = useState('');

  const vendorColors = {
    'OpenAI': '#10a37f',    // Green
    'Anthropic': '#5436da',  // Purple
    'Ollama': '#ff6b6b',     // Red
    'Other': '#888888'       // Gray
  };

  // Initial model form state
  const emptyModelForm = {
    id: '',
    vendor: 'OpenAI',
    input: 0,
    output: 0,
    description: '',
    active: true
  };

  const [modelForm, setModelForm] = useState({...emptyModelForm});

  // Handle form input changes
  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setModelForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : 
              (name === 'input' || name === 'output') ? parseFloat(value) : value
    }));
  };

  // Open edit dialog for a model
  const handleEditModel = (modelId) => {
    const model = models[modelId];
    setModelForm({
      id: modelId,
      vendor: model.vendor,
      input: model.input,
      output: model.output,
      description: model.description,
      active: model.active
    });
    setCurrentModel(modelId);
    setEditDialogOpen(true);
  };

  // Save model edits
  const handleSaveEdit = () => {
    setModels(prev => ({
      ...prev,
      [currentModel]: {
        vendor: modelForm.vendor,
        input: modelForm.input,
        output: modelForm.output,
        description: modelForm.description,
        active: modelForm.active
      }
    }));
    setEditDialogOpen(false);
    localStorage.setItem('llmModels', JSON.stringify({
      ...models,
      [currentModel]: {
        vendor: modelForm.vendor,
        input: modelForm.input,
        output: modelForm.output,
        description: modelForm.description,
        active: modelForm.active
      }
    }));
  };

  // Open delete confirmation dialog
  const handleDeleteConfirm = (modelId) => {
    setCurrentModel(modelId);
    setDeleteDialogOpen(true);
  };

  // Delete a model
  const handleDeleteModel = () => {
    const newModels = {...models};
    delete newModels[currentModel];
    setModels(newModels);
    setDeleteDialogOpen(false);
    localStorage.setItem('llmModels', JSON.stringify(newModels));
  };

  // Open add model dialog
  const handleAddModel = () => {
    setModelForm({...emptyModelForm});
    setAddDialogOpen(true);
  };

  // Save new model
  const handleSaveNewModel = () => {
    // Validate the model ID
    if (!modelForm.id || modelForm.id.trim() === '') {
      setError('Model ID is required');
      return;
    }

    // Check if model ID already exists
    if (models[modelForm.id]) {
      setError('Model ID already exists');
      return;
    }

    setModels(prev => ({
      ...prev,
      [modelForm.id]: {
        vendor: modelForm.vendor,
        input: modelForm.input,
        output: modelForm.output,
        description: modelForm.description,
        active: modelForm.active
      }
    }));
    setAddDialogOpen(false);
    setError(null);
    localStorage.setItem('llmModels', JSON.stringify({
      ...models,
      [modelForm.id]: {
        vendor: modelForm.vendor,
        input: modelForm.input,
        output: modelForm.output,
        description: modelForm.description,
        active: modelForm.active
      }
    }));
  };

  // Test LLM connectivity
  const testLlmConnection = async (modelId) => {
    setTestingModel(modelId);
    setTestResults(prev => ({...prev, [modelId]: { status: 'testing' }}));
    
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
    
    setTestingModel(null);
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
      
      // Anthropic models
      'claude-3-7-sonnet-latest': {
        vendor: 'Anthropic',
        input: 3.0,
        output: 15.0,
        active: true,
        description: 'Anthropic\'s most capable model for complex tasks.'
      },
      'claude-3-5-sonnet-latest': {
        vendor: 'Anthropic',
        input: 3.0,
        output: 15.0,
        active: true,
        description: 'Excellent balance of intelligence and speed.'
      },
      
      // Ollama models
      'llama3.2:latest': {
        vendor: 'Ollama',
        input: 0,
        output: 0,
        active: true,
        description: 'Meta\'s Llama 3 model (8B) for local inference.'
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
        description: 'Mistral AI\'s 7B model for local inference.'
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
      'Clarity: Is the response clear, well-structured, and easy to understand?';
    
    setDefaultEvaluationCriteria(defaultCriteria);
    localStorage.setItem('defaultEvaluationCriteria', defaultCriteria);
    
    setDefaultQueryTemplate('');
    localStorage.setItem('defaultQueryTemplate', '');
  };

  // Export settings to JSON
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

  // Import settings from JSON
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
        setError('Failed to import settings: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Save prompt advisor model to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('promptAdvisorModel', promptAdvisorModel);
  }, [promptAdvisorModel]);

  // Load prompt advisor model from localStorage on component mount
  useEffect(() => {
    const savedAdvisorModel = localStorage.getItem('promptAdvisorModel');
    if (savedAdvisorModel) {
      setPromptAdvisorModel(savedAdvisorModel);
    }
  }, []);

  // Load response validator model from localStorage on component mount
  useEffect(() => {
    const savedValidatorModel = localStorage.getItem('responseValidatorModel');
    if (savedValidatorModel) {
      setResponseValidatorModel(savedValidatorModel);
    }
  }, []);

  // Load models from localStorage on component mount
  useEffect(() => {
    const savedModels = localStorage.getItem('llmModels');
    if (savedModels) {
      try {
        setModels(JSON.parse(savedModels));
      } catch (err) {
        window.console.error('Error loading saved models:', err);
      }
    }
  }, []);

  // Save Ollama endpoint to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('ollamaEndpoint', ollamaEndpoint);
  }, [ollamaEndpoint]);

  // Load Ollama endpoint from localStorage on component mount
  useEffect(() => {
    const savedEndpoint = localStorage.getItem('ollamaEndpoint');
    if (savedEndpoint) {
      setOllamaEndpoint(savedEndpoint);
    }
  }, []);

  // Save response validator model to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('responseValidatorModel', responseValidatorModel);
  }, [responseValidatorModel]);

  // Save default evaluation criteria to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('defaultEvaluationCriteria', defaultEvaluationCriteria);
  }, [defaultEvaluationCriteria]);

  // Load default evaluation criteria from localStorage on component mount
  useEffect(() => {
    const savedCriteria = localStorage.getItem('defaultEvaluationCriteria');
    if (savedCriteria) {
      setDefaultEvaluationCriteria(savedCriteria);
    }
  }, []);

  // Save default query template to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('defaultQueryTemplate', defaultQueryTemplate);
  }, [defaultQueryTemplate]);

  // Load default query template from localStorage on component mount
  useEffect(() => {
    const savedTemplate = localStorage.getItem('defaultQueryTemplate');
    if (savedTemplate) {
      setDefaultQueryTemplate(savedTemplate);
    }
  }, []);

  // Calculate cost for 1K tokens
  const calculateCostPer1K = (model) => {
    // For 1K tokens, assume 500 input and 500 output
    const inputCost = (model.input * 500) / 1000000;
    const outputCost = (model.output * 500) / 1000000;
    return (inputCost + outputCost).toFixed(4);
  };

  // Handle reset button click
  const handleResetClick = () => {
    setResetDialogOpen(true);
  };

  // Handle confirm reset
  const handleConfirmReset = () => {
    handleResetToDefaults();
    setResetDialogOpen(false);
  };

  // Add Gemma model specifically
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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">
          {showAppSettingsOnly ? "App Settings" : "LLM Settings"}
        </Typography>
        <Box>
          <input
            type="file"
            accept=".json"
            onChange={handleImportSettings}
            style={{ display: 'none' }}
            id="import-settings-button"
          />
          <label htmlFor="import-settings-button">
            <Button 
              component="span"
              startIcon={<FileUploadIcon />} 
              variant="outlined"
              sx={{ mr: 1 }}
            >
              Import
            </Button>
          </label>
          <Button 
            startIcon={<FileDownloadIcon />} 
            variant="outlined"
            onClick={handleExportSettings}
            sx={{ mr: 1 }}
          >
            Export
          </Button>
          <Button 
            startIcon={<SettingsBackupRestoreIcon />}
            variant="outlined" 
            color="warning"
            onClick={handleResetClick}
            sx={{ mr: 1 }}
          >
            Reset
          </Button>
          {!showAppSettingsOnly && (
            <Button 
              startIcon={<AddIcon />}
              variant="contained" 
              color="primary"
              onClick={handleAddModel}
            >
              Add Model
            </Button>
          )}
        </Box>
      </Box>

      <Typography variant="body2" color="textSecondary" paragraph>
        {showAppSettingsOnly 
          ? "This panel allows you to configure app-wide settings such as default evaluation criteria and query templates."
          : "This panel allows you to manage the LLM models available in the application. You can add, edit, and remove models, as well as test their connectivity. The costs are used to estimate usage expenses in the comparison and validation tabs."
        }
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {!showAppSettingsOnly && (
        <>
          {/* Ollama Configuration */}
          <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Ollama Configuration
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Configure the API endpoint for local Ollama models. This setting is required for using models like Llama and Mistral via Ollama.
            </Typography>
            <TextField
              fullWidth
              label="Ollama API Endpoint"
              variant="outlined"
              value={ollamaEndpoint}
              onChange={(e) => setOllamaEndpoint(e.target.value)}
              placeholder="http://localhost:11434"
              helperText="The URL of your Ollama API endpoint for local models"
            />
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button 
                variant="outlined" 
                color="primary"
                onClick={addGemmaModel}
                sx={{ mr: 1 }}
              >
                Ensure Gemma 3 12B Added
              </Button>
            </Box>
          </Paper>

          {/* Prompt Advisor Configuration */}
          <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Prompt Advisor Configuration
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Select the model to use for generating system prompt improvement ideas. This model will be used when you request suggestions to enhance your prompts.
            </Typography>
            <Box sx={{ maxWidth: 400 }}>
              <FormControl fullWidth variant="outlined">
                <InputLabel id="prompt-advisor-model-label">Prompt Advisor Model</InputLabel>
                <Select
                  labelId="prompt-advisor-model-label"
                  value={promptAdvisorModel}
                  onChange={(e) => setPromptAdvisorModel(e.target.value)}
                  label="Prompt Advisor Model"
                >
                  <MenuItem value="gpt-4o">GPT-4o</MenuItem>
                  <MenuItem value="gpt-4o-mini">GPT-4o Mini</MenuItem>
                  <MenuItem value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</MenuItem>
                  <MenuItem value="claude-3-7-sonnet-latest">Claude 3.7 Sonnet</MenuItem>
                  <Divider />
                  <MenuItem disabled>
                    <Typography variant="subtitle2">Ollama Models</Typography>
                  </MenuItem>
                  <MenuItem value="llama3.2:latest">Llama 3 (8B)</MenuItem>
                  <MenuItem value="gemma3:12b">Gemma 3 (12B)</MenuItem>
                  <MenuItem value="mistral:latest">Mistral (7B)</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Paper>

          {/* Response Validator Configuration */}
          <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Response Validator Configuration
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Select the model to use for validating responses in the validation tab. This model will analyze responses for accuracy, hallucinations, and other quality metrics.
            </Typography>
            <Box sx={{ maxWidth: 400 }}>
              <FormControl fullWidth variant="outlined">
                <InputLabel id="response-validator-model-label">Response Validator Model</InputLabel>
                <Select
                  labelId="response-validator-model-label"
                  value={responseValidatorModel}
                  onChange={(e) => setResponseValidatorModel(e.target.value)}
                  label="Response Validator Model"
                >
                  <MenuItem value="gpt-4o">GPT-4o</MenuItem>
                  <MenuItem value="gpt-4o-mini">GPT-4o Mini</MenuItem>
                  <MenuItem value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</MenuItem>
                  <MenuItem value="claude-3-7-sonnet-latest">Claude 3.7 Sonnet</MenuItem>
                  <Divider />
                  <MenuItem disabled>
                    <Typography variant="subtitle2">Ollama Models</Typography>
                  </MenuItem>
                  <MenuItem value="llama3.2:latest">Llama 3 (8B)</MenuItem>
                  <MenuItem value="gemma3:12b">Gemma 3 (12B)</MenuItem>
                  <MenuItem value="mistral:latest">Mistral (7B)</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Paper>
        </>
      )}

      {/* Default Evaluation Criteria Configuration */}
      <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Default Evaluation Criteria
        </Typography>
        <Typography variant="body2" color="textSecondary" paragraph>
          Define the default criteria used to evaluate model responses in the validation tab.
          These criteria will be used as the starting point whenever you validate responses.
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={8}
          maxRows={20}
          variant="outlined"
          value={defaultEvaluationCriteria}
          onChange={(e) => setDefaultEvaluationCriteria(e.target.value)}
          placeholder="Enter evaluation criteria, one per line..."
          helperText="Each criterion should be clear and specific. Format as 'Criterion: Description'"
          sx={{ 
            '& .MuiOutlinedInput-root': {
              fontSize: '0.95rem'
            }
          }}
        />
        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            color="secondary"
            onClick={() => {
              const defaultCriteria = 'Accuracy: Does the response correctly answer the query based on the provided context?\n' +
                'Completeness: Does the response address all aspects of the query?\n' +
                'Relevance: Is the information in the response relevant to the query?\n' +
                'Conciseness: Is the response appropriately concise without omitting important information?\n' +
                'Clarity: Is the response clear, well-structured, and easy to understand?';
              setDefaultEvaluationCriteria(defaultCriteria);
            }}
          >
            Reset to Default Criteria
          </Button>
        </Box>
      </Paper>

      {/* Default Query Template */}
      <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Default Query Template
        </Typography>
        <Typography variant="body2" color="textSecondary" paragraph>
          Define a default template for queries. This will be pre-filled in the query field when starting a new query.
          Leave empty if you don't want a default template.
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={6}
          maxRows={20}
          variant="outlined"
          value={defaultQueryTemplate}
          onChange={(e) => setDefaultQueryTemplate(e.target.value)}
          placeholder="Enter a default query template..."
          helperText="This will be the starting point for new queries. Use it for common question structures."
          sx={{ 
            '& .MuiOutlinedInput-root': {
              fontSize: '0.95rem'
            }
          }}
        />
      </Paper>

      {!showAppSettingsOnly && (
        <Grid container spacing={3}>
          {Object.entries(models).map(([modelId, model]) => (
            <Grid item xs={12} md={6} lg={4} key={modelId}>
              <Card 
                variant="outlined" 
                sx={{ 
                  height: '100%', 
                  display: 'flex', 
                  flexDirection: 'column',
                  opacity: model.active ? 1 : 0.7
                }}
              >
                <Box 
                  sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    p: 2,
                    borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
                    bgcolor: model.active ? `${vendorColors[model.vendor]}15` : 'transparent'
                  }}
                >
                  <Box 
                    sx={{ 
                      width: 16, 
                      height: 16, 
                      borderRadius: '50%',
                      bgcolor: vendorColors[model.vendor] || vendorColors.Other,
                      mr: 1 
                    }} 
                  />
                  <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
                    {modelId}
                  </Typography>
                  <Chip 
                    label={model.vendor} 
                    size="small" 
                    sx={{ 
                      bgcolor: `${vendorColors[model.vendor]}22`,
                      color: vendorColors[model.vendor] || vendorColors.Other
                    }} 
                  />
                </Box>
                
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography variant="body2" color="textSecondary" paragraph>
                    {model.description}
                  </Typography>
                  
                  <Grid container spacing={1} sx={{ mt: 1 }}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary">
                        Input cost (per 1M tokens)
                      </Typography>
                      <Typography variant="body2">
                        {model.input === 0 ? 'Free' : `$${model.input.toFixed(2)}`}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary">
                        Output cost (per 1M tokens)
                      </Typography>
                      <Typography variant="body2">
                        {model.output === 0 ? 'Free' : `$${model.output.toFixed(2)}`}
                      </Typography>
                    </Grid>
                  </Grid>
                  
                  <Typography variant="body2" sx={{ mt: 2 }}>
                    1K tokens ≈ {calculateCostPer1K(model)}
                  </Typography>
                </CardContent>
                
                <CardActions sx={{ display: 'flex', justifyContent: 'space-between', p: 2, borderTop: '1px solid rgba(0, 0, 0, 0.12)' }}>
                  <Box>
                    <IconButton 
                      onClick={() => handleEditModel(modelId)} 
                      size="small"
                      title="Edit model"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton 
                      onClick={() => handleDeleteConfirm(modelId)} 
                      size="small"
                      title="Delete model"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  
                  <Button
                    size="small"
                    startIcon={<VisibilityIcon />}
                    onClick={() => testLlmConnection(modelId)}
                    disabled={testingModel === modelId}
                  >
                    {testingModel === modelId ? (
                      <>
                        <CircularProgress size={16} sx={{ mr: 1 }} />
                        Testing...
                      </>
                    ) : 'Test Connection'}
                  </Button>
                </CardActions>
                
                {testResults[modelId] && (
                  <Box sx={{ p: 2, borderTop: '1px solid rgba(0, 0, 0, 0.12)', bgcolor: '#f9f9f9' }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Test Results:
                    </Typography>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      {testResults[modelId].status === 'success' ? (
                        <>
                          <CheckCircleIcon color="success" fontSize="small" sx={{ mr: 1 }} />
                          <Typography variant="body2" color="success.main">
                            Connection successful!
                          </Typography>
                        </>
                      ) : (
                        <>
                          <ErrorIcon color="error" fontSize="small" sx={{ mr: 1 }} />
                          <Typography variant="body2" color="error">
                            {testResults[modelId].error}
                          </Typography>
                        </>
                      )}
                    </Box>
                  </Box>
                )}
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Edit Model Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)}>
        <DialogTitle>Edit Model: {currentModel}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                name="vendor"
                label="Vendor"
                fullWidth
                value={modelForm.vendor}
                onChange={handleFormChange}
                select
                SelectProps={{
                  native: true,
                }}
              >
                <option value="OpenAI">OpenAI</option>
                <option value="Anthropic">Anthropic</option>
                <option value="Ollama">Ollama</option>
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField
                name="input"
                label="Input cost (per 1M tokens)"
                type="number"
                fullWidth
                value={modelForm.input}
                onChange={handleFormChange}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                name="output"
                label="Output cost (per 1M tokens)"
                type="number"
                fullWidth
                value={modelForm.output}
                onChange={handleFormChange}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="description"
                label="Model Description"
                fullWidth
                multiline
                rows={2}
                value={modelForm.description}
                onChange={handleFormChange}
              />
            </Grid>
            <Grid item xs={12}>
              <Box display="flex" alignItems="center">
                <Typography variant="body2" sx={{ mr: 2 }}>
                  Model active:
                </Typography>
                <input
                  type="checkbox"
                  name="active"
                  checked={modelForm.active}
                  onChange={handleFormChange}
                />
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained" color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Model</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the model "{currentModel}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteModel} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Model Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)}>
        <DialogTitle>Add New Model</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                name="id"
                label="Model ID"
                fullWidth
                value={modelForm.id}
                onChange={handleFormChange}
                helperText="Enter a unique identifier for the model (e.g., 'gpt-4o', 'claude-3-5-sonnet-latest')"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="vendor"
                label="Vendor"
                fullWidth
                value={modelForm.vendor}
                onChange={handleFormChange}
                select
                SelectProps={{
                  native: true,
                }}
              >
                <option value="OpenAI">OpenAI</option>
                <option value="Anthropic">Anthropic</option>
                <option value="Ollama">Ollama</option>
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField
                name="input"
                label="Input cost (per 1M tokens)"
                type="number"
                fullWidth
                value={modelForm.input}
                onChange={handleFormChange}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                name="output"
                label="Output cost (per 1M tokens)"
                type="number"
                fullWidth
                value={modelForm.output}
                onChange={handleFormChange}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="description"
                label="Model Description"
                fullWidth
                multiline
                rows={2}
                value={modelForm.description}
                onChange={handleFormChange}
              />
            </Grid>
            <Grid item xs={12}>
              <Box display="flex" alignItems="center">
                <Typography variant="body2" sx={{ mr: 2 }}>
                  Model active:
                </Typography>
                <input
                  type="checkbox"
                  name="active"
                  checked={modelForm.active}
                  onChange={handleFormChange}
                />
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveNewModel} variant="contained" color="primary">
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetDialogOpen} onClose={() => setResetDialogOpen(false)}>
        <DialogTitle>Reset to Defaults</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to reset all settings to their default values? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmReset} variant="contained" color="error">
            Reset
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LlmSettings; 