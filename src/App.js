import React, { useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Container, Box, Paper, Tabs, Tab, Typography, Alert, Snackbar, IconButton, Dialog, DialogContent, AppBar, Toolbar, Button } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

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
      {value === index && (
        <Box p={3}>
          {children}
        </Box>
      )}
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
  const [showWelcome, setShowWelcome] = useState(true);
  const [showApiKeyNotice, setShowApiKeyNotice] = useState(true);
  
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

  // Check if user has seen welcome and api key messages before
  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem('hasSeenWelcome') === 'true';
    const hasSeenApiKeyNotice = localStorage.getItem('hasSeenApiKeyNotice') === 'true';
    
    if (hasSeenWelcome) {
      setShowWelcome(false);
    }
    
    if (hasSeenApiKeyNotice) {
      setShowApiKeyNotice(false);
    }
  }, []);

  // Function to dismiss welcome message
  const dismissWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem('hasSeenWelcome', 'true');
  };

  // Function to dismiss API key notice
  const dismissApiKeyNotice = () => {
    setShowApiKeyNotice(false);
    localStorage.setItem('hasSeenApiKeyNotice', 'true');
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg">
        <Box sx={{ my: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h4" component="h1" gutterBottom>
              RAG Playground
            </Typography>
            <Box>
              <IconButton 
                color="info" 
                onClick={() => {
                  setShowWelcome(true);
                  localStorage.removeItem('hasSeenWelcome');
                }}
                title="Show Help"
                sx={{ mr: 1 }}
              >
                <HelpOutlineIcon />
              </IconButton>
              <IconButton 
                color="primary" 
                onClick={() => setSettingsDialogOpen(true)}
                title="LLM Settings"
              >
                <SettingsIcon />
              </IconButton>
            </Box>
          </Box>
          
          {/* Display API key status */}
          {showApiKeyNotice && (
            <Alert 
              severity={apiKeysConfigured ? "success" : "error"} 
              sx={{ mb: 3 }}
              onClose={dismissApiKeyNotice}
            >
              {apiKeysConfigured 
                ? "API keys are configured from environment variables." 
                : "API keys are not configured. Please set REACT_APP_OPENAI_API_KEY and REACT_APP_ANTHROPIC_API_KEY in your .env file."}
            </Alert>
          )}
          
          {/* Introduction to the wizard flow */}
          {showWelcome && (
            <Paper elevation={1} sx={{ p: 2, mb: 3, bgcolor: 'info.light', color: 'info.contrastText', position: 'relative' }}>
              <IconButton 
                size="small" 
                onClick={dismissWelcome} 
                sx={{ position: 'absolute', top: 4, right: 4, color: 'info.contrastText' }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
              <Typography variant="h6" gutterBottom>
                Welcome to the RAG Playground Wizard
              </Typography>
              <Typography variant="body1">
                This application guides you through the complete RAG workflow in 5 sequential steps:
              </Typography>
              <Box component="ol" sx={{ mt: 1, pl: 2 }}>
                <Box component="li"><strong>Upload Documents</strong> - Add your knowledge base documents</Box>
                <Box component="li"><strong>Configure Vector Store</strong> - Set up the vector database for retrieval</Box>
                <Box component="li"><strong>Query</strong> - Ask questions to different LLM models</Box>
                <Box component="li"><strong>Compare Responses</strong> - View and analyze model outputs side by side</Box>
                <Box component="li"><strong>Validate Responses</strong> - Evaluate response quality with metrics</Box>
              </Box>
              <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                Follow the numbered steps and use the Next/Back buttons to navigate through the workflow.
              </Typography>
            </Paper>
          )}
          
          <Paper elevation={3}>
            <Box sx={{ position: 'relative' }}>
              {/* Step connection lines */}
              <Box sx={{ 
                position: 'absolute', 
                top: 36, 
                left: '10%', 
                width: '80%', 
                height: 4, 
                bgcolor: 'grey.300',
                zIndex: 0
              }} />
              
              {/* Progress line */}
              <Box sx={{ 
                position: 'absolute', 
                top: 36, 
                left: '10%', 
                width: tabValue === 0 ? '0%' : 
                       tabValue === 1 ? '20%' : 
                       tabValue === 2 ? '40%' : 
                       tabValue === 3 ? '60%' : '80%', 
                height: 4, 
                bgcolor: 'primary.main',
                zIndex: 1,
                transition: 'width 0.5s ease-in-out'
              }} />
              
              <Tabs
                value={tabValue}
                onChange={handleTabChange}
                indicatorColor="transparent"
                textColor="primary"
                centered
                variant="fullWidth"
                sx={{
                  '& .MuiTab-root': {
                    fontSize: '0.9rem',
                    minHeight: 72,
                    p: 1,
                    pt: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    '&:last-child': {
                      borderRight: 'none'
                    },
                    zIndex: 2,
                    position: 'relative'
                  }
                }}
              >
                <Tab 
                  icon={
                    <Box sx={{ 
                      width: 36, 
                      height: 36, 
                      bgcolor: tabValue >= 0 ? 'primary.main' : 'grey.300', 
                      color: 'white',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      mb: 1,
                      boxShadow: tabValue >= 0 ? 2 : 0
                    }}>
                      {tabValue > 0 ? <CheckIcon fontSize="small" /> : 1}
                    </Box>
                  } 
                  label="Upload Documents" 
                />
                <Tab 
                  icon={
                    <Box sx={{ 
                      width: 36, 
                      height: 36, 
                      bgcolor: tabValue >= 1 ? 'primary.main' : 'grey.300', 
                      color: 'white',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      mb: 1,
                      boxShadow: tabValue >= 1 ? 2 : 0
                    }}>
                      {tabValue > 1 ? <CheckIcon fontSize="small" /> : 2}
                    </Box>
                  } 
                  label="Configure Vector Store"
                  disabled={documents.length === 0}
                />
                <Tab 
                  icon={
                    <Box sx={{ 
                      width: 36, 
                      height: 36, 
                      bgcolor: tabValue >= 2 ? 'primary.main' : 'grey.300', 
                      color: 'white',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      mb: 1,
                      boxShadow: tabValue >= 2 ? 2 : 0
                    }}>
                      {tabValue > 2 ? <CheckIcon fontSize="small" /> : 3}
                    </Box>
                  } 
                  label="Query Models"
                  disabled={!vectorStore}
                />
                <Tab 
                  icon={
                    <Box sx={{ 
                      width: 36, 
                      height: 36, 
                      bgcolor: tabValue >= 3 ? 'primary.main' : 'grey.300', 
                      color: 'white',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      mb: 1,
                      boxShadow: tabValue >= 3 ? 2 : 0
                    }}>
                      {tabValue > 3 ? <CheckIcon fontSize="small" /> : 4}
                    </Box>
                  } 
                  label="Compare Responses"
                  disabled={Object.keys(llmResponses).length === 0}
                />
                <Tab 
                  icon={
                    <Box sx={{ 
                      width: 36, 
                      height: 36, 
                      bgcolor: tabValue >= 4 ? 'primary.main' : 'grey.300', 
                      color: 'white',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      mb: 1,
                      boxShadow: tabValue >= 4 ? 2 : 0
                    }}>
                      5
                    </Box>
                  } 
                  label="Validate Responses"
                  disabled={Object.keys(llmResponses).length === 0}
                />
              </Tabs>
            </Box>

            <TabPanel value={tabValue} index={0}>
              <DocumentUpload 
                onDocumentsUploaded={handleDocumentsUploaded} 
                isProcessing={isProcessing}
                setIsProcessing={setIsProcessing}
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                <Button
                  variant="contained"
                  color="primary"
                  disabled={documents.length === 0}
                  onClick={() => setTabValue(1)}
                >
                  Next: Configure Vector Store
                </Button>
              </Box>
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
              <VectorStoreConfig 
                documents={documents}
                namespaces={namespaces}
                onVectorStoreCreated={handleVectorStoreCreated}
                isProcessing={isProcessing}
                setIsProcessing={setIsProcessing}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => setTabValue(0)}
                >
                  Back: Upload Documents
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  disabled={!vectorStore}
                  onClick={() => setTabValue(2)}
                >
                  Next: Query
                </Button>
              </Box>
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
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => setTabValue(1)}
                >
                  Back: Configure Vector Store
                </Button>
              </Box>
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
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={handleBackToQuery}
                >
                  Back: Query
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => setTabValue(4)}
                  disabled={Object.keys(llmResponses).length === 0}
                >
                  Next: Validate Responses
                </Button>
              </Box>
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
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => setTabValue(3)}
                >
                  Back: Compare Responses
                </Button>
                <Button
                  variant="outlined"
                  color="success"
                  onClick={() => setTabValue(0)}
                  sx={{ ml: 'auto' }}
                >
                  Start New RAG Session
                </Button>
              </Box>
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