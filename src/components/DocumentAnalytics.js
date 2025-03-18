import React, { useState, useEffect, useCallback } from 'react';
import { 
  Typography, 
  Box, 
  Grid,
  Card,
  CardContent,
  CardHeader,
  Divider,
  List,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
  Alert
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InsertChartIcon from '@mui/icons-material/InsertChart';
import TopicIcon from '@mui/icons-material/Topic';
import SortIcon from '@mui/icons-material/Sort';
import SegmentIcon from '@mui/icons-material/Segment';

/**
 * Document Analytics Component
 * 
 * Displays statistics and insights about documents and chunks
 */
const DocumentAnalytics = ({ documents, vectorStore, chunkSize, chunkOverlap }) => {
  const [stats, setStats] = useState({
    totalDocs: 0,
    totalChunks: 0,
    totalTokens: 0,
    averageChunksPerDoc: 0,
    namespaceStats: {},
    topKeywords: [],
    sampleChunks: []
  });
  
  const [expandedChunk, setExpandedChunk] = useState(null);
  const [keywordExtracted, setKeywordExtracted] = useState(false);
  
  const analyzeDocuments = useCallback(() => {
    // Basic document statistics
    const totalDocs = documents.length;
    
    // Calculate estimated chunks and tokens
    const estimatedChunks = Math.ceil(
      documents.reduce((acc, doc) => acc + doc.pageContent.length / (chunkSize - chunkOverlap), 0)
    );
    
    // Very rough token estimation (approx 4 chars per token)
    const totalChars = documents.reduce((acc, doc) => acc + doc.pageContent.length, 0);
    const estimatedTokens = Math.ceil(totalChars / 4);
    
    // Namespace analysis
    const namespaceStats = {};
    documents.forEach(doc => {
      const namespace = doc.metadata.namespace || 'default';
      if (!namespaceStats[namespace]) {
        namespaceStats[namespace] = {
          docCount: 0,
          totalChars: 0,
          fileTypes: {}
        };
      }
      
      namespaceStats[namespace].docCount += 1;
      namespaceStats[namespace].totalChars += doc.pageContent.length;
      
      // Track file types
      const fileExt = doc.metadata.source.split('.').pop().toLowerCase();
      namespaceStats[namespace].fileTypes[fileExt] = 
        (namespaceStats[namespace].fileTypes[fileExt] || 0) + 1;
    });
    
    // Get sample chunks if vectorStore exists
    let sampleChunks = [];
    if (vectorStore) {
      console.log('Vector store structure:', Object.keys(vectorStore));
      
      if (vectorStore.memoryVectors && vectorStore.memoryVectors.length > 0) {
        // Get up to 5 sample chunks
        sampleChunks = vectorStore.memoryVectors
          .slice(0, 5)
          .map(vector => ({
            content: vector.content,
            metadata: vector.metadata
          }));
        
        console.log('Found sample chunks:', sampleChunks.length);
      } else {
        console.log('No memory vectors found in vector store');
      }
    }
    
    setStats({
      totalDocs,
      totalChunks: estimatedChunks,
      totalTokens: estimatedTokens,
      averageChunksPerDoc: totalDocs > 0 ? (estimatedChunks / totalDocs).toFixed(1) : 0,
      namespaceStats,
      topKeywords: [],
      sampleChunks
    });
  }, [documents, vectorStore, chunkSize, chunkOverlap]);
  
  useEffect(() => {
    if (documents.length > 0) {
      analyzeDocuments();
    }
  }, [documents, analyzeDocuments]);
  
  const extractKeywords = () => {
    // This is a simple keyword extraction - in a real app, you'd use a more sophisticated algorithm
    setKeywordExtracted(true);
    
    if (!documents || documents.length === 0) return;
    
    // Just a simple frequency count of words > 4 characters
    const wordCounts = {};
    const stopWords = new Set([
      'about', 'above', 'after', 'again', 'against', 'all', 'and', 'any', 'are', 'because',
      'been', 'before', 'being', 'below', 'between', 'both', 'but', 'cannot', 'could', 'did',
      'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had',
      'has', 'have', 'having', 'here', 'how', 'into', 'itself', 'just', 'more', 'most',
      'nor', 'not', 'now', 'off', 'once', 'only', 'other', 'out', 'over', 'own', 'same',
      'should', 'some', 'such', 'than', 'that', 'the', 'then', 'there', 'these', 'they',
      'this', 'those', 'through', 'too', 'under', 'until', 'very', 'was', 'were', 'what',
      'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'you', 'your'
    ]);
    
    // Process each document
    documents.forEach(doc => {
      const words = doc.pageContent
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')  // Remove punctuation
        .split(/\s+/);  // Split by whitespace
      
      words.forEach(word => {
        if (word.length > 4 && !stopWords.has(word)) {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
      });
    });
    
    // Convert to array, sort by count, and take top 20
    const topKeywords = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }));
    
    setStats(prev => ({
      ...prev,
      topKeywords
    }));
  };
  
  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        <InsertChartIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
        Document Analytics
      </Typography>
      
      <Typography variant="body2" color="textSecondary" paragraph>
        Analyze your documents and chunks to gain insights into your knowledge base.
      </Typography>
      
      {documents.length === 0 ? (
        <Alert severity="info">
          Upload some documents to see analytics.
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {/* Overall Stats Card */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardHeader 
                title="Document Statistics" 
                titleTypographyProps={{ variant: 'h6' }}
              />
              <Divider />
              <CardContent>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">
                      Total Documents
                    </Typography>
                    <Typography variant="h4">
                      {stats.totalDocs}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">
                      Estimated Chunks
                    </Typography>
                    <Typography variant="h4">
                      {stats.totalChunks}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">
                      Estimated Tokens
                    </Typography>
                    <Typography variant="h4">
                      {stats.totalTokens.toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">
                      Avg. Chunks per Doc
                    </Typography>
                    <Typography variant="h4">
                      {stats.averageChunksPerDoc}
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
          
          {/* Namespace Stats Card */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardHeader 
                title="Namespace Analysis" 
                titleTypographyProps={{ variant: 'h6' }}
                avatar={<TopicIcon />}
              />
              <Divider />
              <CardContent>
                {Object.keys(stats.namespaceStats).length > 0 ? (
                  <>
                    {Object.entries(stats.namespaceStats).map(([namespace, data]) => (
                      <Box key={namespace} mb={2}>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography variant="subtitle1">
                            {namespace}
                          </Typography>
                          <Chip 
                            size="small" 
                            label={`${data.docCount} docs`}
                            color="primary"
                          />
                        </Box>
                        <Typography variant="body2" color="textSecondary">
                          {(data.totalChars / 1000).toFixed(1)}K characters
                        </Typography>
                        <Box mt={1}>
                          {Object.entries(data.fileTypes).map(([type, count]) => (
                            <Chip 
                              key={type}
                              size="small"
                              label={`${type}: ${count}`}
                              variant="outlined"
                              sx={{ mr: 0.5, mb: 0.5 }}
                            />
                          ))}
                        </Box>
                      </Box>
                    ))}
                  </>
                ) : (
                  <Typography variant="body2" color="textSecondary">
                    No namespace data available.
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
          
          {/* Keywords Card */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardHeader 
                title="Top Keywords" 
                titleTypographyProps={{ variant: 'h6' }}
                avatar={<SortIcon />}
                action={
                  <Button 
                    variant="outlined" 
                    size="small" 
                    onClick={extractKeywords}
                    disabled={keywordExtracted && stats.topKeywords.length > 0}
                  >
                    {keywordExtracted ? 'Extracted' : 'Extract Keywords'}
                  </Button>
                }
              />
              <Divider />
              <CardContent>
                {stats.topKeywords.length > 0 ? (
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {stats.topKeywords.map(({ word, count }) => (
                      <Chip 
                        key={word}
                        label={`${word} (${count})`}
                        variant="outlined"
                        size="small"
                        sx={{ mb: 0.5, mr: 0.5 }}
                      />
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="textSecondary">
                    Click the "Extract Keywords" button to analyze document content.
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
          
          {/* Sample Chunks Card */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardHeader 
                title="Sample Chunks" 
                titleTypographyProps={{ variant: 'h6' }}
                avatar={<SegmentIcon />}
              />
              <Divider />
              <CardContent>
                {stats.sampleChunks.length > 0 ? (
                  <List>
                    {stats.sampleChunks.map((chunk, index) => (
                      <Accordion 
                        key={index}
                        expanded={expandedChunk === index}
                        onChange={() => setExpandedChunk(expandedChunk === index ? null : index)}
                        sx={{ mb: 1 }}
                      >
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography variant="body2">
                            Chunk {index + 1} from {chunk.metadata.source}
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              whiteSpace: 'pre-wrap',
                              bgcolor: 'action.hover',
                              p: 1,
                              borderRadius: 1,
                              maxHeight: '150px',
                              overflow: 'auto'
                            }}
                          >
                            {chunk.content}
                          </Typography>
                        </AccordionDetails>
                      </Accordion>
                    ))}
                  </List>
                ) : vectorStore ? (
                  <Typography variant="body2" color="textSecondary">
                    No chunks available. Create a vector store first.
                  </Typography>
                ) : (
                  <Typography variant="body2" color="textSecondary">
                    Chunks will be available after creating a vector store.
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default DocumentAnalytics; 