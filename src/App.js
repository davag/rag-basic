import React, { useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Container, Box, Paper, Tabs, Tab, Typography, Alert } from '@mui/material';

import DocumentUpload from './components/DocumentUpload';
import VectorStoreConfig from './components/VectorStoreConfig';
import QueryInterface from './components/QueryInterface';
import ResponseComparison from './components/ResponseComparison';

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

  const handleTabChange = (event, newValue) => {
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

  const handleQuerySubmitted = (responses, queryMetrics, query, prompts) => {
    setLlmResponses(responses);
    setMetrics(queryMetrics);
    setCurrentQuery(query);
    setSystemPrompts(prompts);
    setTabValue(3); // Move to response comparison after query is submitted
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
          <Typography variant="h4" component="h1" gutterBottom align="center">
            RAG Playground
          </Typography>
          
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
              />
            </TabPanel>

            <TabPanel value={tabValue} index={3}>
              <ResponseComparison 
                responses={llmResponses}
                metrics={metrics}
                currentQuery={currentQuery}
                systemPrompts={systemPrompts}
              />
            </TabPanel>
          </Paper>
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App; 