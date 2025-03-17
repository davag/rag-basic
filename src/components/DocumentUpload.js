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
  Chip
} from '@mui/material';
import { 
  Description as DescriptionIcon,
  PictureAsPdf as PdfIcon,
  InsertDriveFile as FileIcon,
  Code as CodeIcon
} from '@mui/icons-material';
import { processFile } from '../utils/documentProcessing';

const DocumentUpload = ({ onDocumentsUploaded, isProcessing, setIsProcessing }) => {
  const [files, setFiles] = useState([]);
  const [processedDocs, setProcessedDocs] = useState([]);
  const [error, setError] = useState(null);
  const [namespace, setNamespace] = useState('default');
  const [namespaces, setNamespaces] = useState(['default']);

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
      'application/octet-stream': ['.py']
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

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Upload Documents
      </Typography>
      
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
            Drag and drop files here, or click to select files (PDF, TXT, DOCX, PY)
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

      {error && (
        <Box mt={2}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      {processedDocs.length > 0 && (
        <Box mt={2}>
          <Alert severity="success">
            Successfully processed {processedDocs.length} document(s). You can now proceed to configure the vector store.
          </Alert>
        </Box>
      )}
    </Box>
  );
};

export default DocumentUpload; 