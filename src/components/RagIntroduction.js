import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import PsychologyIcon from '@mui/icons-material/Psychology';
import StorageIcon from '@mui/icons-material/Storage';
import SearchIcon from '@mui/icons-material/Search';
import CompareIcon from '@mui/icons-material/Compare';
import CloseIcon from '@mui/icons-material/Close';
import { styled } from '@mui/material/styles';

// Styled components for UML diagrams
const UmlContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  margin: theme.spacing(2, 0),
  backgroundColor: theme.palette.background.default,
  borderRadius: theme.shape.borderRadius,
}));

const UmlComponent = styled(Box)(({ theme }) => ({
  border: `2px solid ${theme.palette.primary.light}`,
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(1),
  margin: theme.spacing(1),
  textAlign: 'center',
  backgroundColor: theme.palette.background.paper,
  position: 'relative',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    border: `1px dashed ${theme.palette.primary.light}`,
    borderRadius: theme.shape.borderRadius,
    opacity: 0.3,
  }
}));

const UmlInterface = styled(Box)(({ theme }) => ({
  border: `1px solid ${theme.palette.info.light}`,
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(0.5),
  margin: theme.spacing(0.5),
  textAlign: 'center',
  backgroundColor: theme.palette.background.paper,
  fontSize: '0.8rem',
  color: theme.palette.info.main,
}));

const UmlArrow = styled(Box)(({ theme }) => ({
  position: 'relative',
  '&::after': {
    content: '"→"',
    position: 'absolute',
    right: -20,
    top: '50%',
    transform: 'translateY(-50%)',
    color: theme.palette.primary.light,
  },
}));

