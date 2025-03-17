import React, { useState } from 'react';
import { 
  Typography, 
  Box, 
  Paper, 
  Button, 
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Divider,
  LinearProgress,
  Rating,
  Chip,
  Stack,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { createLlmInstance } from '../utils/apiServices';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const ResponseValidation = ({ 
  responses, 
  metrics, 
  currentQuery, 
  systemPrompts, 
  sources,
  onValidationComplete,
  validationResults,
  isProcessing,
  setIsProcessing
}) => {
  const [validatorModel, setValidatorModel] = useState('gpt-4o');
  const [customCriteria, setCustomCriteria] = useState(
    'Accuracy: Does the response correctly answer the query based on the provided context?\n' +
    'Completeness: Does the response address all aspects of the query?\n' +
    'Relevance: Is the information in the response relevant to the query?\n' +
    'Conciseness: Is the response appropriately concise without omitting important information?\n' +
    'Clarity: Is the response clear, well-structured, and easy to understand?'
  );
  const [expandedCriteria, setExpandedCriteria] = useState(false);
  const [error, setError] = useState(null);

  const handleValidatorModelChange = (event) => {
    setValidatorModel(event.target.value);
  };

  const handleCustomCriteriaChange = (event) => {
    setCustomCriteria(event.target.value);
  };

  const handleCriteriaToggle = () => {
    setExpandedCriteria(!expandedCriteria);
  };

  const validateResponses = async () => {
    setIsProcessing(true);
    setError(null);
    
    const results = {};
    
    try {
      // Create LLM instance for validation
      const llm = createLlmInstance(validatorModel, '', {
        temperature: 0 // Use deterministic output for evaluation
      });
      
      // Format source documents for the prompt
      const contextText = sources.map(source => 
        `Source: ${source.source}\nContent: ${source.content}`
      ).join('\n\n');
      
      // Process each model response
      for (const model of Object.keys(responses)) {
        const response = responses[model];
        const answer = typeof response.answer === 'object' ? response.answer.text : response.answer;
        
        // Create the evaluation prompt
        const prompt = `
You are an expert evaluator of RAG (Retrieval-Augmented Generation) systems. Your task is to evaluate the quality of an AI assistant's response to a user query.

USER QUERY:
${currentQuery}

CONTEXT PROVIDED TO THE AI ASSISTANT:
${contextText}

AI ASSISTANT RESPONSE (from ${model}):
${answer}

EVALUATION CRITERIA:
${customCriteria}

Please evaluate the response on a scale of 1-100 for each criterion, and provide a brief explanation for each score.
Then, calculate an overall score (1-100) that represents the overall quality of the response.

Format your response as a JSON object with the following structure:
{
  "criteria": {
    "criterion1": {
      "score": number,
      "explanation": "string"
    },
    ...
  },
  "overall": {
    "score": number,
    "explanation": "string"
  }
}
`;
        
        // Call the LLM for evaluation
        const evaluationResult = await llm.invoke(prompt);
        
        // Parse the JSON response
        try {
          // Extract JSON from the response (in case the LLM adds any text before or after the JSON)
          const jsonMatch = evaluationResult.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsedResult = JSON.parse(jsonMatch[0]);
            results[model] = parsedResult;
          } else {
            throw new Error('Could not extract JSON from the response');
          }
        } catch (parseError) {
          window.console.error('Error parsing evaluation result:', parseError);
          results[model] = {
            error: 'Failed to parse evaluation result',
            rawResponse: evaluationResult
          };
        }
      }
      
      // Update the validation results
      onValidationComplete(results);
      
    } catch (err) {
      window.console.error('Error validating responses:', err);
      setError('Error validating responses: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const generatePDF = () => {
    // Create a new jsPDF instance
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    
    // Title
    doc.setFontSize(18);
    doc.text('RAG Response Validation Report', margin, 20);
    
    // Query
    doc.setFontSize(14);
    doc.text('Query', margin, 30);
    doc.setFontSize(12);
    const queryLines = doc.splitTextToSize(currentQuery || 'No query provided', contentWidth);
    doc.text(queryLines, margin, 40);
    
    let yPos = 40 + (queryLines.length * 7);
    
    // Validation Criteria
    yPos += 10;
    doc.setFontSize(14);
    doc.text('Validation Criteria', margin, yPos);
    yPos += 10;
    doc.setFontSize(10);
    const criteriaLines = doc.splitTextToSize(customCriteria, contentWidth);
    doc.text(criteriaLines, margin, yPos);
    yPos += (criteriaLines.length * 5) + 10;
    
    // Add a new page for validation results
    doc.addPage();
    yPos = 20;
    
    // Validation Results
    doc.setFontSize(14);
    doc.text('Validation Results', margin, yPos);
    yPos += 10;
    
    // Process each model's validation results
    Object.keys(validationResults).forEach((model, index) => {
      if (index > 0) {
        // Add a new page for each model after the first
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.text(`Model: ${model}`, margin, yPos);
      yPos += 10;
      
      const result = validationResults[model];
      
      if (result.error) {
        doc.setTextColor(255, 0, 0);
        doc.text(`Error: ${result.error}`, margin, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 10;
        return;
      }
      
      // Overall score
      if (result.overall) {
        doc.setFontSize(12);
        doc.text(`Overall Score: ${result.overall.score}/100`, margin, yPos);
        yPos += 7;
        
        doc.setFontSize(10);
        const overallExplanationLines = doc.splitTextToSize(result.overall.explanation, contentWidth);
        doc.text(overallExplanationLines, margin, yPos);
        yPos += (overallExplanationLines.length * 5) + 10;
      }
      
      // Individual criteria
      if (result.criteria) {
        doc.setFontSize(12);
        doc.text('Criteria Scores:', margin, yPos);
        yPos += 10;
        
        Object.entries(result.criteria).forEach(([criterion, details]) => {
          doc.setFontSize(11);
          doc.text(`${criterion}: ${details.score}/100`, margin, yPos);
          yPos += 7;
          
          doc.setFontSize(9);
          const explanationLines = doc.splitTextToSize(details.explanation, contentWidth - 10);
          doc.text(explanationLines, margin + 5, yPos);
          yPos += (explanationLines.length * 5) + 7;
        });
      }
      
      // Add model response
      yPos += 5;
      doc.setFontSize(12);
      doc.text('Model Response:', margin, yPos);
      yPos += 7;
      
      const answer = typeof responses[model].answer === 'object' ? 
        responses[model].answer.text : 
        responses[model].answer;
      
      doc.setFontSize(9);
      const responseLines = doc.splitTextToSize(answer, contentWidth - 10);
      doc.text(responseLines, margin + 5, yPos);
      yPos += (responseLines.length * 5) + 10;
    });
    
    // Add source documents on a new page
    doc.addPage();
    yPos = 20;
    doc.setFontSize(14);
    doc.text('Source Documents', margin, yPos);
    yPos += 10;
    
    sources.forEach((source, index) => {
      // Add a new page if we're getting close to the bottom
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(11);
      doc.text(`Source ${index + 1}: ${source.source}`, margin, yPos);
      yPos += 7;
      
      doc.setFontSize(9);
      // Truncate very long source content for the PDF
      const contentToShow = source.content.length > 2000 ? 
        source.content.substring(0, 2000) + '... (truncated)' : 
        source.content;
      
      const contentLines = doc.splitTextToSize(contentToShow, contentWidth - 5);
      doc.text(contentLines, margin + 5, yPos);
      yPos += (contentLines.length * 5) + 10;
    });
    
    // Save the PDF
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    doc.save(`rag-validation-report-${timestamp}.pdf`);
  };

  // Helper function to render a score with a colored bar
  const renderScore = (score) => {
    let color = '#f44336'; // red
    if (score >= 80) color = '#4caf50'; // green
    else if (score >= 60) color = '#ff9800'; // orange
    
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <Box sx={{ width: '100%', mr: 1 }}>
          <LinearProgress 
            variant="determinate" 
            value={score} 
            sx={{ 
              height: 10, 
              borderRadius: 5,
              backgroundColor: '#e0e0e0',
              '& .MuiLinearProgress-bar': {
                backgroundColor: color
              }
            }} 
          />
        </Box>
        <Box sx={{ minWidth: 35 }}>
          <Typography variant="body2" color="text.secondary">{score}/100</Typography>
        </Box>
      </Box>
    );
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">
          Response Validation
        </Typography>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<DownloadIcon />}
          onClick={generatePDF}
          disabled={!Object.keys(validationResults).length || isProcessing}
        >
          Download Report
        </Button>
      </Box>

      <Typography variant="body2" color="textSecondary" paragraph>
        This tool evaluates the quality of each model's response using another LLM as a judge. 
        The validator will score each response on a scale of 1-100 based on the criteria you specify.
      </Typography>

      <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Validation Settings
        </Typography>
        
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel id="validator-model-label">Validator Model</InputLabel>
          <Select
            labelId="validator-model-label"
            id="validator-model"
            value={validatorModel}
            onChange={handleValidatorModelChange}
            disabled={isProcessing}
          >
            <MenuItem value="gpt-4o">GPT-4o</MenuItem>
            <MenuItem value="gpt-4o-mini">GPT-4o-mini</MenuItem>
            <MenuItem value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</MenuItem>
            <MenuItem value="claude-3-7-sonnet-latest">Claude 3.7 Sonnet</MenuItem>
          </Select>
        </FormControl>
        
        <Accordion 
          expanded={expandedCriteria}
          onChange={handleCriteriaToggle}
          sx={{ mb: 3 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>Evaluation Criteria</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <TextField
              fullWidth
              multiline
              rows={8}
              variant="outlined"
              value={customCriteria}
              onChange={handleCustomCriteriaChange}
              disabled={isProcessing}
              placeholder="Enter the criteria for evaluating responses..."
              helperText="Specify the criteria that the validator should use to evaluate the responses."
            />
          </AccordionDetails>
        </Accordion>
        
        <Box display="flex" justifyContent="center">
          <Button
            variant="contained"
            color="primary"
            startIcon={<AssessmentIcon />}
            onClick={validateResponses}
            disabled={isProcessing || Object.keys(responses).length === 0}
          >
            {isProcessing ? (
              <>
                <CircularProgress size={24} color="inherit" sx={{ mr: 1 }} />
                Validating Responses...
              </>
            ) : (
              'Validate Responses'
            )}
          </Button>
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {Object.keys(validationResults).length > 0 && (
        <Box mb={4}>
          <Typography variant="h6" gutterBottom>
            Validation Results
          </Typography>
          
          <Grid container spacing={3}>
            {Object.keys(validationResults).map((model) => {
              const result = validationResults[model];
              
              if (result.error) {
                return (
                  <Grid item xs={12} key={model}>
                    <Alert severity="error">
                      Error validating {model}: {result.error}
                    </Alert>
                  </Grid>
                );
              }
              
              return (
                <Grid item xs={12} md={6} key={model}>
                  <Card variant="outlined">
                    <CardHeader
                      title={model}
                      subheader={
                        result.overall ? 
                          `Overall Score: ${result.overall.score}/100` : 
                          'Validation Complete'
                      }
                      action={
                        <Chip 
                          label={`${result.overall?.score || 0}/100`}
                          color={
                            result.overall?.score >= 80 ? 'success' : 
                            result.overall?.score >= 60 ? 'warning' : 
                            'error'
                          }
                        />
                      }
                    />
                    <Divider />
                    <CardContent>
                      {result.overall && (
                        <Box mb={3}>
                          <Typography variant="subtitle1" gutterBottom>
                            Overall Assessment
                          </Typography>
                          <Typography variant="body2" paragraph>
                            {result.overall.explanation}
                          </Typography>
                          {renderScore(result.overall.score)}
                        </Box>
                      )}
                      
                      {result.criteria && (
                        <Box>
                          <Typography variant="subtitle1" gutterBottom>
                            Criteria Breakdown
                          </Typography>
                          <Stack spacing={2}>
                            {Object.entries(result.criteria).map(([criterion, details]) => (
                              <Box key={criterion}>
                                <Typography variant="body2" fontWeight="bold">
                                  {criterion}
                                </Typography>
                                <Typography variant="body2" paragraph>
                                  {details.explanation}
                                </Typography>
                                {renderScore(details.score)}
                              </Box>
                            ))}
                          </Stack>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}
    </Box>
  );
};

export default ResponseValidation; 