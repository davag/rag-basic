import React, { useState, useEffect } from 'react';
import { 
  Box, 
  TextField, 
  Button, 
  Typography, 
  Alert,
  Paper,
  Snackbar
} from '@mui/material';

const ApiKeyInput = () => {
  const [openaiKey, setOpenaiKey] = useState(localStorage.getItem('openai_api_key') || '');
  const [anthropicKey, setAnthropicKey] = useState(localStorage.getItem('anthropic_api_key') || '');
  const [showSnackbar, setShowSnackbar] = useState(false);
  
  // Set environment variables from localStorage on component mount
  useEffect(() => {
    if (openaiKey) {
      window.process = window.process || {};
      window.process.env = window.process.env || {};
      window.process.env.REACT_APP_OPENAI_API_KEY = openaiKey;
    }
    
    if (anthropicKey) {
      window.process = window.process || {};
      window.process.env = window.process.env || {};
      window.process.env.REACT_APP_ANTHROPIC_API_KEY = anthropicKey;
    }
  }, [openaiKey, anthropicKey]);
  
  const handleSaveKeys = () => {
    // Save to localStorage
    if (openaiKey) {
      localStorage.setItem('openai_api_key', openaiKey);
    } else {
      localStorage.removeItem('openai_api_key');
    }
    
    if (anthropicKey) {
      localStorage.setItem('anthropic_api_key', anthropicKey);
    } else {
      localStorage.removeItem('anthropic_api_key');
    }
    
    // Set in window.process.env for current session
    window.process = window.process || {};
    window.process.env = window.process.env || {};
    window.process.env.REACT_APP_OPENAI_API_KEY = openaiKey;
    window.process.env.REACT_APP_ANTHROPIC_API_KEY = anthropicKey;
    
    setShowSnackbar(true);
  };
  
  const handleClearKeys = () => {
    setOpenaiKey('');
    setAnthropicKey('');
    localStorage.removeItem('openai_api_key');
    localStorage.removeItem('anthropic_api_key');
    
    // Remove from window.process.env
    if (window.process && window.process.env) {
      delete window.process.env.REACT_APP_OPENAI_API_KEY;
      delete window.process.env.REACT_APP_ANTHROPIC_API_KEY;
    }
    
    setShowSnackbar(true);
  };
  
  return (
    <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        API Keys
      </Typography>
      
      <Alert severity="info" sx={{ mb: 2 }}>
        Your API keys are stored locally in your browser and are never sent to our servers.
        They are only used to make direct API calls to OpenAI and Anthropic.
      </Alert>
      
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          label="OpenAI API Key"
          variant="outlined"
          value={openaiKey}
          onChange={(e) => setOpenaiKey(e.target.value)}
          type="password"
          placeholder="sk-..."
          sx={{ mb: 2 }}
        />
        
        <TextField
          fullWidth
          label="Anthropic API Key"
          variant="outlined"
          value={anthropicKey}
          onChange={(e) => setAnthropicKey(e.target.value)}
          type="password"
          placeholder="sk-ant-..."
        />
      </Box>
      
      <Box display="flex" justifyContent="space-between">
        <Button 
          variant="contained" 
          color="primary" 
          onClick={handleSaveKeys}
        >
          Save API Keys
        </Button>
        
        <Button 
          variant="outlined" 
          color="secondary" 
          onClick={handleClearKeys}
        >
          Clear API Keys
        </Button>
      </Box>
      
      <Snackbar
        open={showSnackbar}
        autoHideDuration={3000}
        onClose={() => setShowSnackbar(false)}
        message="API keys updated"
      />
    </Paper>
  );
};

export default ApiKeyInput; 