const RagIntroduction = ({ open, onClose }) => {
  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">
            Understanding RAG and LLMs
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body1" paragraph>
          Welcome to the RAG (Retrieval-Augmented Generation) introduction! This guide will help you understand
          the basic concepts of RAG and Large Language Models (LLMs) in a simple way.
        </Typography>

        {/* What is RAG Section */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">
              <PsychologyIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              What is RAG?
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body1" paragraph>
              RAG (Retrieval-Augmented Generation) is a powerful technique that combines the capabilities of
              Large Language Models (LLMs) with external knowledge sources to provide more accurate and
              up-to-date responses.
            </Typography>

            {/* Document Types and Chunking Section */}
            <Typography variant="subtitle1" gutterBottom sx={{ mt: 3 }}>
              Document Types and Chunking
            </Typography>
            <Typography variant="body2" paragraph>
              RAG systems typically work with various types of documents that are processed and stored in chunks:
            </Typography>
            <List dense>
              <ListItem>
                <ListItemIcon>
                  <StorageIcon color="primary" />
                </ListItemIcon>
                <ListItemText 
                  primary="Text Documents"
                  secondary="PDFs, Word documents, markdown files, plain text files"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <StorageIcon color="primary" />
                </ListItemIcon>
                <ListItemText 
                  primary="Web Content"
                  secondary="HTML pages, blog posts, articles, documentation"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <StorageIcon color="primary" />
                </ListItemIcon>
                <ListItemText 
                  primary="Structured Data"
                  secondary="JSON, CSV, XML files, database exports"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <StorageIcon color="primary" />
                </ListItemIcon>
                <ListItemText 
                  primary="Code and Technical Docs"
                  secondary="Source code, API documentation, technical specifications"
                />
              </ListItem>
            </List>

            <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
              Chunking Strategy
            </Typography>
            <Typography variant="body2" paragraph>
              Documents are typically split into smaller chunks for better retrieval. Common chunking approaches include:
            </Typography>
            <List dense>
              <ListItem>
                <ListItemText 
                  primary="Fixed-size Chunks"
                  secondary="Split documents into chunks of approximately equal size (e.g., 1000 tokens)"
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="Overlapping Chunks"
                  secondary="Include some overlap between chunks to maintain context (e.g., 200 token overlap)"
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="Semantic Chunks"
                  secondary="Split at natural boundaries like paragraphs or sections"
                />
              </ListItem>
            </List>

            {/* UML Components Diagram */}
            <UmlContainer elevation={2}>
              <Typography variant="subtitle1" gutterBottom>
                RAG System Components
              </Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={4}>
                  <UmlComponent>
                    <StorageIcon sx={{ fontSize: 40, color: 'primary.light' }} />
                    <Typography variant="subtitle2">Knowledge Base</Typography>
                    <UmlInterface>Vector Database</UmlInterface>
                    <UmlInterface>Document Store</UmlInterface>
                  </UmlComponent>
                </Grid>
                <Grid item xs={12} md={4}>
                  <UmlComponent>
                    <SearchIcon sx={{ fontSize: 40, color: 'primary.light' }} />
                    <Typography variant="subtitle2">Retriever</Typography>
                    <UmlInterface>Embedding Model</UmlInterface>
                    <UmlInterface>Similarity Search</UmlInterface>
                  </UmlComponent>
                </Grid>
                <Grid item xs={12} md={4}>
                  <UmlComponent>
                    <PsychologyIcon sx={{ fontSize: 40, color: 'primary.light' }} />
                    <Typography variant="subtitle2">LLM</Typography>
                    <UmlInterface>Text Generation</UmlInterface>
                    <UmlInterface>Context Processing</UmlInterface>
                  </UmlComponent>
                </Grid>
              </Grid>
            </UmlContainer>
          </AccordionDetails>
        </Accordion>

        {/* How RAG Works Section */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">
              <AutoGraphIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              How RAG Works
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body1" paragraph>
              The RAG process follows these main steps:
            </Typography>

            <List>
              <ListItem>
                <ListItemIcon>
                  <StorageIcon color="primary" />
                </ListItemIcon>
                <ListItemText 
                  primary="1. Document Processing"
                  secondary="Documents are processed, chunked, and stored in a vector database"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <SearchIcon color="primary" />
                </ListItemIcon>
                <ListItemText 
                  primary="2. Query Processing"
                  secondary="User query is converted into embeddings using the same model"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <CompareIcon color="primary" />
                </ListItemIcon>
                <ListItemText 
                  primary="3. Retrieval"
                  secondary="Most relevant documents are retrieved using similarity search"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <PsychologyIcon color="primary" />
                </ListItemIcon>
                <ListItemText 
                  primary="4. Generation"
                  secondary="LLM generates response using retrieved context and query"
                />
              </ListItem>
            </List>

            {/* UML Process Flow Diagram */}
            <UmlContainer elevation={2}>
              <Typography variant="subtitle1" gutterBottom>
                RAG Process Flow
              </Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={3}>
                  <UmlComponent>
                    <Typography variant="subtitle2">Input Query</Typography>
                    <UmlInterface>User Question</UmlInterface>
                  </UmlComponent>
                </Grid>
                <UmlArrow item xs={12} md={1} />
                <Grid item xs={12} md={3}>
                  <UmlComponent>
                    <Typography variant="subtitle2">Retrieve Context</Typography>
                    <UmlInterface>Vector Search</UmlInterface>
                    <UmlInterface>Similarity Matching</UmlInterface>
                  </UmlComponent>
                </Grid>
                <UmlArrow item xs={12} md={1} />
                <Grid item xs={12} md={3}>
                  <UmlComponent>
                    <Typography variant="subtitle2">Generate Response</Typography>
                    <UmlInterface>Context Integration</UmlInterface>
                    <UmlInterface>Text Generation</UmlInterface>
                  </UmlComponent>
                </Grid>
              </Grid>
            </UmlContainer>
          </AccordionDetails>
        </Accordion>

        {/* Benefits Section */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">
              <AutoGraphIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Benefits of RAG
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <List>
              <ListItem>
                <ListItemText 
                  primary="More Accurate Responses"
                  secondary="RAG provides up-to-date and relevant information from your knowledge base"
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="Reduced Hallucination"
                  secondary="LLMs are less likely to make up information when given relevant context"
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="Knowledge Control"
                  secondary="You can control what information the system has access to"
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="Cost Effective"
                  secondary="RAG can reduce the need for fine-tuning large models"
                />
              </ListItem>
            </List>
          </AccordionDetails>
        </Accordion>

        {/* Best Practices Section */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">
              <AutoGraphIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Best Practices
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <List>
              <ListItem>
                <ListItemText 
                  primary="Quality Documents"
                  secondary="Ensure your knowledge base contains high-quality, relevant documents"
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="Chunking Strategy"
                  secondary="Break documents into appropriate-sized chunks for better retrieval"
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="Embedding Quality"
                  secondary="Use high-quality embeddings for better semantic search"
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="Context Window"
                  secondary="Provide enough context to the LLM without exceeding its limits"
                />
              </ListItem>
            </List>
          </AccordionDetails>
        </Accordion>
      </DialogContent>
    </Dialog>
  );
};

export default RagIntroduction; 