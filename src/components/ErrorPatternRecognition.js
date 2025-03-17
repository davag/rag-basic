import React, { useState, useEffect, useCallback } from 'react';
import { 
  Typography, 
  Box, 
  Paper, 
  Chip,
  Card,
  CardContent,
  CardHeader,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Button,
  Collapse,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import BugReportIcon from '@mui/icons-material/BugReport';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import SettingsIcon from '@mui/icons-material/Settings';
import { createLlmInstance } from '../utils/apiServices';

// Error patterns array with regular expressions and suggestions
const ERROR_PATTERNS = [
  {
    id: 'hallucination',
    name: 'Hallucination',
    description: 'Information not present in context',
    severity: 'high',
    regexPatterns: [
      /I don't see (that|this|any) (information|data|details|specifics) in the (provided|given|available) (context|documents|text|information)/i,
      /The (context|document|provided information) does not (mention|contain|include|provide) (any|specific|detailed) information about/i,
      /That information is not present in the (provided|given) (context|documents)/i,
      /I cannot find (any|specific) mention of/i
    ],
    suggestedFix: 'Strengthen the instruction to only use the provided context and be explicit about stating when information is not available.'
  },
  {
    id: 'uncertainty',
    name: 'Uncertainty Markers',
    description: 'Model expressing uncertainty',
    severity: 'medium',
    regexPatterns: [
      /I'm not (entirely |completely |fully )?(sure|certain)/i,
      /It's (unclear|not clear|difficult to determine|hard to say)/i,
      /I (cannot|can't) (determine|ascertain|be certain)/i,
      /(might|may|could|possibly|perhaps)/i
    ],
    suggestedFix: 'Update the prompt to encourage the model to be more explicit about what it knows and doesn\'t know.'
  },
  {
    id: 'contradictions',
    name: 'Contradictions',
    description: 'Contradictory statements within response',
    severity: 'high',
    regexPatterns: [
      /on( the)? one hand.*on( the)? other hand/i,
      /however, (the |this |it )/i,
      /nevertheless/i,
      /but the (context|document|text) (also|additionally) (states|mentions|indicates)/i
    ],
    suggestedFix: 'Modify the prompt to request explicit clarification when the context contains potentially contradictory information.'
  },
  {
    id: 'incomplete',
    name: 'Incomplete Answers',
    description: 'Response does not fully address the query',
    severity: 'medium',
    regexPatterns: [
      /for (more|additional|further|complete) information/i,
      /to (fully|completely) answer (your|this) (question|query)/i,
      /would need (more|additional) (context|information|details)/i,
      /the (context|document|provided information) doesn't (provide|contain|include) (complete|enough|sufficient)/i
    ],
    suggestedFix: 'Instruct the model to provide as complete an answer as possible from the available context, and explicitly state limitations.'
  },
  {
    id: 'generic',
    name: 'Generic Responses',
    description: 'Overly generic or templated response',
    severity: 'low',
    regexPatterns: [
      /generally speaking/i,
      /in general/i,
      /typically/i,
      /it is (common|typical|standard|usual|normal) (for|to|that)/i
    ],
    suggestedFix: 'Update the prompt to request specific information from the context rather than general knowledge.'
  },
  {
    id: 'mismatch',
    name: 'Context Mismatch',
    description: 'Response doesn\'t align with context',
    severity: 'high',
    regexPatterns: [
      /Based on (general knowledge|my training)/i,
      /While I don't have (specific|exact) information/i,
      /The (context|document|provided information) doesn't (specifically|explicitly) (mention|address|cover)/i,
      /I don't have access to/i
    ],
    suggestedFix: 'Emphasize in the prompt that the model should only answer based on the provided context, not general knowledge.'
  }
];

const ErrorPatternRecognition = ({ responses, currentQuery, systemPrompts }) => {
  const [expanded, setExpanded] = useState(false);
  const [errorAnalysis, setErrorAnalysis] = useState({});
  const [showFixSuggestion, setShowFixSuggestion] = useState({});
  const [improvedPrompts, setImprovedPrompts] = useState({});
  const [isGeneratingImprovedPrompt, setIsGeneratingImprovedPrompt] = useState({});

  // Helper function to extract context around a matched text
  const extractContext = useCallback((fullText, matchedText, range) => {
    const index = fullText.indexOf(matchedText);
    if (index === -1) return matchedText;
    
    const start = Math.max(0, index - range);
    const end = Math.min(fullText.length, index + matchedText.length + range);
    
    let context = fullText.substring(start, end);
    
    // Add ellipsis if we truncated
    if (start > 0) context = '...' + context;
    if (end < fullText.length) context = context + '...';
    
    return context;
  }, []);
  
  // Function to analyze responses for error patterns, memoized with useCallback
  const analyzeErrorPatterns = useCallback(() => {
    const analysis = {};

    Object.entries(responses).forEach(([model, modelResponse]) => {
      const responseText = typeof modelResponse.answer === 'object' ? 
        modelResponse.answer.text : 
        modelResponse.answer;
      
      const foundPatterns = [];
      
      // Check each error pattern against the response
      ERROR_PATTERNS.forEach(pattern => {
        // Check if any regex in the pattern matches
        const matchesFound = pattern.regexPatterns.some(regex => 
          regex.test(responseText)
        );
        
        if (matchesFound) {
          // Find the exact match that triggered this pattern
          let matchedText = '';
          for (const regex of pattern.regexPatterns) {
            const match = responseText.match(regex);
            if (match) {
              matchedText = match[0];
              break;
            }
          }
          
          foundPatterns.push({
            ...pattern,
            matchedText: matchedText,
            // Extract surrounding context (up to 100 chars before and after)
            context: extractContext(responseText, matchedText, 100)
          });
        }
      });
      
      // Sort patterns by severity
      foundPatterns.sort((a, b) => {
        const severityMap = { high: 3, medium: 2, low: 1 };
        return severityMap[b.severity] - severityMap[a.severity];
      });
      
      analysis[model] = {
        patterns: foundPatterns,
        hasPatterns: foundPatterns.length > 0
      };
    });
    
    setErrorAnalysis(analysis);
  }, [responses, extractContext]);
  
  // Initial analysis of responses for error patterns
  useEffect(() => {
    if (Object.keys(responses).length > 0) {
      analyzeErrorPatterns();
    }
  }, [responses, analyzeErrorPatterns]);

  // Function to generate an improved system prompt
  const generateImprovedPrompt = async (model, patterns) => {
    setIsGeneratingImprovedPrompt(prev => ({ ...prev, [model]: true }));
    
    try {
      // Get the current system prompt for this model
      const currentPrompt = systemPrompts[model] || '';
      
      // Create a prompt advisor instance
      const advisorModel = localStorage.getItem('promptAdvisorModel') || 'gpt-4o-mini';
      const ollamaEndpoint = localStorage.getItem('ollamaEndpoint') || 'http://localhost:11434';
      
      const advisorLlm = createLlmInstance(advisorModel, '', {
        ollamaEndpoint: ollamaEndpoint,
        temperature: 0.7
      });
      
      // Format detected issues for the advisor
      const issuesText = patterns.map(p => 
        `- ${p.name} (${p.severity} severity): ${p.description}\n  Example: "${p.matchedText}"`
      ).join('\n');
      
      // Create the advisor prompt
      const adviserPrompt = `
You are an expert at refining system prompts for RAG (Retrieval-Augmented Generation) systems. I need your help improving a system prompt to address specific error patterns detected in the model's responses.

CURRENT SYSTEM PROMPT:
"""
${currentPrompt}
"""

QUERY THAT CAUSED ERRORS:
"""
${currentQuery}
"""

DETECTED ERROR PATTERNS:
${issuesText}

Please provide an improved version of the system prompt that specifically addresses these error patterns. Focus on making precise, targeted modifications rather than rewriting the entire prompt.

Your modifications should:
1. Address each of the detected error patterns
2. Preserve the original intent and structure where possible
3. Be clear and concise
4. Not add unnecessary complexity

Return ONLY the improved system prompt without any explanations or additional text.
`;
      
      // Get the improved prompt
      const response = await advisorLlm.invoke(adviserPrompt);
      const improvedPrompt = typeof response === 'object' ? response.text : response;
      
      // Update state with the improved prompt
      setImprovedPrompts(prev => ({
        ...prev,
        [model]: improvedPrompt
      }));
      
    } catch (err) {
      window.console.error('Error generating improved prompt:', err);
    } finally {
      setIsGeneratingImprovedPrompt(prev => ({ ...prev, [model]: false }));
    }
  };
  
  // Get severity color
  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return '#f44336'; // red
      case 'medium': return '#ff9800'; // orange
      case 'low': return '#4caf50'; // green
      default: return '#2196f3'; // blue
    }
  };
  
  // Toggle showing fix suggestion
  const toggleFixSuggestion = (model, patternId) => {
    setShowFixSuggestion(prev => ({
      ...prev,
      [`${model}-${patternId}`]: !prev[`${model}-${patternId}`]
    }));
  };

  return (
    <Accordion expanded={expanded} onChange={() => setExpanded(!expanded)}>
      <AccordionSummary 
        expandIcon={<ExpandMoreIcon />}
        sx={{ 
          backgroundColor: hasErrorPatterns() ? '#fff8e1' : 'inherit',
          '&.Mui-expanded': {
            backgroundColor: hasErrorPatterns() ? '#fff8e1' : 'inherit'
          }
        }}
      >
        <Box display="flex" alignItems="center">
          <BugReportIcon sx={{ mr: 1, color: hasErrorPatterns() ? '#e65100' : 'text.secondary' }} />
          <Typography variant="h6">
            Error Pattern Analysis
            {hasErrorPatterns() && (
              <Chip 
                size="small" 
                label={`${getTotalErrorCount()} issues found`} 
                color="warning"
                sx={{ ml: 2, fontWeight: 'bold' }}
              />
            )}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {Object.keys(errorAnalysis).length === 0 ? (
          <Typography color="text.secondary">
            No responses analyzed yet.
          </Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" paragraph>
              This analysis identifies common error patterns in the model responses that may indicate issues with the system prompt.
              Addressing these patterns can improve the quality and accuracy of responses.
            </Typography>
            
            {Object.entries(errorAnalysis).map(([model, analysis]) => (
              <Card key={model} variant="outlined" sx={{ mb: 3 }}>
                <CardHeader
                  title={model}
                  subheader={
                    analysis.hasPatterns ? 
                      `${analysis.patterns.length} error pattern${analysis.patterns.length !== 1 ? 's' : ''} detected` : 
                      'No error patterns detected'
                  }
                  action={
                    analysis.hasPatterns && (
                      <Button
                        size="small"
                        startIcon={<TipsAndUpdatesIcon />}
                        onClick={() => generateImprovedPrompt(model, analysis.patterns)}
                        disabled={isGeneratingImprovedPrompt[model]}
                        color="primary"
                        variant="outlined"
                        sx={{ mr: 1 }}
                      >
                        {isGeneratingImprovedPrompt[model] ? 'Generating...' : 'Suggest Improved Prompt'}
                      </Button>
                    )
                  }
                />
                <Divider />
                <CardContent>
                  {!analysis.hasPatterns ? (
                    <Typography variant="body2" color="success.main">
                      No error patterns were detected in this response. The model appears to be handling the query well.
                    </Typography>
                  ) : (
                    <>
                      <List disablePadding>
                        {analysis.patterns.map((pattern, index) => (
                          <React.Fragment key={pattern.id}>
                            {index > 0 && <Divider component="li" />}
                            <ListItem 
                              alignItems="flex-start"
                              sx={{ 
                                py: 2,
                                backgroundColor: index % 2 === 0 ? 'rgba(0, 0, 0, 0.02)' : 'inherit'
                              }}
                            >
                              <ListItemIcon sx={{ minWidth: 40 }}>
                                <ErrorOutlineIcon sx={{ color: getSeverityColor(pattern.severity) }} />
                              </ListItemIcon>
                              <ListItemText
                                primary={
                                  <Box display="flex" alignItems="center">
                                    <Typography variant="subtitle1" component="span">
                                      {pattern.name}
                                    </Typography>
                                    <Chip
                                      size="small"
                                      label={pattern.severity}
                                      sx={{ 
                                        ml: 1, 
                                        backgroundColor: getSeverityColor(pattern.severity),
                                        color: 'white',
                                        textTransform: 'capitalize',
                                        fontSize: '0.7rem',
                                        height: 20
                                      }}
                                    />
                                  </Box>
                                }
                                secondary={
                                  <>
                                    <Typography variant="body2" component="span" color="text.primary">
                                      {pattern.description}
                                    </Typography>
                                    <Box mt={1} mb={1} p={1} bgcolor="background.paper" borderRadius={1} border="1px solid #e0e0e0">
                                      <Typography variant="body2" component="div" whiteSpace="pre-wrap" fontFamily="monospace" fontSize="0.85rem">
                                        {pattern.context}
                                      </Typography>
                                    </Box>
                                    <Button
                                      size="small"
                                      startIcon={<TipsAndUpdatesIcon />}
                                      onClick={() => toggleFixSuggestion(model, pattern.id)}
                                      sx={{ mt: 1, textTransform: 'none' }}
                                    >
                                      {showFixSuggestion[`${model}-${pattern.id}`] ? 'Hide Suggestion' : 'Show Suggestion'}
                                    </Button>
                                    <Collapse in={showFixSuggestion[`${model}-${pattern.id}`]}>
                                      <Box mt={1}>
                                        <Alert severity="info" icon={<SettingsIcon />}>
                                          <Typography variant="body2">
                                            <strong>Suggested Fix:</strong> {pattern.suggestedFix}
                                          </Typography>
                                        </Alert>
                                      </Box>
                                    </Collapse>
                                  </>
                                }
                              />
                            </ListItem>
                          </React.Fragment>
                        ))}
                      </List>
                    
                      {improvedPrompts[model] && (
                        <Box mt={3}>
                          <Typography variant="subtitle1" gutterBottom>
                            Improved System Prompt
                          </Typography>
                          <Paper variant="outlined" sx={{ p: 2, backgroundColor: '#f5f5f5' }}>
                            <Typography variant="body2" component="div" whiteSpace="pre-wrap" fontFamily="monospace" fontSize="0.85rem">
                              {improvedPrompts[model]}
                            </Typography>
                          </Paper>
                        </Box>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
  
  // Helper function to check if any models have error patterns
  function hasErrorPatterns() {
    return Object.values(errorAnalysis).some(analysis => analysis.hasPatterns);
  }
  
  // Helper function to count total errors across all models
  function getTotalErrorCount() {
    return Object.values(errorAnalysis).reduce((count, analysis) => {
      return count + (analysis.patterns ? analysis.patterns.length : 0);
    }, 0);
  }
};

export default ErrorPatternRecognition; 