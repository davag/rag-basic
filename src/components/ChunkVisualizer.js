import React, { useState, useEffect } from 'react';
import { 
  Typography, 
  Box, 
  Slider,
  InputLabel,
  MenuItem,
  FormControl,
  Select,
  Card,
  CardContent,
  Button,
  Alert,
  CircularProgress,
  Tooltip,
  IconButton,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import AbcIcon from '@mui/icons-material/Abc';
import { createTextSplitter, chunkingStrategies } from '../utils/chunkingStrategies';

/**
 * Chunk Visualizer Component
 * 
 * Visualizes how documents are split into chunks with overlap
 */
const ChunkVisualizer = ({ documents }) => {
  const [selectedDocument, setSelectedDocument] = useState('');
  const [documentContent, setDocumentContent] = useState('');
  const [chunkSize, setChunkSize] = useState(1024);
  const [chunkOverlap, setChunkOverlap] = useState(Math.round(1024 * 0.2)); // 20% of chunk size
  const [chunkingStrategy, setChunkingStrategy] = useState('recursive');
  const [chunks, setChunks] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [documentOptions, setDocumentOptions] = useState([]);
  
  // Update document options when documents change
  useEffect(() => {
    if (documents && documents.length > 0) {
      const docOptions = documents.map((doc, index) => ({
        id: index,
        name: doc.metadata.source || `Document ${index + 1}`
      }));
      setDocumentOptions(docOptions);
      
      // Only set the selected document if none is currently selected
      if (selectedDocument === null && docOptions.length > 0) {
        setSelectedDocument(docOptions[0].id);
      }
    }
  }, [documents, selectedDocument]);
  
  // Update chunk overlap when chunk size changes
  useEffect(() => {
    // Keep the same percentage when chunk size changes
    const idealOverlapPercentage = 0.2; // 20%
    const newOverlap = Math.round(chunkSize * idealOverlapPercentage);
    
    // Only update if it's sufficiently different to avoid recursion
    if (Math.abs(newOverlap - chunkOverlap) > 5) {
      setChunkOverlap(newOverlap);
    }
  }, [chunkSize, chunkOverlap]);
  
  // Handle document selection change
  const handleDocumentChange = (event) => {
    const docId = event.target.value;
    setSelectedDocument(docId);
    
    // Find the selected document and set its content
    if (documents && documents.length > 0) {
      const selectedDoc = documents[docId];
      if (selectedDoc) {
        setDocumentContent(selectedDoc.pageContent);
      }
    }
    
    // Reset chunks when document changes
    setChunks([]);
  };

  const handleChunkingStrategyChange = (event) => {
    const strategy = event.target.value;
    setChunkingStrategy(strategy);
    
    // Update chunk size and overlap based on strategy defaults
    const strategyConfig = chunkingStrategies[strategy].defaultConfig;
    
    // Find closest allowed values for chunk size
    const allowedSizes = [128, 256, 512, 1024, 2048];
    const closestSize = allowedSizes.reduce((prev, curr) => 
      Math.abs(curr - strategyConfig.chunkSize) < Math.abs(prev - strategyConfig.chunkSize) ? curr : prev
    , allowedSizes[0]);
    
    // Calculate overlap as a percentage of chunk size
    const overlapPercentage = strategyConfig.chunkOverlap / strategyConfig.chunkSize;
    const newOverlap = Math.round(closestSize * overlapPercentage);
    
    setChunkSize(closestSize);
    setChunkOverlap(newOverlap);
  };
  
  const handleChunkSizeChange = (e) => {
    const newSize = Number(e.target.value);
    setChunkSize(newSize);
    
    // Also update chunk overlap to maintain the same percentage
    const currentOverlapPercent = chunkOverlap / chunkSize;
    const newOverlap = Math.round(newSize * currentOverlapPercent);
    setChunkOverlap(newOverlap);
  };

  const handleChunkOverlapChange = (e) => {
    const newOverlap = Number(e.target.value);
    setChunkOverlap(newOverlap);
  };
  
  const visualizeChunks = async () => {
    if (!documentContent) return;
    
    setIsProcessing(true);
    setChunks([]);
    
    try {
      // Create text splitter based on selected strategy
      const textSplitter = createTextSplitter(chunkingStrategy, {
        chunkSize,
        chunkOverlap
      });
      
      // Split the document
      const result = await textSplitter.createDocuments([documentContent]);
      
      // Calculate position of each chunk in the original text
      const chunksWithPositions = result.map(chunk => {
        const content = chunk.pageContent;
        const startPos = documentContent.indexOf(content);
        return {
          content,
          startPos,
          endPos: startPos + content.length
        };
      });
      
      setChunks(chunksWithPositions);
    } catch (err) {
      console.error('Error visualizing chunks:', err);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Create a colorized view of the document with chunks highlighted
  const renderHighlightedText = () => {
    if (chunks.length === 0 || !documentContent) return null;
    
    // Sort chunks by start position
    const sortedChunks = [...chunks].sort((a, b) => a.startPos - b.startPos);
    
    // Create segments to render
    const segments = [];
    let currentPos = 0;
    
    sortedChunks.forEach((chunk, index) => {
      // Add non-highlighted text before this chunk
      if (chunk.startPos > currentPos) {
        segments.push({
          text: documentContent.substring(currentPos, chunk.startPos),
          isChunk: false,
          chunkIndex: null
        });
      }
      
      // Add the chunk text
      segments.push({
        text: chunk.content,
        isChunk: true,
        chunkIndex: index,
        isOverlap: false
      });
      
      currentPos = Math.max(currentPos, chunk.endPos);
    });
    
    // Add any remaining text
    if (currentPos < documentContent.length) {
      segments.push({
        text: documentContent.substring(currentPos),
        isChunk: false,
        chunkIndex: null
      });
    }
    
    // Identify overlaps
    for (let i = 0; i < sortedChunks.length - 1; i++) {
      const currentChunk = sortedChunks[i];
      const nextChunk = sortedChunks[i + 1];
      
      if (currentChunk.endPos > nextChunk.startPos) {
        // There is an overlap
        const overlapStart = nextChunk.startPos;
        const overlapEnd = currentChunk.endPos;
        const overlapText = documentContent.substring(overlapStart, overlapEnd);
        
        // Check if this overlap is already in segments
        const overlapSegmentIndex = segments.findIndex(
          seg => seg.text.includes(overlapText) && seg.isChunk
        );
        
        if (overlapSegmentIndex !== -1) {
          segments[overlapSegmentIndex].isOverlap = true;
        }
      }
    }
    
    return (
      <Box 
        sx={{ 
          whiteSpace: 'pre-wrap', 
          wordBreak: 'break-word',
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          lineHeight: '1.5',
          p: 2,
          maxHeight: '400px',
          overflow: 'auto',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper'
        }}
      >
        {segments.map((segment, index) => (
          <span 
            key={index}
            style={{
              backgroundColor: segment.isChunk 
                ? (segment.isOverlap ? '#FFCDD2' : '#E8F5E9') 
                : 'transparent',
              padding: segment.isChunk ? '2px 0' : '0',
              position: 'relative'
            }}
          >
            {segment.text}
            {segment.isChunk && (
              <Tooltip title={`Chunk ${segment.chunkIndex + 1}`}>
                <span 
                  style={{
                    position: 'absolute',
                    top: '-14px',
                    left: '0',
                    fontSize: '10px',
                    color: 'white',
                    background: segment.isOverlap ? '#F44336' : '#4CAF50',
                    padding: '0 4px',
                    borderRadius: '4px',
                    fontWeight: 'bold'
                  }}
                >
                  {segment.chunkIndex + 1}
                </span>
              </Tooltip>
            )}
          </span>
        ))}
      </Box>
    );
  };
  
  // Show individual chunks in a list
  const renderChunkList = () => {
    if (chunks.length === 0) return null;
    
    const sortedChunks = [...chunks].sort((a, b) => a.startPos - b.startPos);
    
    return (
      <Box mt={3}>
        <Typography variant="h6" gutterBottom>
          Resulting Chunks ({sortedChunks.length})
        </Typography>
        <Box 
          sx={{ 
            maxHeight: '300px', 
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1
          }}
        >
          {sortedChunks.map((chunk, index) => (
            <Box key={index} sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                Chunk {index + 1} - {chunk.content.length} chars ({chunk.startPos}:{chunk.endPos})
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'monospace',
                  bgcolor: 'action.hover',
                  p: 1,
                  borderRadius: 1,
                }}
              >
                {chunk.content.length > 200
                  ? `${chunk.content.substring(0, 200)}...`
                  : chunk.content
                }
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    );
  };
  
  return (
    <Box>
      <Box display="flex" alignItems="center" mb={1}>
        <Typography variant="h5">
          <AbcIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Chunk Visualizer
        </Typography>
        <Tooltip title="Learn more about document chunking">
          <IconButton 
            size="small" 
            onClick={() => setShowHelp(!showHelp)}
            sx={{ ml: 1 }}
          >
            <HelpOutlineIcon />
          </IconButton>
        </Tooltip>
      </Box>
      
      <Typography variant="body2" color="textSecondary" paragraph>
        Visualize how your documents are split into chunks for the vector database.
      </Typography>
      
      {showHelp && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2" paragraph>
            <strong>What are chunks?</strong> Documents are split into smaller pieces called "chunks" before being converted to embeddings.
          </Typography>
          <Typography variant="body2" paragraph>
            <strong>Chunking Strategies:</strong> Different strategies are optimized for different types of content:
          </Typography>
          <List dense>
            {Object.entries(chunkingStrategies).map(([key, strategy]) => (
              <ListItem key={key}>
                <ListItemText 
                  primary={strategy.name}
                  secondary={strategy.description}
                />
              </ListItem>
            ))}
          </List>
          <Typography variant="body2" paragraph>
            <strong>Chunk Size:</strong> The maximum character length of each chunk. Larger chunks provide more context but may reduce retrieval precision.
          </Typography>
          <Typography variant="body2">
            <strong>Chunk Overlap:</strong> The number of characters shared between adjacent chunks. Overlap helps maintain context across chunk boundaries.
          </Typography>
        </Alert>
      )}
      
      {documents.length === 0 ? (
        <Alert severity="warning">
          Upload some documents to use the chunk visualizer.
        </Alert>
      ) : (
        <>
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel id="document-select-label">Select Document</InputLabel>
                <Select
                  labelId="document-select-label"
                  id="document-select"
                  value={selectedDocument}
                  label="Select Document"
                  onChange={handleDocumentChange}
                >
                  {documentOptions.map((doc, index) => (
                    <MenuItem key={index} value={doc.id}>
                      {doc.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel id="chunking-strategy-label">Chunking Strategy</InputLabel>
                <Select
                  labelId="chunking-strategy-label"
                  id="chunking-strategy"
                  value={chunkingStrategy}
                  onChange={handleChunkingStrategyChange}
                  label="Chunking Strategy"
                  disabled={isProcessing}
                >
                  {Object.entries(chunkingStrategies).map(([key, strategy]) => (
                    <MenuItem key={key} value={key}>
                      <Box>
                        <Typography variant="body1">{strategy.name}</Typography>
                        <Typography variant="caption" color="textSecondary">
                          {strategy.description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <Box mb={3}>
                <Typography gutterBottom>Chunk Size</Typography>
                <FormControl fullWidth>
                  <Select
                    value={chunkSize}
                    onChange={handleChunkSizeChange}
                    disabled={isProcessing}
                  >
                    <MenuItem value={128}>128 characters</MenuItem>
                    <MenuItem value={256}>256 characters</MenuItem>
                    <MenuItem value={512}>512 characters</MenuItem>
                    <MenuItem value={1024}>1024 characters (recommended)</MenuItem>
                    <MenuItem value={2048}>2048 characters</MenuItem>
                  </Select>
                </FormControl>
                <Typography variant="caption" color="textSecondary">
                  Select a Llama Index recommended chunk size value
                </Typography>
              </Box>
              
              <Box mb={3}>
                <Typography gutterBottom>Chunk Overlap</Typography>
                <FormControl fullWidth>
                  <Select
                    value={chunkOverlap}
                    onChange={handleChunkOverlapChange}
                    disabled={isProcessing}
                    renderValue={(selected) => {
                      const percentage = Math.round((selected / chunkSize) * 100);
                      return `${percentage}% (${selected} characters)`;
                    }}
                  >
                    <MenuItem value={0}>0% (0 characters)</MenuItem>
                    <MenuItem value={Math.round(chunkSize * 0.05)}>5% ({Math.round(chunkSize * 0.05)} characters)</MenuItem>
                    <MenuItem value={Math.round(chunkSize * 0.1)}>10% ({Math.round(chunkSize * 0.1)} characters)</MenuItem>
                    <MenuItem value={Math.round(chunkSize * 0.2)}>20% ({Math.round(chunkSize * 0.2)} characters) - recommended</MenuItem>
                    <MenuItem value={Math.round(chunkSize * 0.3)}>30% ({Math.round(chunkSize * 0.3)} characters)</MenuItem>
                  </Select>
                </FormControl>
                <Typography variant="caption" color="textSecondary">
                  Values are percentages of the chunk size
                </Typography>
              </Box>
              
              <Button
                variant="contained"
                color="primary"
                onClick={visualizeChunks}
                disabled={isProcessing || !selectedDocument}
                fullWidth
              >
                {isProcessing ? (
                  <>
                    <CircularProgress size={24} color="inherit" sx={{ mr: 1 }} />
                    Processing...
                  </>
                ) : (
                  'Visualize Chunks'
                )}
              </Button>
            </CardContent>
          </Card>
          
          {chunks.length > 0 && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Document with Highlighted Chunks
                </Typography>
                <Box display="flex" mb={1}>
                  <Box 
                    sx={{ 
                      display: 'inline-block', 
                      bgcolor: '#E8F5E9', 
                      px: 1, 
                      mr: 1, 
                      borderRadius: 1 
                    }}
                  >
                    <Typography variant="caption">Chunks</Typography>
                  </Box>
                  <Box 
                    sx={{ 
                      display: 'inline-block', 
                      bgcolor: '#FFCDD2', 
                      px: 1, 
                      borderRadius: 1 
                    }}
                  >
                    <Typography variant="caption">Overlaps</Typography>
                  </Box>
                </Box>
                
                {renderHighlightedText()}
                {renderChunkList()}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Box>
  );
};

export default ChunkVisualizer; 