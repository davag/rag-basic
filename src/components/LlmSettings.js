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
  Chip
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

const LlmSettings = () => {
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
  const [currentModel, setCurrentModel] = useState(null);
  const [testingModel, setTestingModel] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [error, setError] = useState(null);
  const [ollamaEndpoint, setOllamaEndpoint] = useState(process.env.REACT_APP_OLLAMA_API_URL || 'http://localhost:11434');

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
    localStorage.removeItem('llmModels');
    window.location.reload();
  };

  // Export settings to JSON
  const handleExportSettings = () => {
    const dataStr = JSON.stringify(models, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'llm-settings.json');
    linkElement.click();
  };

  // Import settings from JSON
  const handleImportSettings = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedSettings = JSON.parse(e.target.result);
        setModels(importedSettings);
        localStorage.setItem('llmModels', JSON.stringify(importedSettings));
      } catch (err) {
        setError('Failed to parse imported settings file');
        window.console.error('Import error:', err);
      }
    };
    reader.readAsText(file);
  };

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

  // Calculate cost for 1K tokens
  const calculateCostPer1K = (model) => {
    // For 1K tokens, assume 500 input and 500 output
    const inputCost = (model.input * 500) / 1000000;
    const outputCost = (model.output * 500) / 1000000;
    return (inputCost + outputCost).toFixed(4);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">
          LLM Settings
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
            onClick={handleResetToDefaults}
            sx={{ mr: 1 }}
          >
            Reset
          </Button>
          <Button 
            startIcon={<AddIcon />}
            variant="contained" 
            color="primary"
            onClick={handleAddModel}
          >
            Add Model
          </Button>
        </Box>
      </Box>

      <Typography variant="body2" color="textSecondary" paragraph>
        This panel allows you to manage the LLM models available in the application. You can add, edit, and remove models,
        as well as test their connectivity. The costs are used to estimate usage expenses in the comparison and validation tabs.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {models['llama3.2:latest'] && (
        <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Ollama Configuration
          </Typography>
          <TextField
            fullWidth
            label="Ollama API Endpoint"
            variant="outlined"
            value={ollamaEndpoint}
            onChange={(e) => setOllamaEndpoint(e.target.value)}
            placeholder="http://localhost:11434"
            helperText="The URL of your Ollama API endpoint for local models"
            size="small"
          />
        </Paper>
      )}

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
                
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="textSecondary">
                    Approximate cost per 1K tokens
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                    {model.input === 0 && model.output === 0 ? 'Free' : `$${calculateCostPer1K(model)}`}
                  </Typography>
                </Box>
                
                {testResults[modelId] && (
                  <Box sx={{ mt: 2, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                    {testResults[modelId].status === 'success' ? (
                      <>
                        <Box display="flex" alignItems="center">
                          <CheckCircleIcon color="success" fontSize="small" sx={{ mr: 1 }} />
                          <Typography variant="body2" color="success.main">Connection successful</Typography>
                        </Box>
                        {testResults[modelId].response && (
                          <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                            Response: {testResults[modelId].response.substring(0, 100)}
                            {testResults[modelId].response.length > 100 ? '...' : ''}
                          </Typography>
                        )}
                      </>
                    ) : testResults[modelId].status === 'error' ? (
                      <>
                        <Box display="flex" alignItems="center">
                          <ErrorIcon color="error" fontSize="small" sx={{ mr: 1 }} />
                          <Typography variant="body2" color="error">Connection failed</Typography>
                        </Box>
                        {testResults[modelId].error && (
                          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
                            Error: {testResults[modelId].error}
                          </Typography>
                        )}
                      </>
                    ) : (
                      <CircularProgress size={16} />
                    )}
                  </Box>
                )}
              </CardContent>
              
              <CardActions>
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
                <Box sx={{ flexGrow: 1 }} />
                <IconButton 
                  size="small" 
                  onClick={() => handleEditModel(modelId)}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton 
                  size="small" 
                  color="error"
                  onClick={() => handleDeleteConfirm(modelId)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

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
    </Box>
  );
};

export default LlmSettings; 