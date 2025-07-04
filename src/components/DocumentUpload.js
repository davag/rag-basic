import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Typography, 
  Button, 
  List, 
  ListItem, 
  ListItemText, 
  ListItemIcon,
  Paper,
  Box,
  CircularProgress,
  Alert,
  TextField,
  Chip,
  Link,
  Tooltip,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tabs,
  Tab
} from '@mui/material';
import { 
  Description as DescriptionIcon,
  PictureAsPdf as PdfIcon,
  InsertDriveFile as FileIcon,
  Code as CodeIcon,
  HelpOutline as HelpOutlineIcon,
  ExpandMore as ExpandMoreIcon,
  DataObject as JsonIcon,
  TextFields as MarkdownIcon,
  Html as HtmlIcon,
  TableChart as SpreadsheetIcon,
  Description as RtfIcon,
  Code as XmlIcon,
  DataObject as YamlIcon,
  CloudUpload as UploadIcon,
  Language as WebIcon
} from '@mui/icons-material';
import { processFile } from '../utils/documentProcessing';
import WebScraper from './WebScraper';

const DocumentUpload = ({ onDocumentsUploaded, isProcessing, setIsProcessing }) => {
  const [files, setFiles] = useState([]);
  const [processedDocs, setProcessedDocs] = useState([]);
  const [error, setError] = useState(null);
  const [namespace, setNamespace] = useState('default');
  const [namespaces, setNamespaces] = useState(['default']);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [tabValue, setTabValue] = useState(0);

  const onDrop = useCallback(acceptedFiles => {
    setFiles(prevFiles => [...prevFiles, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/x-python': ['.py'],
      'application/x-python-code': ['.py'],
      'text/x-python-script': ['.py'],
      'application/octet-stream': ['.py'],
      'application/json': ['.json'],
      'text/markdown': ['.md', '.markdown'],
      'text/html': ['.html', '.htm'],
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/rtf': ['.rtf'],
      'application/xml': ['.xml'],
      'text/yaml': ['.yml', '.yaml']
    }
  });

  const getFileIcon = (file) => {
    if (file.type === 'application/pdf') {
      return <PdfIcon />;
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return <DescriptionIcon />;
    } else if (file.name.endsWith('.py') || file.type === 'text/x-python' || 
               file.type === 'application/x-python-code' || file.type === 'text/x-python-script') {
      return <CodeIcon />;
    } else if (file.type === 'application/json' || file.name.endsWith('.json')) {
      return <JsonIcon />;
    } else if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
      return <MarkdownIcon />;
    } else if (file.type === 'text/html' || file.name.endsWith('.html') || file.name.endsWith('.htm')) {
      return <HtmlIcon />;
    } else if (file.type === 'text/csv' || file.name.endsWith('.csv') || 
               file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
               file.type === 'application/vnd.ms-excel' || 
               file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      return <SpreadsheetIcon />;
    } else if (file.type === 'application/rtf' || file.name.endsWith('.rtf')) {
      return <RtfIcon />;
    } else if (file.type === 'application/xml' || file.name.endsWith('.xml')) {
      return <XmlIcon />;
    } else if (file.type === 'text/yaml' || file.name.endsWith('.yml') || file.name.endsWith('.yaml')) {
      return <YamlIcon />;
    } else {
      return <FileIcon />;
    }
  };

  const handleNamespaceChange = (event) => {
    setNamespace(event.target.value);
  };

  const addNamespace = () => {
    if (namespace && !namespaces.includes(namespace)) {
      setNamespaces(prev => [...prev, namespace]);
    }
  };

  const processFiles = async () => {
    setIsProcessing(true);
    setError(null);
    const docs = [];

    try {
      for (const file of files) {
        const doc = await processFile(file);
        // Add namespace to document metadata
        doc.metadata.namespace = namespace;
        docs.push(doc);
      }

      setProcessedDocs(docs);
      onDocumentsUploaded(docs, namespaces);
    } catch (err) {
      window.console.error('Error processing files:', err);
      setError('Error processing files: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const removeFile = (index) => {
    setFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={1}>
        <Typography variant="h5">
          Step 1: Upload & Process Documents
        </Typography>
        <Tooltip title="Learn more about document processing and embeddings">
          <IconButton 
            size="small" 
            onClick={() => setHelpExpanded(!helpExpanded)}
            sx={{ ml: 1 }}
          >
            <HelpOutlineIcon />
          </IconButton>
        </Tooltip>
      </Box>
      
      <Typography variant="body2" color="textSecondary" paragraph>
        In this step, your documents will be uploaded, processed into smaller chunks, and converted into vector embeddings (numerical representations of text) that can be efficiently searched.
      </Typography>
      
      <Accordion 
        expanded={helpExpanded} 
        onChange={() => setHelpExpanded(!helpExpanded)}
        sx={{ mb: 3 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">How RAG Works: Document Processing & Embeddings</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" paragraph>
            Retrieval-Augmented Generation (RAG) works in several steps:
          </Typography>
          
          <Typography variant="body2" component="div">
            <ol>
              <li><strong>Document Processing:</strong> Your documents are split into smaller chunks that can be processed efficiently.</li>
              <li><strong>Embedding Creation:</strong> Each chunk is converted into a vector embedding (a list of numbers) that captures its semantic meaning.</li>
              <li><strong>Vector Storage:</strong> These embeddings are stored in a vector database for efficient similarity search.</li>
              <li><strong>Retrieval:</strong> When you ask a question, it's also converted to an embedding and used to find the most relevant document chunks.</li>
              <li><strong>Generation:</strong> The LLM uses these relevant chunks as context to generate an accurate answer.</li>
            </ol>
          </Typography>
          
          <Typography variant="body2" paragraph>
            This process allows the AI to "know" information that wasn't in its training data and provide more accurate, up-to-date responses.
          </Typography>
          
          <Link 
            href="https://www.pinecone.io/learn/retrieval-augmented-generation/" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            Learn more about Retrieval-Augmented Generation (RAG)
          </Link>
        </AccordionDetails>
      </Accordion>

      {/* Namespace Configuration */}
      <Box mb={3}>
        <Typography variant="h6" gutterBottom>
          Document Namespace
        </Typography>
        <Typography variant="body2" color="textSecondary" mb={2}>
          Organize your documents into namespaces. You can query specific namespaces later.
        </Typography>
        <Box display="flex" alignItems="center" mb={2}>
          <TextField
            label="Namespace"
            variant="outlined"
            size="small"
            value={namespace}
            onChange={handleNamespaceChange}
            sx={{ mr: 2 }}
          />
          <Button 
            variant="outlined" 
            onClick={addNamespace}
            disabled={!namespace || namespaces.includes(namespace)}
          >
            Add Namespace
          </Button>
        </Box>
        <Box display="flex" flexWrap="wrap" gap={1}>
          {namespaces.map((ns) => (
            <Chip 
              key={ns} 
              label={ns} 
              color={ns === namespace ? "primary" : "default"}
              onClick={() => setNamespace(ns)}
              onDelete={ns !== 'default' ? () => {
                setNamespaces(prev => prev.filter(item => item !== ns));
                if (namespace === ns) setNamespace('default');
              } : undefined}
            />
          ))}
        </Box>
      </Box>

      {/* Document Source Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="document source tabs">
          <Tab 
            icon={<UploadIcon />} 
            label="Upload Files" 
            iconPosition="start"
          />
          <Tab 
            icon={<WebIcon />} 
            label="Scrape Websites" 
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {tabValue === 0 && (
        <Box>
          <Paper 
            {...getRootProps()} 
            className="dropzone"
            elevation={0}
          >
            <input {...getInputProps()} />
            {isDragActive ? (
              <Typography>Drop the files here...</Typography>
            ) : (
              <Typography>
                Drag and drop files here, or click to select files (PDF, TXT, DOCX, PY, JSON, MD, HTML, CSV, XLSX, RTF, XML, YAML)
              </Typography>
            )}
          </Paper>

          {files.length > 0 && (
            <Box className="file-list">
              <Typography variant="h6" gutterBottom>
                Selected Files:
              </Typography>
              <List>
                {files.map((file, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      {getFileIcon(file)}
                    </ListItemIcon>
                    <ListItemText 
                      primary={file.name} 
                      secondary={`${(file.size / 1024).toFixed(2)} KB • Namespace: ${namespace}`} 
                    />
                    <Button 
                      color="secondary" 
                      onClick={() => removeFile(index)}
                      disabled={isProcessing}
                    >
                      Remove
                    </Button>
                  </ListItem>
                ))}
              </List>
              
              <Box mt={2} display="flex" justifyContent="space-between">
                <Button 
                  variant="contained" 
                  color="primary" 
                  onClick={processFiles}
                  disabled={isProcessing || files.length === 0}
                >
                  {isProcessing ? (
                    <>
                      <CircularProgress size={24} color="inherit" style={{ marginRight: 10 }} />
                      Processing...
                    </>
                  ) : (
                    'Process Documents'
                  )}
                </Button>
                
                <Button 
                  variant="outlined" 
                  onClick={() => setFiles([])}
                  disabled={isProcessing || files.length === 0}
                >
                  Clear All
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      )}

      {tabValue === 1 && (
        <WebScraper
          onDocumentsUploaded={onDocumentsUploaded}
          namespace={namespace}
          namespaces={namespaces}
          isProcessing={isProcessing}
          setIsProcessing={setIsProcessing}
        />
      )}

      {error && (
        <Box mt={2}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      {processedDocs.length > 0 && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Successfully processed {processedDocs.length} document(s). Your documents have been converted into vector embeddings and you are being redirected to the next step.
        </Alert>
      )}
    </Box>
  );
};

export default DocumentUpload; 