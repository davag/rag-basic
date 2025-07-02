import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  CircularProgress,
  FormControlLabel,
  Switch,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Language as WebIcon,
  ExpandMore as ExpandMoreIcon,
  Preview as PreviewIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import axios from 'axios';

const WebScraper = ({ onDocumentsUploaded, namespace, namespaces, isProcessing, setIsProcessing }) => {
  const [url, setUrl] = useState('');
  const [scrapedContent, setScrapedContent] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [urlValidation, setUrlValidation] = useState(null);
  
  // Advanced options
  const [useJavaScript, setUseJavaScript] = useState(false);
  const [waitForSelector, setWaitForSelector] = useState('');
  const [removeElements, setRemoveElements] = useState([]);
  const [newRemoveElement, setNewRemoveElement] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Recursive scraping options
  const [followLinks, setFollowLinks] = useState(false);
  const [maxDepth, setMaxDepth] = useState(1);
  const [maxPages, setMaxPages] = useState(10);
  const [linkPattern, setLinkPattern] = useState('');
  const [excludePattern, setExcludePattern] = useState('');
  const [stayOnDomain, setStayOnDomain] = useState(true);
  
  // Preview dialog
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');

  // Ensure we have a valid API URL with robust fallback
  const getApiUrl = () => {
    const envUrl = process.env.REACT_APP_API_URL;
    const fallbackUrl = 'http://localhost:3002';
    
    // If env variable exists and looks valid, use it
    if (envUrl && !envUrl.includes('undefined') && !envUrl.includes(':-') && envUrl.startsWith('http')) {
      return envUrl;
    }
    
    console.warn('Using fallback API URL because environment variable is invalid or missing:', {
      envUrl,
      fallbackUrl
    });
    
    return fallbackUrl;
  };
  
  const apiUrl = getApiUrl();
  
  // Debug API URL
  console.log('WebScraper API URL:', apiUrl);
  console.log('Environment REACT_APP_API_URL:', process.env.REACT_APP_API_URL);
  console.log('All environment variables:', Object.keys(process.env).filter(key => key.startsWith('REACT_APP_')));

  const validateUrl = async () => {
    const trimmedUrl = url.trim();
    
    if (!trimmedUrl) {
      setError('Please enter a URL');
      return;
    }

    // Basic client-side URL validation
    try {
      // Add protocol if missing
      let testUrl = trimmedUrl;
      if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
        testUrl = 'https://' + trimmedUrl;
      }
      
      // Test if URL is valid
      new URL(testUrl);
    } catch (urlError) {
      setError('Invalid URL format. Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    setIsValidating(true);
    setError(null);
    setUrlValidation(null);
    setSuccess(null);

    try {
      console.log('Validating URL:', trimmedUrl);
      console.log('Using API URL:', apiUrl);
      
      // API URL is already validated by getApiUrl function
      
      const response = await axios.post(`${apiUrl}/api/validate-url`, {
        url: trimmedUrl
      });

      console.log('Validation response:', response.data);
      setUrlValidation(response.data);
      
      // Update URL if it was corrected (e.g., protocol added)
      if (response.data.correctedUrl) {
        console.log('URL corrected to:', response.data.correctedUrl);
        setUrl(response.data.correctedUrl);
      }
      
      if (!response.data.valid || !response.data.accessible) {
        setError('URL is not accessible or invalid');
      } else if (!response.data.isHtml) {
        setError('URL does not appear to contain HTML content');
      } else {
        setSuccess('URL is valid and accessible');
      }
    } catch (err) {
      console.error('URL validation error:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Unknown validation error';
      setError('Failed to validate URL: ' + errorMessage);
      setUrlValidation(null);
    } finally {
      setIsValidating(false);
    }
  };

  const scrapeWebpage = async () => {
    const trimmedUrl = url.trim();
    
    if (!trimmedUrl) {
      setError('Please enter a URL');
      return;
    }

    // Use the corrected URL if available from validation
    const finalUrl = urlValidation?.correctedUrl || trimmedUrl;

    setIsScraping(true);
    setError(null);
    setSuccess(null);

    try {
      console.log('Scraping URL:', finalUrl);
      console.log('Using API URL:', apiUrl);
      
      const scrapingOptions = {
        useJavaScript,
        waitForSelector: waitForSelector.trim() || null,
        removeElements,
        // Recursive options
        followLinks,
        maxDepth: followLinks ? maxDepth : 1,
        maxPages: followLinks ? maxPages : 1,
        linkPattern: linkPattern.trim() || null,
        excludePattern: excludePattern.trim() || null,
        stayOnDomain
      };
      
      console.log('Scraping options:', scrapingOptions);
      
      // API URL is already validated by getApiUrl function
      
      const response = await axios.post(`${apiUrl}/api/scrape-webpage`, {
        url: finalUrl,
        ...scrapingOptions
      });

      console.log('Scraping response:', response.data);
      
      if (response.data.success) {
        // Handle both single page and multi-page responses
        const pages = response.data.pages || [response.data];
        
        const newContent = pages.map((page, index) => ({
          id: Date.now() + index,
          url: page.url || finalUrl,
          title: page.title,
          content: page.content,
          metadata: {
            ...page.metadata,
            depth: page.depth || 0,
            parentUrl: page.parentUrl || null
          },
          namespace: namespace
        }));

        setScrapedContent(prev => [...prev, ...newContent]);
        
        if (pages.length > 1) {
          setSuccess(`Successfully scraped ${pages.length} pages from: ${response.data.rootTitle || pages[0].title}`);
        } else {
          setSuccess(`Successfully scraped: ${pages[0].title}`);
        }
        
        setUrl(''); // Clear the URL input
        setUrlValidation(null);
      } else {
        setError('Failed to scrape webpage');
      }
    } catch (err) {
      console.error('Web scraping error:', err);
      const errorMessage = err.response?.data?.details || err.response?.data?.error || err.message || 'Unknown scraping error';
      setError('Failed to scrape webpage: ' + errorMessage);
    } finally {
      setIsScraping(false);
    }
  };

  const removeScrapedContent = (id) => {
    setScrapedContent(prev => prev.filter(item => item.id !== id));
  };

  const showPreview = (content) => {
    setPreviewContent(content);
    setPreviewOpen(true);
  };

  const addRemoveElement = () => {
    if (newRemoveElement.trim() && !removeElements.includes(newRemoveElement.trim())) {
      setRemoveElements(prev => [...prev, newRemoveElement.trim()]);
      setNewRemoveElement('');
    }
  };

  const removeRemoveElement = (element) => {
    setRemoveElements(prev => prev.filter(item => item !== element));
  };

  const processScrapedContent = async () => {
    if (scrapedContent.length === 0) {
      setError('No scraped content to process');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Convert scraped content to document format
      const documents = scrapedContent.map(item => ({
        pageContent: item.content,
        metadata: {
          source: item.url,
          title: item.title,
          namespace: item.namespace,
          originalFileName: `${item.title}.md`,
          documentName: item.title,
          fileType: 'md',
          mimeType: 'text/markdown',
          scrapedAt: item.metadata.scrapedAt,
          method: item.metadata.method,
          contentLength: item.metadata.contentLength
        }
      }));

      // Call the parent component's handler
      onDocumentsUploaded(documents, namespaces);
      
      // Clear scraped content after processing
      setScrapedContent([]);
      setSuccess(`Successfully processed ${documents.length} scraped document(s)`);
    } catch (err) {
      setError('Failed to process scraped content: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Web Scraping
      </Typography>
      <Typography variant="body2" color="textSecondary" paragraph>
        Scrape web pages and convert them to markdown for embedding. Enter a URL below to get started.
      </Typography>

      {/* URL Input Section */}
      <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <TextField
            fullWidth
            label="Website URL"
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isScraping || isValidating}
            InputProps={{
              startAdornment: <WebIcon sx={{ mr: 1, color: 'text.secondary' }} />
            }}
          />
          <Button
            variant="outlined"
            onClick={validateUrl}
            disabled={!url.trim() || isValidating || isScraping}
            startIcon={isValidating ? <CircularProgress size={16} /> : <CheckCircleIcon />}
          >
            {isValidating ? 'Validating...' : 'Validate'}
          </Button>
        </Box>

        {/* URL Validation Status */}
        {urlValidation && (
          <Box mb={2}>
            {urlValidation.valid && urlValidation.accessible ? (
              <Alert severity="success" icon={<CheckCircleIcon />}>
                URL is valid and accessible
                {urlValidation.isHtml && ' • HTML content detected'}
                {urlValidation.contentType && ` • Content-Type: ${urlValidation.contentType}`}
              </Alert>
            ) : (
              <Alert severity="error" icon={<ErrorIcon />}>
                URL validation failed
                {urlValidation.error && ` • ${urlValidation.error}`}
              </Alert>
            )}
          </Box>
        )}

        {/* Advanced Options */}
        <Accordion expanded={showAdvanced} onChange={() => setShowAdvanced(!showAdvanced)}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center">
              <SettingsIcon sx={{ mr: 1 }} />
              <Typography>Advanced Scraping Options</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={useJavaScript}
                    onChange={(e) => setUseJavaScript(e.target.checked)}
                  />
                }
                label="Use JavaScript rendering (for dynamic content)"
              />
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Enable this for websites that load content dynamically with JavaScript
              </Typography>

              <TextField
                fullWidth
                label="Wait for CSS selector (optional)"
                placeholder=".main-content, #article"
                value={waitForSelector}
                onChange={(e) => setWaitForSelector(e.target.value)}
                sx={{ mb: 2 }}
                helperText="Wait for this element to appear before scraping (useful for dynamic content)"
              />

              <Typography variant="subtitle2" gutterBottom>
                Elements to Remove
              </Typography>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <TextField
                  size="small"
                  label="CSS selector"
                  placeholder=".ads, #sidebar"
                  value={newRemoveElement}
                  onChange={(e) => setNewRemoveElement(e.target.value)}
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={addRemoveElement}
                  startIcon={<AddIcon />}
                >
                  Add
                </Button>
              </Box>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {removeElements.map((element, index) => (
                  <Chip
                    key={index}
                    label={element}
                    onDelete={() => removeRemoveElement(element)}
                    size="small"
                  />
                ))}
              </Box>

              {/* Recursive Scraping Options */}
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 3 }}>
                Recursive Link Following
              </Typography>
              
              <FormControlLabel
                control={
                  <Switch
                    checked={followLinks}
                    onChange={(e) => setFollowLinks(e.target.checked)}
                  />
                }
                label="Follow internal links to scrape multiple pages"
              />
              
              {followLinks && (
                <Box sx={{ mt: 2, pl: 2, borderLeft: '2px solid #e0e0e0' }}>
                  <Box display="flex" gap={2} mb={2}>
                    <TextField
                      label="Max Depth"
                      type="number"
                      size="small"
                      value={maxDepth}
                      onChange={(e) => setMaxDepth(Math.max(1, parseInt(e.target.value) || 1))}
                      inputProps={{ min: 1, max: 5 }}
                      helperText="How many levels deep to follow links (1-5)"
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label="Max Pages"
                      type="number"
                      size="small"
                      value={maxPages}
                      onChange={(e) => setMaxPages(Math.max(1, parseInt(e.target.value) || 1))}
                      inputProps={{ min: 1, max: 100 }}
                      helperText="Maximum total pages to scrape (1-100)"
                      sx={{ flex: 1 }}
                    />
                  </Box>
                  
                  <FormControlLabel
                    control={
                      <Switch
                        checked={stayOnDomain}
                        onChange={(e) => setStayOnDomain(e.target.checked)}
                      />
                    }
                    label="Stay on same domain"
                    sx={{ mb: 2 }}
                  />
                  
                  <TextField
                    fullWidth
                    label="Link Pattern (optional)"
                    placeholder="/blog/, /docs/, /articles/"
                    value={linkPattern}
                    onChange={(e) => setLinkPattern(e.target.value)}
                    sx={{ mb: 2 }}
                    helperText="Only follow links containing these patterns (comma-separated)"
                  />
                  
                  <TextField
                    fullWidth
                    label="Exclude Pattern (optional)"
                    placeholder="/admin/, /login/, .pdf, .jpg"
                    value={excludePattern}
                    onChange={(e) => setExcludePattern(e.target.value)}
                    helperText="Skip links containing these patterns (comma-separated)"
                  />
                </Box>
              )}
            </Box>
          </AccordionDetails>
        </Accordion>

        <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
          <Tooltip 
            title={followLinks ? 
              `Will scrape the main page and follow internal links up to ${maxDepth} levels deep, collecting up to ${maxPages} total pages` :
              "Will scrape only the specified page"
            }
          >
            <span>
              <Button
                variant="contained"
                onClick={scrapeWebpage}
                disabled={!url.trim() || isScraping || isValidating}
                startIcon={isScraping ? <CircularProgress size={16} /> : <WebIcon />}
              >
                {isScraping ? 
                  (followLinks ? 'Scraping Multiple Pages...' : 'Scraping...') : 
                  (followLinks ? `Scrape Website (up to ${maxPages} pages, ${maxDepth} levels)` : 'Scrape Website')
                }
              </Button>
            </span>
          </Tooltip>
          
          {followLinks && (
            <Typography variant="caption" color="textSecondary" sx={{ ml: 2 }}>
              ⚠️ Recursive scraping may take longer and consume more resources
            </Typography>
          )}
        </Box>
      </Paper>

      {/* Scraped Content List */}
      {scrapedContent.length > 0 && (
        <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            Scraped Content ({scrapedContent.length})
          </Typography>
          <List>
            {scrapedContent.map((item) => (
              <ListItem key={item.id} divider>
                <ListItemIcon>
                  <WebIcon />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="subtitle2">
                        {item.title}
                      </Typography>
                      {item.metadata.depth > 0 && (
                        <Chip 
                          label={`Depth ${item.metadata.depth}`} 
                          size="small" 
                          variant="outlined"
                          color="primary"
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="body2" color="textSecondary">
                        {item.url}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {item.metadata.contentLength} characters • Namespace: {item.namespace}
                        {item.metadata.parentUrl && ` • Parent: ${new URL(item.metadata.parentUrl).pathname}`}
                      </Typography>
                    </Box>
                  }
                />
                <Tooltip title="Preview content">
                  <IconButton onClick={() => showPreview(item.content)}>
                    <PreviewIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Remove">
                  <IconButton onClick={() => removeScrapedContent(item.id)} color="error">
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </ListItem>
            ))}
          </List>

          <Box mt={2} display="flex" justifyContent="space-between">
            <Button
              variant="contained"
              color="primary"
              onClick={processScrapedContent}
              disabled={isProcessing || scrapedContent.length === 0}
            >
              {isProcessing ? (
                <>
                  <CircularProgress size={24} color="inherit" style={{ marginRight: 10 }} />
                  Processing...
                </>
              ) : (
                'Process Scraped Content'
              )}
            </Button>
            
            <Button
              variant="outlined"
              onClick={() => setScrapedContent([])}
              disabled={isProcessing || scrapedContent.length === 0}
            >
              Clear All
            </Button>
          </Box>
        </Paper>
      )}

      {/* Status Messages */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      {/* Preview Dialog */}
      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Content Preview</DialogTitle>
        <DialogContent>
          <Box
            component="pre"
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              maxHeight: '400px',
              overflow: 'auto',
              backgroundColor: 'grey.50',
              p: 2,
              borderRadius: 1
            }}
          >
            {previewContent}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WebScraper; 