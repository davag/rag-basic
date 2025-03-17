import React, { useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Container, Box, Paper, Tabs, Tab, Typography, Alert, Snackbar, IconButton, Dialog, DialogContent, AppBar, Toolbar } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';

import DocumentUpload from './components/DocumentUpload';
import VectorStoreConfig from './components/VectorStoreConfig';
import QueryInterface from './components/QueryInterface';
import ResponseComparison from './components/ResponseComparison';
import ResponseValidation from './components/ResponseValidation';
import LlmSettings from './components/LlmSettings';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box p={3}>{children}</Box>}
    </div>
  );
}

function App() {
  const [tabValue, setTabValue] = useState(0);
  const [documents, setDocuments] = useState([]);
  const [namespaces, setNamespaces] = useState(['default']);
  const [vectorStore, setVectorStore] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [llmResponses, setLlmResponses] = useState({});
  const [metrics, setMetrics] = useState({});
  const [currentQuery, setCurrentQuery] = useState('');
  const [systemPrompts, setSystemPrompts] = useState({});
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  const [validationResults, setValidationResults] = useState({});
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  
  // Store query interface state to preserve it when navigating back
  const [lastQueryState, setLastQueryState] = useState({
    query: '',
    selectedModels: ['gpt-4o-mini', 'claude-3-5-sonnet-latest'],
    selectedNamespaces: ['default'],
    globalSystemPrompt: '',
    useCustomPrompts: false,
    customSystemPrompts: {},
    globalTemperature: 0,
    useCustomTemperatures: false,
    customTemperatures: {}
  });

  const handleTabChange = (event, newValue) => {
    // Reset processing state when switching tabs
    if (isProcessing) {
      setIsProcessing(false);
    }
    
    // We no longer reset validation results when switching to the validation tab
    // This allows us to preserve the state when navigating back and forth
    
    setTabValue(newValue);
  };

  const handleDocumentsUploaded = (docs, uploadedNamespaces) => {
    setDocuments(docs);
    if (uploadedNamespaces) {
      setNamespaces(uploadedNamespaces);
    }
    // Automatically navigate to the second tab (Configure Vector Store)
    setTabValue(1);
  };

  const handleVectorStoreCreated = (store) => {
    setVectorStore(store);
    setTabValue(2); // Move to query interface after vector store is created
  };

  const handleQuerySubmitted = (responses, queryMetrics, query, prompts, queryState) => {
    setLlmResponses(responses);
    setMetrics(queryMetrics);
    setCurrentQuery(query);
    setSystemPrompts(prompts);
    
    // Save the query interface state for when the user navigates back
    if (queryState) {
      setLastQueryState(queryState);
    }
    
    setTabValue(3); // Move to response comparison after query is submitted
  };
  
  const handleBackToQuery = () => {
    // Reset processing state when going back to query
    setIsProcessing(false);
    
    // Navigate back to the query tab
    setTabValue(2);
  };
  
  const handleImportResults = (importedResults) => {
    try {
      // Validate the imported data
      if (!importedResults.query || !importedResults.responses || !importedResults.metrics) {
        throw new Error('Invalid results file format');
      }
      
      // Update application state with imported results
      setLlmResponses(importedResults.responses);
      setMetrics(importedResults.metrics);
      setCurrentQuery(importedResults.query);
      if (importedResults.systemPrompts) {
        setSystemPrompts(importedResults.systemPrompts);
      }
      
      // Update query state if it exists in the imported data
      if (importedResults.queryState) {
        setLastQueryState(importedResults.queryState);
      }
      
      // Navigate to the results tab
      setTabValue(3);
      
      // Show success message
      setSnackbarMessage('Results imported successfully');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error) {
      window.console.error('Error importing results:', error);
      setSnackbarMessage('Failed to import results. The file may be invalid or corrupted.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };
  
  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  const handleValidationComplete = (results) => {
    setValidationResults(results);
  };

  // Check if API keys are set
  const openAIApiKey = process.env.REACT_APP_OPENAI_API_KEY;
  const anthropicApiKey = process.env.REACT_APP_ANTHROPIC_API_KEY;
  const apiKeysConfigured = openAIApiKey && anthropicApiKey;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg">
        <Box sx={{ my: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h4" component="h1" gutterBottom>
              RAG Playground
            </Typography>
            <IconButton 
              color="primary" 
              onClick={() => setSettingsDialogOpen(true)}
              title="LLM Settings"
            >
              <SettingsIcon />
            </IconButton>
          </Box>
          
          {/* Display API key status */}
          {apiKeysConfigured ? (
            <Alert severity="success" sx={{ mb: 3 }}>
              API keys are configured from environment variables.
            </Alert>
          ) : (
            <Alert severity="error" sx={{ mb: 3 }}>
              API keys are not configured. Please set REACT_APP_OPENAI_API_KEY and REACT_APP_ANTHROPIC_API_KEY in your .env file.
            </Alert>
          )}
          
          <Paper elevation={3}>
            <Tabs
              value={tabValue}
              onChange={handleTabChange}
              indicatorColor="primary"
              textColor="primary"
              centered
            >
              <Tab label="Upload Documents" />
              <Tab label="Configure Vector Store" disabled={documents.length === 0} />
              <Tab label="Query" disabled={!vectorStore} />
              <Tab label="Compare Responses" disabled={Object.keys(llmResponses).length === 0} />
              <Tab label="Validate Responses" disabled={Object.keys(llmResponses).length === 0} />
            </Tabs>

            <TabPanel value={tabValue} index={0}>
              <DocumentUpload 
                onDocumentsUploaded={handleDocumentsUploaded} 
                isProcessing={isProcessing}
                setIsProcessing={setIsProcessing}
              />
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
              <VectorStoreConfig 
                documents={documents}
                namespaces={namespaces}
                onVectorStoreCreated={handleVectorStoreCreated}
                isProcessing={isProcessing}
                setIsProcessing={setIsProcessing}
              />
            </TabPanel>

            <TabPanel value={tabValue} index={2}>
              <QueryInterface 
                vectorStore={vectorStore}
                namespaces={namespaces}
                onQuerySubmitted={handleQuerySubmitted}
                isProcessing={isProcessing}
                setIsProcessing={setIsProcessing}
                initialState={lastQueryState}
              />
            </TabPanel>

            <TabPanel value={tabValue} index={3}>
              <ResponseComparison 
                responses={llmResponses}
                metrics={metrics}
                currentQuery={currentQuery}
                systemPrompts={systemPrompts}
                onBackToQuery={handleBackToQuery}
                onImportResults={handleImportResults}
              />
            </TabPanel>

            <TabPanel value={tabValue} index={4}>
              <ResponseValidation 
                responses={llmResponses}
                metrics={metrics}
                currentQuery={currentQuery}
                systemPrompts={systemPrompts}
                sources={Object.values(llmResponses)[0]?.sources || []}
                onValidationComplete={handleValidationComplete}
                validationResults={validationResults}
                isProcessing={isProcessing}
                setIsProcessing={setIsProcessing}
              />
            </TabPanel>
          </Paper>
        </Box>
        
        {/* Settings Dialog */}
        <Dialog 
          open={settingsDialogOpen} 
          onClose={() => setSettingsDialogOpen(false)}
          fullWidth
          maxWidth="lg"
        >
          <AppBar position="static" color="default" elevation={0}>
            <Toolbar>
              <Typography variant="h6" style={{ flexGrow: 1 }}>
                LLM Settings
              </Typography>
              <IconButton
                edge="end"
                color="inherit"
                onClick={() => setSettingsDialogOpen(false)}
                aria-label="close"
              >
                <CloseIcon />
              </IconButton>
            </Toolbar>
          </AppBar>
          <DialogContent dividers>
            <LlmSettings />
          </DialogContent>
        </Dialog>
        
        <Snackbar
          open={snackbarOpen}
          autoHideDuration={6000}
          onClose={handleSnackbarClose}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }}>
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </Container>
    </ThemeProvider>
  );
}

export default App; 