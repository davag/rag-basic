import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Button, TextField, Grid, CircularProgress, Alert, IconButton, ToggleButton, ToggleButtonGroup } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

const REVIEW_CRITERIA = [
  'Accuracy',
  'Completeness',
  'Relevance',
  'Conciseness',
  'Clarity',
  'Exception handling',
  'Unclear statement'
];

export default function ReviewerDashboard() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [scores, setScores] = useState({});
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [fontSize, setFontSize] = useState('medium');
  const fontSizeMap = { small: '0.9rem', medium: '1.1rem', large: '1.3rem' };

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reviews/queue');
      const data = await res.json();
      setQueue(data);
    } catch (e) {
      setErrorMsg('Failed to load review queue');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPrompt = (prompt) => {
    setSelectedPrompt(prompt);
    setScores({});
    setComments('');
    setSuccessMsg('');
    setErrorMsg('');
  };

  const handleScoreChange = (criterion, value) => {
    setScores((prev) => ({ ...prev, [criterion]: Number(value) }));
  };

  const handleSubmitReview = async () => {
    if (!selectedPrompt) return;
    setSubmitting(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/reviews/${selectedPrompt.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores, comments })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Review submitted!');
        setSelectedPrompt(null);
        fetchQueue();
      } else {
        setErrorMsg(data.error || 'Failed to submit review');
      }
    } catch (e) {
      setErrorMsg('Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  // Helper for copy-to-clipboard
  const handleCopy = (text) => {
    if (navigator && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  };

  const handleFontSizeChange = (event, newSize) => {
    if (newSize) setFontSize(newSize);
  };

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h5" gutterBottom>Reviewer Dashboard</Typography>
        <ToggleButtonGroup
          value={fontSize}
          exclusive
          onChange={handleFontSizeChange}
          size="small"
          aria-label="font size"
        >
          <ToggleButton value="small" aria-label="small font">A-</ToggleButton>
          <ToggleButton value="medium" aria-label="medium font">A</ToggleButton>
          <ToggleButton value="large" aria-label="large font">A+</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {loading && <CircularProgress />}
      {errorMsg && <Alert severity="error">{errorMsg}</Alert>}
      {successMsg && <Alert severity="success">{successMsg}</Alert>}
      {!selectedPrompt ? (
        <Box>
          <Typography variant="subtitle1" gutterBottom>Prompts Awaiting Review:</Typography>
          {queue.length === 0 && <Typography>No prompts in review queue.</Typography>}
          {queue.map((prompt) => (
            <Paper key={prompt.id} sx={{ p: 2, mb: 2 }}>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>{prompt.text}</Typography>
              <Button variant="contained" sx={{ mt: 1 }} onClick={() => handleSelectPrompt(prompt)}>
                Review This Prompt
              </Button>
            </Paper>
          ))}
        </Box>
      ) : (
        <Box>
          <Typography variant="subtitle1" gutterBottom>Review Prompt:</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6} sx={{ minWidth: 0, flex: 1 }}>
              <Paper elevation={2} sx={{ p: 2, bgcolor: 'background.default', position: 'relative', minHeight: 350 }}>
                <Typography variant="subtitle1" gutterBottom>System Prompt</Typography>
                <IconButton
                  size="small"
                  sx={{ position: 'absolute', top: 8, right: 8 }}
                  onClick={() => handleCopy(selectedPrompt.text)}
                  title="Copy prompt"
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
                <Box
                  sx={{
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    bgcolor: 'grey.100',
                    p: 2,
                    borderRadius: 1,
                    minHeight: 200,
                    maxHeight: 500,
                    overflowY: 'auto',
                    fontSize: fontSizeMap[fontSize],
                  }}
                >
                  {selectedPrompt.text}
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6} sx={{ minWidth: 0, flex: 1 }}>
              <Paper elevation={2} sx={{ p: 2, bgcolor: 'background.default', position: 'relative', minHeight: 350 }}>
                <Typography variant="subtitle1" gutterBottom>Model Response</Typography>
                <IconButton
                  size="small"
                  sx={{ position: 'absolute', top: 8, right: 8 }}
                  onClick={() => handleCopy(selectedPrompt.response || '')}
                  title="Copy response"
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
                <Box
                  sx={{
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    bgcolor: 'grey.100',
                    p: 2,
                    borderRadius: 1,
                    minHeight: 200,
                    maxHeight: 500,
                    overflowY: 'auto',
                    fontSize: fontSizeMap[fontSize],
                  }}
                >
                  {selectedPrompt.response
                    ? selectedPrompt.response
                    : <em>No model response available for this prompt.</em>}
                </Box>
              </Paper>
            </Grid>
          </Grid>
          {/* Scoring and comments form below */}
          <Grid container spacing={2} sx={{ mt: 2 }}>
            {REVIEW_CRITERIA.map((criterion) => (
              <Grid item xs={12} sm={6} md={4} key={criterion}>
                <TextField
                  label={criterion}
                  type="number"
                  inputProps={{ min: 1, max: 10 }}
                  value={scores[criterion] || ''}
                  onChange={e => handleScoreChange(criterion, e.target.value)}
                  fullWidth
                />
              </Grid>
            ))}
          </Grid>
          <Box mt={2}>
            <TextField
              label="Comments"
              multiline
              rows={3}
              value={comments}
              onChange={e => setComments(e.target.value)}
              fullWidth
            />
          </Box>
          <Box mt={2}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSubmitReview}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </Button>
            <Button sx={{ ml: 2 }} onClick={() => setSelectedPrompt(null)} disabled={submitting}>
              Cancel
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
} 