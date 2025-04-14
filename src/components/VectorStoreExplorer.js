import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  TextField,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import InfoIcon from '@mui/icons-material/Info';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import StorageIcon from '@mui/icons-material/Storage';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { defaultModels } from '../config/llmConfig';
import VectorQualityVisualizer from './QualityAnalysisHub/ProcessingQuality/VectorQualityVisualizer';
import SimilarityDistributionVisualizer from './QualityAnalysisHub/ProcessingQuality/SimilarityDistributionVisualizer';

const VectorStoreExplorer = ({ vectorStore, documents, onVectorStoreUpload }) => {
  // State
  const [activeTab, setActiveTab] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [vectorData, setVectorData] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [selectedEmbeddingModel, setSelectedEmbeddingModel] = useState('text-embedding-3-small');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedChunk, setSelectedChunk] = useState(null);
  const [vectorStats, setVectorStats] = useState(null);
  
  // Refs
  const fileInputRef = useRef(null);

  // State for multiple file uploads - these are used in the processCombinedFiles function
  // eslint-disable-next-line no-unused-vars
  const [docStoreFile, setDocStoreFile] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [indexStoreFile, setIndexStoreFile] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [vectorStoreFile, setVectorStoreFile] = useState(null);
  const [combinedUpload, setCombinedUpload] = useState(false);

  // Get available embedding models
  const embeddingModels = Object.entries(defaultModels)
    .filter(([_, model]) => model.type === 'embedding' && model.active)
    .map(([modelId, model]) => ({
      id: modelId,
      name: model.displayName || modelId,
      description: model.description || ''
    }));

  // Handle tab change
  const handleTabChange = (event, newValue) => {
    console.log(`Tab change requested: ${newValue}`);
    // Track the last tab to save it in local storage
    localStorage.setItem('vectorExplorerLastTab', newValue.toString());
    setActiveTab(newValue);
  };

  // On component mount, check if we should restore the last tab
  useEffect(() => {
    // Always want to force the Analysis tab to be visible and accessible
    setActiveTab(2);
    // Save this preference to localStorage
    localStorage.setItem('vectorExplorerLastTab', '2');
  }, []);

  // Add a separate delayed effect for forcing tab selection
  useEffect(() => {
    // Set a timeout to ensure the Analysis tab is selected after any other initialization
    const timer = setTimeout(() => {
      console.log("Forcing Analysis tab selection after delay");
      setActiveTab(2);
    }, 100); // Small delay to ensure it runs after other initialization
    
    return () => clearTimeout(timer);
  }, []);

  // Handle file upload click
  const handleUploadClick = () => {
    if (combinedUpload) {
      // For combined upload mode, we need to upload multiple files
      const multiFileUploadInput = document.getElementById('multi-file-upload');
      if (multiFileUploadInput) {
        multiFileUploadInput.click();
      } else {
        console.error("Could not find multi-file upload input element");
        setError("UI error: Could not find file upload control");
      }
    } else {
      fileInputRef.current.click();
    }
  };

  // Handle single file upload
  const handleSingleFileChange = (event) => {
    if (!event.target.files || event.target.files.length === 0) {
      setError("No file selected");
      return;
    }
    
    const file = event.target.files[0];
    setIsLoading(true);
    console.log(`Processing file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = JSON.parse(e.target.result);
        console.log("Parsed single file as JSON, analyzing structure...");
        
        // Create fileContents object with the same file as both docStore and vectorStore
        // Our parseLangChainFiles function will try to extract the right data
        const fileContents = {
          docStore: content,
          vectorStore: content
        };
        
        parseLangChainFiles(fileContents);
      } catch (error) {
        console.error("Error parsing single file:", error);
        setError(`Failed to parse file: ${error.message}`);
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      setError("Failed to read file");
      setIsLoading(false);
    };
    reader.readAsText(file);
  };

  // Handle multiple file uploads
  const handleMultipleFileChange = (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    setError(null);
    setIsLoading(true);
    console.log(`Processing ${files.length} files`);

    // If only one file is uploaded, use the single file handler
    if (files.length === 1) {
      handleSingleFileChange(event);
      return;
    }

    // For multiple files, we need to identify the different store types
    let docStoreFile = null;
    let vectorStoreFile = null;
    let indexStoreFile = null;

    // First try to identify files by name
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = file.name.toLowerCase();
      
      if (fileName.includes('doc_store') || fileName.includes('docstore')) {
        docStoreFile = file;
      } else if (fileName.includes('vector_store') || fileName.includes('vectorstore')) {
        vectorStoreFile = file;
      } else if (fileName.includes('index_store') || fileName.includes('indexstore')) {
        indexStoreFile = file;
      }
    }

    // If we couldn't identify all files by name, try to read their contents
    if (!docStoreFile || !vectorStoreFile) {
      const fileContents = {};
      let filesRead = 0;
      const totalFiles = files.length;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        
        reader.onload = (e) => {
          try {
            const content = JSON.parse(e.target.result);
            
            // Try to identify the file type by its content
            if (!docStoreFile && (content.docstore || content._dict || content.dict)) {
              fileContents.docStore = content;
              docStoreFile = file;
            } else if (!vectorStoreFile && (content.vectors || content.embeddings)) {
              fileContents.vectorStore = content;
              vectorStoreFile = file;
            } else if (!indexStoreFile && content.index_to_docstore_id) {
              fileContents.indexStore = content;
              indexStoreFile = file;
            }
            
            filesRead++;
            
            // When all files are read, proceed if we have the minimum required files
            if (filesRead === totalFiles) {
              processCombinedFiles(docStoreFile, vectorStoreFile, indexStoreFile, fileContents);
            }
          } catch (error) {
            console.error(`Error parsing file ${file.name}:`, error);
            setError(`Failed to parse file ${file.name}: ${error.message}`);
            setIsLoading(false);
          }
        };
        
        reader.onerror = () => {
          setError(`Failed to read file ${file.name}`);
          setIsLoading(false);
        };
        
        reader.readAsText(file);
      }
    } else {
      // If we identified all needed files by name, process them
      processCombinedFiles(docStoreFile, vectorStoreFile, indexStoreFile);
    }
  };
  
  const processCombinedFiles = (docStoreFile, vectorStoreFile, indexStoreFile, preloadedContents = {}) => {
    if (!docStoreFile || !vectorStoreFile) {
      setError("Could not identify all required files. Need at least document store and vector store files.");
      setIsLoading(false);
      return;
    }

    const fileContents = { ...preloadedContents };
    let filesRead = 0;
    const totalFiles = indexStoreFile ? 3 : 2;
    
    // Read document store
    const docStoreReader = new FileReader();
    docStoreReader.onload = (e) => {
      try {
        fileContents.docStore = JSON.parse(e.target.result);
        filesRead++;
        if (filesRead === totalFiles) {
          parseLangChainFiles(fileContents);
        }
      } catch (error) {
        console.error("Error parsing document store file:", error);
        setError(`Failed to parse document store file: ${error.message}`);
        setIsLoading(false);
      }
    };
    docStoreReader.onerror = () => {
      setError("Failed to read document store file");
      setIsLoading(false);
    };
    docStoreReader.readAsText(docStoreFile);
    
    // Read vector store
    const vectorStoreReader = new FileReader();
    vectorStoreReader.onload = (e) => {
      try {
        fileContents.vectorStore = JSON.parse(e.target.result);
        filesRead++;
        if (filesRead === totalFiles) {
          parseLangChainFiles(fileContents);
        }
      } catch (error) {
        console.error("Error parsing vector store file:", error);
        setError(`Failed to parse vector store file: ${error.message}`);
        setIsLoading(false);
      }
    };
    vectorStoreReader.onerror = () => {
      setError("Failed to read vector store file");
      setIsLoading(false);
    };
    vectorStoreReader.readAsText(vectorStoreFile);
    
    // Read index store if available
    if (indexStoreFile) {
      const indexStoreReader = new FileReader();
      indexStoreReader.onload = (e) => {
        try {
          fileContents.indexStore = JSON.parse(e.target.result);
          filesRead++;
          if (filesRead === totalFiles) {
            parseLangChainFiles(fileContents);
          }
        } catch (error) {
          console.error("Error parsing index store file:", error);
          setError(`Failed to parse index store file: ${error.message}`);
          setIsLoading(false);
        }
      };
      indexStoreReader.onerror = () => {
        setError("Failed to read index store file");
        setIsLoading(false);
      };
      indexStoreReader.readAsText(indexStoreFile);
    }
  };

  // Parse files from LangChain format
  const parseLangChainFiles = (fileContents) => {
    console.log("Parsing LangChain files...");
    
    try {
      const { docStore, indexStore, vectorStore } = fileContents;
      
      console.log("Document store structure:", docStore);
      console.log("Vector store structure:", vectorStore);
      if (indexStore) console.log("Index store structure:", indexStore);
      
      // DOCUMENT STORE PARSING
      let documents = [];
      const getDocuments = () => {
        // Try different document store structures
        if (docStore._dict) {
          console.log("Found documents in docStore._dict");
          return Object.values(docStore._dict);
        } else if (docStore.dict) {
          console.log("Found documents in docStore.dict");
          return Object.values(docStore.dict);
        } else if (docStore.docstore?._dict) {
          console.log("Found documents in docStore.docstore._dict");
          return Object.values(docStore.docstore._dict);
        } else if (docStore.docstore?.dict) {
          console.log("Found documents in docStore.docstore.dict");
          return Object.values(docStore.docstore.dict);
        } else if (docStore["docstore/data"]) {
          console.log("Found documents in docStore[docstore/data]");
          // Check if the values are direct documents or need further processing
          const values = Object.values(docStore["docstore/data"]);
          if (values.length > 0) {
            // For nested objects, we need additional extraction
            if (typeof values[0] === 'object' && 'source' in values[0] && !('page_content' in values[0]) && !('content' in values[0])) {
              console.log("Nested document structure detected, extracting content");
              return values.map(item => {
                // Try to find content in common structures
                if (item.text) return { ...item, page_content: item.text };
                if (item.content) return { ...item, page_content: item.content };
                // If no direct content field, use the whole object as content
                return { ...item, page_content: JSON.stringify(item) };
              });
            }
            return values;
          }
          return [];
        } else if (docStore._docs) {
          console.log("Found documents in docStore._docs");
          return Object.values(docStore._docs);
        } else if (docStore.docs) {
          console.log("Found documents in docStore.docs");
          return Object.values(docStore.docs);
        } else {
          // Last resort: check if docStore looks like a map of documents directly
          const firstKey = Object.keys(docStore)[0];
          if (firstKey && typeof docStore[firstKey] === 'object' && docStore[firstKey].page_content) {
            console.log("Found documents directly in docStore");
            return Object.values(docStore);
          }
          console.warn("Could not find documents in expected structures");
          return [];
        }
      };
      
      documents = getDocuments();
      
      if (!documents || documents.length === 0) {
        console.error("No documents found in document store");
        throw new Error("No documents found in the document store file");
      }
      
      console.log(`Found ${documents.length} documents`);
      
      // Clean up document objects
      documents = documents.map(doc => {
        try {
          // Handle different document structures
          if (typeof doc === 'object') {
            if (doc.page_content !== undefined) {
              return {
                id: doc.id || doc.doc_id || `doc_${Math.random().toString(36).substr(2, 9)}`,
                content: doc.page_content,
                metadata: doc.metadata || {}
              };
            } else if (doc.text !== undefined) {
              return {
                id: doc.id || doc.doc_id || `doc_${Math.random().toString(36).substr(2, 9)}`,
                content: doc.text,
                metadata: doc.metadata || {}
              };
            } else if (doc.content !== undefined) {
              return {
                id: doc.id || doc.doc_id || `doc_${Math.random().toString(36).substr(2, 9)}`,
                content: doc.content,
                metadata: doc.metadata || {}
              };
            }
          }
          
          console.warn("Document has unexpected structure:", doc);
          return {
            id: `doc_${Math.random().toString(36).substr(2, 9)}`,
            content: JSON.stringify(doc),
            metadata: {}
          };
        } catch (error) {
          console.error("Error processing document:", error, doc);
          return {
            id: `doc_${Math.random().toString(36).substr(2, 9)}`,
            content: `[Error processing document: ${error.message}]`,
            metadata: {}
          };
        }
      });
      
      // VECTOR STORE PARSING
      let vectors = [];
      const getVectors = () => {
        // Try different vector store structures
        if (vectorStore._dict) {
          console.log("Found vectors in vectorStore._dict");
          return Object.entries(vectorStore._dict).map(([id, vec]) => ({id, vector: vec}));
        } else if (vectorStore.dict) {
          console.log("Found vectors in vectorStore.dict");
          return Object.entries(vectorStore.dict).map(([id, vec]) => ({id, vector: vec}));
        } else if (vectorStore.embeddingDict) {
          console.log("Found vectors in vectorStore.embeddingDict");
          return Object.entries(vectorStore.embeddingDict).map(([id, vec]) => ({id, vector: vec}));
        } else if (vectorStore._vectors) {
          console.log("Found vectors in vectorStore._vectors");
          return Object.entries(vectorStore._vectors).map(([id, vec]) => ({id, vector: vec}));
        } else if (vectorStore.vectors) {
          console.log("Found vectors in vectorStore.vectors");
          return Object.entries(vectorStore.vectors).map(([id, vec]) => ({id, vector: vec}));
        } else if (vectorStore.index?._storage?.data?._vectors) {
          console.log("Found vectors in vectorStore.index._storage.data._vectors");
          return Object.entries(vectorStore.index._storage.data._vectors).map(([id, vec]) => ({id, vector: vec}));
        } else {
          // Last resort: check if vectorStore looks like a map of vectors directly
          const firstKey = Object.keys(vectorStore)[0];
          if (firstKey && Array.isArray(vectorStore[firstKey]) && vectorStore[firstKey].every(n => typeof n === 'number')) {
            console.log("Found vectors directly in vectorStore");
            return Object.entries(vectorStore).map(([id, vec]) => ({id, vector: vec}));
          }
          console.warn("Could not find vectors in expected structures");
          return [];
        }
      };
      
      vectors = getVectors();
      
      if (!vectors || vectors.length === 0) {
        console.error("No vectors found in vector store");
        throw new Error("No vectors found in the vector store file");
      }
      
      console.log(`Found ${vectors.length} vectors`);
      
      // Clean up vectors and match to documents
      const vectorData = [];
      
      for (const {id, vector} of vectors) {
        if (!Array.isArray(vector)) {
          console.warn(`Vector for ID ${id} is not an array:`, vector);
          continue;
        }
        
        // Try to find a matching document
        let docIndex = -1;
        
        // First try direct ID matching
        docIndex = documents.findIndex(doc => doc.id === id);
        
        // If no match, check if we have textIdToRefDocId mapping
        if (docIndex === -1 && vectorStore.textIdToRefDocId && vectorStore.textIdToRefDocId[id]) {
          const refDocId = vectorStore.textIdToRefDocId[id];
          console.log(`Using textIdToRefDocId mapping: ${id} → ${refDocId}`);
          // Try exact match
          docIndex = documents.findIndex(doc => doc.id === refDocId);
          
          // If still no match, try looking in metadata
          if (docIndex === -1) {
            docIndex = documents.findIndex(doc => 
              doc.metadata && (
                doc.metadata.source === refDocId || 
                doc.metadata.path === refDocId ||
                doc.metadata.filename === refDocId
              )
            );
            if (docIndex !== -1) {
              console.log(`Found document with matching filename in metadata: ${refDocId}`);
            }
          }
        }
        
        // Try filename matching as a last resort
        if (docIndex === -1 && id && typeof id === 'string' && id.includes('.')) {
          // This looks like a filename, try to match against metadata
          const possibleFilename = id.split('/').pop(); // Get just the filename part
          docIndex = documents.findIndex(doc => 
            doc.metadata && (
              doc.metadata.source === possibleFilename ||
              doc.metadata.path === possibleFilename ||
              doc.metadata.filename === possibleFilename ||
              (doc.metadata.source && doc.metadata.source.endsWith(possibleFilename))
            )
          );
          if (docIndex !== -1) {
            console.log(`Found document with matching filename: ${possibleFilename}`);
          }
        }
        
        if (docIndex === -1) {
          console.warn(`No document found for vector ID ${id}`);
          // Create placeholder document if needed
          vectorData.push({
            id,
            content: `[No matching document for ID: ${id}]`,
            metadata: {},
            vector
          });
        } else {
          vectorData.push({
            ...documents[docIndex],
            vector
          });
        }
      }
      
      if (vectorData.length === 0) {
        throw new Error("Failed to match vectors with documents");
      }
      
      console.log(`Successfully prepared ${vectorData.length} vector entries`);
      
      // Update state with parsed data
      setVectorData({
        format: 'langchain',
        vectors: vectorData,
        metadata: {},
        raw: fileContents,
        detectionReason: 'Successfully detected LangChain FAISS vector store format'
      });
      
      setVectorStats(calculateVectorStats(vectorData));
    } catch (error) {
      console.error("Error parsing LangChain files:", error);
      setError(`Invalid LangChain format: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle file change with more detailed feedback
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setUploadedFile(file);
    setError(null);
    setIsLoading(true);
    
    // Update UI with file info immediately
    console.log(`Processing file: ${file.name} (${(file.size/1024).toFixed(2)} KB)`);
    
    // Read file - adjusted for file type
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // Parse the vector store file
        const fileContent = e.target.result;
        console.log(`File loaded, content length: ${fileContent.length} characters`);
        
        if (file.name.endsWith('.json')) {
          parseVectorStore(fileContent);
        } else if (file.name.endsWith('.bin') || file.name.endsWith('.faiss')) {
          // Handle binary files differently
          setError("Binary file formats are not supported in this demo version. Please use JSON exports.");
          setIsLoading(false);
        } else {
          // Try parsing as JSON anyway
          parseVectorStore(fileContent);
        }
      } catch (err) {
        console.error("Error parsing file:", err);
        setError(`Failed to parse vector store: ${err.message}`);
        setIsLoading(false);
      }
    };
    reader.onerror = (error) => {
      console.error("File reading error:", error);
      setError(`Failed to read the file: ${error}`);
      setIsLoading(false);
    };
    
    // For binary files use readAsArrayBuffer, for text files use readAsText
    if (file.name.endsWith('.bin') || file.name.endsWith('.faiss')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  // Parse vector store
  const parseVectorStore = (fileContent) => {
    setIsLoading(true);
    
    try {
      // Try to parse as JSON
      const parsedData = JSON.parse(fileContent);
      console.log("Successfully parsed JSON:", parsedData);
      
      // Detect vector store format
      let vectorFormat = 'unknown';
      let extractedVectors = [];
      let formatDetectionReason = '';
      
      // Check if it's a FAISS export
      if (parsedData.vectors || parsedData.embeddings) {
        vectorFormat = 'faiss';
        extractedVectors = parsedData.vectors || parsedData.embeddings || [];
        formatDetectionReason = `Detected FAISS format (found ${extractedVectors.length} vectors)`;
      } 
      // Check if it's a Chroma export
      else if (parsedData.collections) {
        vectorFormat = 'chroma';
        // Extract vectors from Chroma format
        extractedVectors = parsedData.collections.flatMap(collection => 
          collection.embeddings || []
        );
        formatDetectionReason = `Detected Chroma format (found ${parsedData.collections.length} collections with ${extractedVectors.length} total vectors)`;
      }
      // Check if it's a LangChain vectorstore export
      else if (parsedData.docstore && parsedData.docstore.docs) {
        vectorFormat = 'langchain';
        // This format typically doesn't include the vectors themselves but has the documents
        formatDetectionReason = `Detected LangChain format (found ${Object.keys(parsedData.docstore.docs).length} documents)`;
        
        // Create placeholder vectors for the documents
        const docs = Object.values(parsedData.docstore.docs);
        extractedVectors = docs.map((_, i) => Array(1536).fill(0)); // Placeholder vectors
        
        // Set a specific flag to handle this format differently
        parsedData.isLangChainFormat = true;
      }
      // Check if it's basic embeddings array
      else if (Array.isArray(parsedData) && parsedData.length > 0 && Array.isArray(parsedData[0])) {
        vectorFormat = 'raw';
        extractedVectors = parsedData;
        formatDetectionReason = `Detected raw embeddings array (found ${extractedVectors.length} vectors)`;
      }
      // Check if it's a JSON containing embeddings at some nested level
      else {
        // Try to find arrays that might be embeddings in the JSON structure
        const potentialEmbeddings = findArraysInObject(parsedData);
        if (potentialEmbeddings.length > 0) {
          // Find the array that most looks like embeddings (arrays of numbers)
          const embeddings = potentialEmbeddings.find(arr => 
            arr.length > 0 && Array.isArray(arr[0]) && typeof arr[0][0] === 'number'
          );
          
          if (embeddings) {
            vectorFormat = 'detected';
            extractedVectors = embeddings;
            formatDetectionReason = `Found embedding-like arrays in JSON (${embeddings.length} potential vectors)`;
          }
        }
        
        if (vectorFormat === 'unknown') {
          formatDetectionReason = "Could not identify vector format automatically. Please ensure this is a valid vector store export.";
        }
      }
      
      console.log(formatDetectionReason);
      
      // If no vectors were found or format is unknown
      if ((extractedVectors.length === 0 || vectorFormat === 'unknown') && !parsedData.isLangChainFormat) {
        console.log("No vectors found or unknown format");
        // Try to dig deeper into the JSON structure to find potential vector arrays
        const arrayPaths = findAllArrayPaths(parsedData);
        console.log("Potential array paths:", arrayPaths);
        
        if (arrayPaths.length > 0) {
          setError(`No vectors detected automatically. Found ${arrayPaths.length} potential array fields in the JSON. Please check the console for details.`);
        } else {
          setError(`No vector data found in the uploaded file. Please ensure this is a valid vector store export.`);
        }
        setIsLoading(false);
        return;
      }
      
      // Extract metadata and text from the vectors
      const processedVectors = processVectors(extractedVectors, vectorFormat, parsedData);
      
      // Calculate vector statistics
      const stats = calculateVectorStats(processedVectors);
      
      // Update state with the processed data
      setVectorData({
        format: vectorFormat,
        vectors: processedVectors,
        metadata: parsedData.metadata || {},
        raw: parsedData,
        detectionReason: formatDetectionReason
      });
      
      setVectorStats(stats);
      setIsLoading(false);
      
      // If onVectorStoreUpload callback is provided, call it with the processed data
      if (onVectorStoreUpload) {
        onVectorStoreUpload({
          format: vectorFormat,
          vectors: processedVectors,
          metadata: parsedData.metadata || {}
        });
      }
    } catch (err) {
      console.error("Error parsing vector store:", err);
      setError(`Failed to parse vector store: ${err.message}`);
      setIsLoading(false);
    }
  };

  // Helper function to find arrays in a nested object that might be embeddings
  const findArraysInObject = (obj, maxDepth = 3, currentDepth = 0) => {
    if (currentDepth > maxDepth) return [];
    if (!obj || typeof obj !== 'object') return [];
    
    let arrays = [];
    
    // If it's an array of arrays, it might be embeddings
    if (Array.isArray(obj) && obj.length > 0 && Array.isArray(obj[0])) {
      arrays.push(obj);
    }
    
    // Recurse into object properties
    if (typeof obj === 'object' && !Array.isArray(obj)) {
      for (const key in obj) {
        const nestedArrays = findArraysInObject(obj[key], maxDepth, currentDepth + 1);
        arrays = arrays.concat(nestedArrays);
      }
    }
    
    return arrays;
  };
  
  // Helper function to find all paths to arrays in a nested object
  const findAllArrayPaths = (obj, path = '', result = []) => {
    if (!obj || typeof obj !== 'object') return result;
    
    if (Array.isArray(obj) && obj.length > 0) {
      result.push({
        path: path || 'root',
        length: obj.length,
        sample: JSON.stringify(obj[0]).substring(0, 100) + (JSON.stringify(obj[0]).length > 100 ? '...' : '')
      });
    }
    
    if (typeof obj === 'object') {
      for (const key in obj) {
        findAllArrayPaths(obj[key], path ? `${path}.${key}` : key, result);
      }
    }
    
    return result;
  };

  // Process vectors based on format
  const processVectors = (vectors, format, rawData) => {
    if (!vectors || vectors.length === 0) {
      return format === 'langchain' && rawData.isLangChainFormat 
        ? processLangChainFormat(rawData) 
        : [];
    }
    
    switch (format) {
      case 'faiss':
        return vectors.map((vector, index) => ({
          id: index,
          vector: Array.isArray(vector) ? vector : null,
          metadata: (rawData.metadatas && rawData.metadatas[index]) || {},
          text: (rawData.documents && rawData.documents[index]) || 'No text available'
        }));
        
      case 'chroma':
        return vectors.map((vector, index) => ({
          id: rawData.ids ? rawData.ids[index] : index,
          vector: vector,
          metadata: (rawData.metadatas && rawData.metadatas[index]) || {},
          text: (rawData.documents && rawData.documents[index]) || 'No text available'
        }));
      
      case 'langchain':
        return processLangChainFormat(rawData);
        
      case 'detected':
        // For auto-detected formats, try to find corresponding document data
        return vectors.map((vector, index) => {
          let text = 'No text available';
          let metadata = {};
          
          // Try to find text and metadata in the rawData structure
          if (rawData.docs || rawData.documents) {
            const docs = rawData.docs || rawData.documents;
            if (Array.isArray(docs) && index < docs.length) {
              const doc = docs[index];
              if (typeof doc === 'string') {
                text = doc;
              } else if (doc && typeof doc === 'object') {
                text = doc.text || doc.content || doc.pageContent || JSON.stringify(doc);
                metadata = doc.metadata || {};
              }
            }
          }
          
          return {
            id: index,
            vector: vector,
            metadata: metadata,
            text: text
          };
        });
        
      case 'raw':
        return vectors.map((vector, index) => ({
          id: index,
          vector: vector,
          metadata: {},
          text: `Vector ${index + 1}`
        }));
        
      default:
        return vectors.map((vector, index) => ({
          id: index,
          vector: vector,
          metadata: {},
          text: `Vector ${index + 1}`
        }));
    }
  };
  
  // Process LangChain format which has a different structure
  const processLangChainFormat = (rawData) => {
    if (!rawData.docstore || !rawData.docstore.docs) {
      return [];
    }
    
    // Extract documents from docstore
    const docs = Object.entries(rawData.docstore.docs);
    
    return docs.map(([id, doc], index) => {
      let text = 'No text available';
      let metadata = {};
      
      if (typeof doc === 'string') {
        text = doc;
      } else if (doc && typeof doc === 'object') {
        // Handle standard LangChain document format
        text = doc.pageContent || doc.text || doc.content || 'No text available';
        metadata = doc.metadata || {};
      }
      
      return {
        id: id,
        // Create a mock vector since LangChain exports often don't include vectors
        vector: Array(1536).fill(0.0001 * index), // Just for visualization
        metadata: metadata,
        text: text
      };
    });
  };

  // Calculate vector statistics
  const calculateVectorStats = (vectors) => {
    if (!vectors || vectors.length === 0) return null;
    
    // Get first vector with actual vector data
    const sampleVector = vectors.find(v => v.vector && Array.isArray(v.vector));
    
    // If no actual vector data is found (like in LangChain format sometimes)
    if (!sampleVector) {
      console.log("No sample vector with actual data found, returning basic stats");
      return {
        count: vectors.length,
        dimensions: 'Unknown',
        avgMagnitude: 'N/A',
        validVectors: 0,
      };
    }
    
    const dimensions = sampleVector.vector.length;
    
    // Calculate average magnitude
    let totalMagnitude = 0;
    let validVectors = 0;
    
    vectors.forEach(v => {
      if (v.vector && Array.isArray(v.vector) && v.vector.length > 0) {
        try {
          const magnitude = Math.sqrt(v.vector.reduce((sum, val) => {
            const num = Number(val);
            return sum + (isNaN(num) ? 0 : num * num);
          }, 0));
          
          if (!isNaN(magnitude)) {
            totalMagnitude += magnitude;
            validVectors++;
          }
        } catch (err) {
          console.warn("Error calculating magnitude for vector:", err);
        }
      }
    });
    
    const avgMagnitude = validVectors > 0 ? totalMagnitude / validVectors : 0;
    
    return {
      count: vectors.length,
      dimensions,
      avgMagnitude: avgMagnitude.toFixed(4),
      validVectors,
    };
  };

  // Handle search
  const handleSearch = () => {
    if (!searchQuery.trim() || !vectorData) return;
    
    setIsSearching(true);
    setError(null);
    
    // Simulate semantic search with basic text matching for demo
    // In a real implementation, this would perform semantic search using the embedding model
    setTimeout(() => {
      try {
        const results = vectorData.vectors
          .filter(v => {
            const text = v.text || '';
            const metadata = v.metadata ? JSON.stringify(v.metadata) : '';
            return text.toLowerCase().includes(searchQuery.toLowerCase()) ||
                   metadata.toLowerCase().includes(searchQuery.toLowerCase());
          })
          .slice(0, 10);
        
        setSearchResults(results);
        setIsSearching(false);
      } catch (err) {
        setError(`Search failed: ${err.message}`);
        setIsSearching(false);
      }
    }, 1000);
  };

  // Handle chunk selection
  const handleChunkSelect = (chunk) => {
    setSelectedChunk(chunk);
  };

  // Use existing vector store if available
  useEffect(() => {
    if (vectorStore && !vectorData) {
      // Extract data from existing vector store
      // This is a placeholder and should be adapted to your actual vector store structure
      try {
        if (typeof vectorStore.getDocuments === 'function') {
          console.log("Attempting to extract documents from vector store...");
          vectorStore.getDocuments().then(docs => {
            if (docs && docs.length > 0) {
              console.log(`Successfully extracted ${docs.length} documents from vector store`);
              const extractedVectors = docs.map((doc, index) => ({
                id: doc.id || index,
                vector: doc.vector || null,
                metadata: doc.metadata || {},
                text: doc.pageContent || doc.text || 'No text available'
              }));
              
              setVectorData({
                format: 'langchain',
                vectors: extractedVectors,
                metadata: {},
                raw: vectorStore
              });
              
              setVectorStats(calculateVectorStats(extractedVectors));
            } else {
              console.log("No documents found in vector store or unsupported format");
            }
          });
        } else {
          console.log("Vector store doesn't have getDocuments method, trying alternative approach");
          // Alternative approach for other vector store types
          if (vectorStore.index && vectorStore.docstore) {
            console.log("Found vector store with index and docstore - likely a FAISS store");
            // This is typical for FAISS stores
            setVectorData({
              format: 'detected-faiss',
              vectors: [],
              metadata: {},
              raw: vectorStore
            });
          }
        }
      } catch (error) {
        console.error("Failed to extract data from existing vector store:", error);
        setError(`Could not process existing vector store: ${error.message}`);
      }
    }
  }, [vectorStore, vectorData]);

  // Tab content - Upload
  const renderUploadTab = () => (
    <Box sx={{ mt: 2 }}>
      {!vectorStore && (
        <Alert severity="info" sx={{ mb: 3 }}>
          You can upload a vector store file to explore, or use the existing vector store if you've already configured one.
        </Alert>
      )}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper elevation={0} variant="outlined" sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Upload Vector Store
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Upload a vector store file to explore its contents. Supported formats include 
              FAISS, Chroma, and raw embedding arrays.
            </Typography>
            
            <Box sx={{ mb: 3 }}>
              <FormControl component="fieldset">
                <Typography variant="subtitle2" gutterBottom>
                  Upload Format:
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button 
                    variant={!combinedUpload ? "contained" : "outlined"}
                    size="small"
                    onClick={() => setCombinedUpload(false)}
                  >
                    Single File
                  </Button>
                  <Button 
                    variant={combinedUpload ? "contained" : "outlined"}
                    size="small"
                    onClick={() => setCombinedUpload(true)}
                  >
                    LangChain Files
                  </Button>
                </Box>
              </FormControl>
            </Box>
            
            {!combinedUpload ? (
              // Single file upload UI
              <Box 
                sx={{ 
                  border: '2px dashed #ccc', 
                  borderRadius: 2, 
                  p: 3, 
                  textAlign: 'center',
                  mb: 3
                }}
              >
                <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                <Typography variant="body1" gutterBottom>
                  Drag and drop your vector store file or
                </Typography>
                <Button 
                  variant="contained" 
                  startIcon={<FileUploadIcon />}
                  onClick={handleUploadClick}
                >
                  Browse Files
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".json,.bin,.faiss,.chroma,.index"
                  style={{ display: 'none' }}
                />
                
                {uploadedFile && (
                  <Typography variant="body2" sx={{ mt: 2, color: 'success.main' }}>
                    File selected: {uploadedFile.name} ({(uploadedFile.size/1024).toFixed(2)} KB)
                  </Typography>
                )}
              </Box>
            ) : (
              // Multi-file upload UI for LangChain format
              <Box 
                sx={{ 
                  border: '2px dashed #ccc', 
                  borderRadius: 2, 
                  p: 3, 
                  textAlign: 'center',
                  mb: 3
                }}
              >
                <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                <Typography variant="body1" gutterBottom>
                  Upload LangChain Vector Store Files
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Select both doc_store.json and vector_store.json files (index_store.json is optional)
                </Typography>
                
                <Typography variant="caption" display="block" color="info.main" sx={{ mb: 2 }}>
                  <b>Tip:</b> LangChain/FAISS exports can have different structures. If you're seeing errors, 
                  try inspecting your JSON files to ensure they contain document and vector data in the expected format.
                </Typography>
                
                <Button 
                  variant="contained" 
                  startIcon={<FileUploadIcon />}
                  onClick={handleUploadClick}
                >
                  Select Files
                </Button>
                <input
                  id="multi-file-upload"
                  type="file"
                  multiple
                  onChange={handleMultipleFileChange}
                  accept=".json"
                  style={{ display: 'none' }}
                />
                
                <Box sx={{ mt: 2, textAlign: 'left' }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                    <Chip 
                      label="doc_store.json" 
                      color={docStoreFile ? "success" : "default"} 
                      size="small" 
                      variant={docStoreFile ? "filled" : "outlined"}
                    />
                    {docStoreFile && (
                      <Typography variant="caption" color="text.secondary">
                        ({(docStoreFile.size/1024).toFixed(2)} KB)
                      </Typography>
                    )}
                  </Box>
                  
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                    <Chip 
                      label="vector_store.json" 
                      color={vectorStoreFile ? "success" : "default"} 
                      size="small" 
                      variant={vectorStoreFile ? "filled" : "outlined"}
                    />
                    {vectorStoreFile && (
                      <Typography variant="caption" color="text.secondary">
                        ({(vectorStoreFile.size/1024).toFixed(2)} KB)
                      </Typography>
                    )}
                  </Box>
                  
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Chip 
                      label="index_store.json" 
                      color={indexStoreFile ? "success" : "default"} 
                      size="small" 
                      variant={indexStoreFile ? "filled" : "outlined"}
                    />
                    {indexStoreFile && (
                      <Typography variant="caption" color="text.secondary">
                        (optional)
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            )}
            
            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}
            
            <FormControl fullWidth variant="outlined" size="small" sx={{ mb: 2 }}>
              <InputLabel>Embedding Model</InputLabel>
              <Select
                value={selectedEmbeddingModel}
                onChange={(e) => setSelectedEmbeddingModel(e.target.value)}
                label="Embedding Model"
              >
                {embeddingModels.map(model => (
                  <MenuItem key={model.id} value={model.id}>
                    {model.name}
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                Select the embedding model used to create these embeddings.
              </Typography>
            </FormControl>
            
            {!combinedUpload ? (
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 3 }}>
                Example JSON Format:
              </Typography>
            ) : (
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 3 }}>
                LangChain FAISS Format:
              </Typography>
            )}
            
            <Paper 
              variant="outlined" 
              sx={{ 
                p: 2, 
                maxHeight: 120, 
                overflow: 'auto', 
                bgcolor: '#f5f5f5', 
                fontSize: '0.7rem',
                fontFamily: 'monospace'
              }}
            >
              {!combinedUpload ? (
                `{
  "vectors": [
    [0.1, 0.2, 0.3, ...],
    [0.2, 0.3, 0.4, ...],
    ...
  ],
  "documents": [
    "This is the text content of document 1",
    "This is the text content of document 2",
    ...
  ],
  "metadatas": [
    {"source": "doc1.txt", "page": 1},
    {"source": "doc2.txt", "page": 1},
    ...
  ]
}`
              ) : (
                `// doc_store.json
{
  "docs": {
    "doc1": { "pageContent": "Document 1 text", "metadata": { "source": "file1.pdf" } },
    "doc2": { "pageContent": "Document 2 text", "metadata": { "source": "file2.pdf" } }
  }
}

// Alternative structures that are also supported:
{
  "docstore": {
    "docs": { ... }  // Same structure as above
  }
}

// vector_store.json
{
  "vectors": [
    [0.1, 0.2, 0.3, ...],
    [0.2, 0.3, 0.4, ...]
  ]
}

// Alternative structures that are also supported:
{
  "index": {
    "vectors": [[...], [...]]
  }
}`
              )}
            </Paper>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Paper elevation={0} variant="outlined" sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Vector Store Stats
            </Typography>
            
            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <CircularProgress sx={{ mb: 2 }} />
                  <Typography variant="body2" color="text.secondary">
                    Processing vector store...
                  </Typography>
                  {uploadedFile && (
                    <Typography variant="caption" display="block" mt={1}>
                      Processing {uploadedFile.name} ({(uploadedFile.size/1024).toFixed(2)} KB)
                    </Typography>
                  )}
                </Box>
              </Box>
            ) : vectorStats ? (
              <Box>
                <TableContainer>
                  <Table size="small">
                    <TableBody>
                      <TableRow>
                        <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                          Format
                        </TableCell>
                        <TableCell>{vectorData?.format || 'Unknown'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                          Vectors
                        </TableCell>
                        <TableCell>{vectorStats.count}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                          Dimensions
                        </TableCell>
                        <TableCell>{vectorStats.dimensions}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                          Average Magnitude
                        </TableCell>
                        <TableCell>{vectorStats.avgMagnitude}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
                
                {vectorData?.detectionReason && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    {vectorData.detectionReason}
                  </Alert>
                )}
                
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Embedding Model: 
                  </Typography>
                  <Chip 
                    label={selectedEmbeddingModel} 
                    variant="outlined" 
                    size="small" 
                    sx={{ mr: 1 }}
                  />
                </Box>
                
                {uploadedFile && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Source File:
                    </Typography>
                    <Chip 
                      label={`${uploadedFile.name} (${(uploadedFile.size/1024).toFixed(2)} KB)`}
                      variant="outlined"
                      size="small"
                      color="success"
                    />
                  </Box>
                )}
                
                <Box sx={{ mt: 3 }}>
                  <Button 
                    variant="outlined"
                    color="primary"
                    size="small"
                    onClick={() => setActiveTab(1)}
                    disabled={!vectorData?.vectors?.length}
                  >
                    Explore Vectors ({vectorData?.vectors?.length || 0})
                  </Button>
                </Box>
              </Box>
            ) : (
              <Alert severity="info" sx={{ mt: 2 }}>
                Upload a vector store file to see statistics.
              </Alert>
            )}
            
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );

  // Tab content - Explore
  const renderExploreTab = () => (
    <Box sx={{ mt: 2 }}>
      {!vectorData ? (
        <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            No vector data available. Please use one of the following options:
          </Alert>
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Option 1: Upload a Vector Store File
                </Typography>
                <Typography variant="body2" paragraph>
                  Go to the Upload tab and select a vector store file in FAISS, Chroma, or raw embedding format.
                </Typography>
                <Button 
                  variant="outlined" 
                  onClick={() => setActiveTab(0)}
                  startIcon={<CloudUploadIcon />}
                >
                  Go to Upload Tab
                </Button>
              </Paper>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Option 2: Configure the Vector Store
                </Typography>
                <Typography variant="body2" paragraph>
                  If you haven't configured your vector store yet, go to the "Configure Vector Store" step in the main workflow.
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs>
                  <TextField
                    fullWidth
                    variant="outlined"
                    placeholder="Search for text or metadata in vector store..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    size="small"
                  />
                </Grid>
                <Grid item>
                  <Button
                    variant="contained"
                    startIcon={<SearchIcon />}
                    onClick={handleSearch}
                    disabled={isSearching}
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                  </Button>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Vector Chunks {searchResults.length > 0 && `(${searchResults.length} results)`}
              </Typography>
              
              {isSearching ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, mb: 3 }}>
                  <CircularProgress />
                </Box>
              ) : searchResults.length > 0 ? (
                <List sx={{ height: 400, overflow: 'auto' }}>
                  {searchResults.map((result, index) => (
                    <ListItem
                      key={result.id || index}
                      button
                      onClick={() => handleChunkSelect(result)}
                      selected={selectedChunk && selectedChunk.id === result.id}
                      sx={{
                        borderBottom: '1px solid #eee',
                        '&:hover': { bgcolor: '#f5f5f5' }
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="subtitle2" noWrap sx={{ maxWidth: '80%' }}>
                              {result.text && result.text.substring ? result.text.substring(0, 50) + '...' : 'No text available'}
                            </Typography>
                            <Tooltip title="View Details">
                              <IconButton size="small" edge="end">
                                <VisibilityIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        }
                        secondary={`ID: ${result.id}`}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : vectorData.vectors.length > 0 ? (
                <List sx={{ height: 400, overflow: 'auto' }}>
                  {vectorData.vectors.slice(0, 50).map((vec, index) => (
                    <ListItem
                      key={vec.id || index}
                      button
                      onClick={() => handleChunkSelect(vec)}
                      selected={selectedChunk && selectedChunk.id === vec.id}
                      sx={{
                        borderBottom: '1px solid #eee',
                        '&:hover': { bgcolor: '#f5f5f5' }
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="subtitle2" noWrap sx={{ maxWidth: '80%' }}>
                              {vec.text && vec.text.substring ? vec.text.substring(0, 50) + '...' : 'No text available'}
                            </Typography>
                            <Tooltip title="View Details">
                              <IconButton size="small" edge="end">
                                <VisibilityIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        }
                        secondary={`ID: ${vec.id}`}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Alert severity="info">
                  No vectors available in this vector store.
                </Alert>
              )}
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Vector Details
              </Typography>
              
              {selectedChunk ? (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    ID: {selectedChunk.id}
                  </Typography>
                  
                  <Divider sx={{ my: 1 }} />
                  
                  <Typography variant="subtitle2" gutterBottom>
                    Text Content:
                  </Typography>
                  <Paper 
                    variant="outlined" 
                    sx={{ 
                      p: 2, 
                      mb: 2, 
                      maxHeight: 150, 
                      overflow: 'auto',
                      bgcolor: '#f8f8f8'
                    }}
                  >
                    <Typography variant="body2">
                      {selectedChunk.text || selectedChunk.content || selectedChunk.pageContent || (selectedChunk.metadata && selectedChunk.metadata.text) || 'No text content available'}
                    </Typography>
                  </Paper>
                  
                  <Typography variant="subtitle2" gutterBottom>
                    Metadata:
                  </Typography>
                  <Paper 
                    variant="outlined" 
                    sx={{ 
                      p: 2, 
                      mb: 2, 
                      maxHeight: 100, 
                      overflow: 'auto',
                      bgcolor: '#f8f8f8'
                    }}
                  >
                    <pre style={{ margin: 0, fontSize: '0.75rem' }}>
                      {JSON.stringify(selectedChunk.metadata || {}, null, 2)}
                    </pre>
                  </Paper>
                  
                  <Typography variant="subtitle2" gutterBottom>
                    Vector Preview (first 10 dimensions):
                  </Typography>
                  {selectedChunk.vector ? (
                    <Box sx={{ overflowX: 'auto' }}>
                      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        {selectedChunk.vector.slice(0, 10).map((val, i) => (
                          <Chip
                            key={i}
                            label={val.toFixed(4)}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem' }}
                          />
                        ))}
                        {selectedChunk.vector.length > 10 && (
                          <Chip
                            label="..."
                            size="small"
                            variant="outlined"
                          />
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        Total dimensions: {selectedChunk.vector.length}
                      </Typography>
                    </Box>
                  ) : (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Vector data not available for this chunk.
                    </Alert>
                  )}
                </Box>
              ) : (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Select a vector chunk to view its details.
                </Alert>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );

  // Tab content - Analysis
  const renderAnalysisTab = () => (
    <Box sx={{ mt: 2 }}>
      {/* Always show a prominent callout about offline tools */}
      <Paper elevation={0} variant="outlined" sx={{ p: 2, mb: 3, bgcolor: '#f8f9fa', borderColor: 'primary.light' }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <InfoIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="subtitle1">
            Vector Analysis Tools - Available Offline
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ mt: 1 }}>
          These analysis tools are available even without uploading any documents or vector stores.
          Explore best practices, formats, and recommendations for your RAG implementation.
        </Typography>
      </Paper>

      {!vectorData ? (
        <Box>
          <Paper elevation={0} variant="outlined" sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <InfoIcon color="primary" sx={{ mr: 1 }} />
              <Typography variant="h6">Offline Vector Analysis Tools</Typography>
            </Box>
            <Typography variant="body2" paragraph>
              These tools help you analyze vector embeddings without requiring uploaded documents.
              You can still use these features even if you haven't uploaded a vector store.
            </Typography>
            
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Vector Dimensionality Analysis
                  </Typography>
                  <Typography variant="body2" paragraph>
                    Explore different embedding dimensions and their impact on performance.
                    Common dimensions include 384 (small models), 768 (medium), and 1536 (large models).
                  </Typography>
                  <FormControl fullWidth sx={{ mt: 1 }}>
                    <InputLabel>Embedding Model</InputLabel>
                    <Select
                      value={selectedEmbeddingModel}
                      onChange={(e) => setSelectedEmbeddingModel(e.target.value)}
                      label="Embedding Model"
                      size="small"
                    >
                      {embeddingModels.map(model => (
                        <MenuItem key={model.id} value={model.id}>
                          {model.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="outlined"
                    size="small"
                    sx={{ mt: 2 }}
                    onClick={() => setActiveTab(0)}
                  >
                    Upload Vector Store
                  </Button>
                </Paper>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Vector Store Formats
                  </Typography>
                  <Typography variant="body2" paragraph>
                    Learn about different vector store formats and their pros/cons.
                  </Typography>
                  
                  <List dense>
                    <ListItem>
                      <ListItemText 
                        primary="FAISS" 
                        secondary="Efficient similarity search, developed by Facebook AI" 
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText 
                        primary="Chroma" 
                        secondary="Open-source vector database for AI applications" 
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText 
                        primary="Pinecone" 
                        secondary="Cloud-native vector database with high performance" 
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText 
                        primary="Weaviate" 
                        secondary="Vector search engine and knowledge graph" 
                      />
                    </ListItem>
                  </List>
                </Paper>
              </Grid>
              
              <Grid item xs={12}>
                <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Embedding Best Practices
                  </Typography>
                  
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <List dense>
                        <ListItem>
                          <ListItemText 
                            primary="Chunk Sizing" 
                            secondary="Consider semantic coherence when chunking documents. Aim for chunks of 256-1024 tokens depending on your use case." 
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemText 
                            primary="Chunk Overlap" 
                            secondary="Use 10-20% overlap between chunks to maintain context across boundaries." 
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemText 
                            primary="Pre-processing" 
                            secondary="Clean and normalize text before embedding. Remove irrelevant content and standardize formatting." 
                          />
                        </ListItem>
                      </List>
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                      <List dense>
                        <ListItem>
                          <ListItemText 
                            primary="Metadata Enrichment" 
                            secondary="Add useful metadata to each chunk to improve retrieval relevance and filtering." 
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemText 
                            primary="Model Selection" 
                            secondary="Choose embedding models that align with your LLM. For example, use OpenAI embeddings with GPT models for best compatibility." 
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemText 
                            primary="Evaluation" 
                            secondary="Regularly test retrieval quality using diverse queries that represent real user questions." 
                          />
                        </ListItem>
                      </List>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            </Grid>
          </Paper>
          
          <Button 
            variant="contained" 
            onClick={() => setActiveTab(0)}
            startIcon={<CloudUploadIcon />}
            sx={{ mt: 2 }}
          >
            Upload Vector Store
          </Button>
        </Box>
      ) : (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Vector Quality Metrics
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                These metrics help evaluate the quality of your vector embeddings.
              </Typography>
              
              {vectorData && vectorData.vectors && vectorData.vectors.length > 0 ? (
                <VectorQualityVisualizer 
                  vectors={vectorData.vectors.map(v => v.vector).filter(v => v && Array.isArray(v))}
                  documents={vectorData.vectors}
                  stats={vectorStats}
                  embeddingModel={selectedEmbeddingModel}
                />
              ) : (
                <Alert severity="info">
                  Vector quality analysis visualization will be available in a future update.
                </Alert>
              )}
              
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Basic Stats:
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableBody>
                      <TableRow>
                        <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                          Vector Count
                        </TableCell>
                        <TableCell>{vectorStats?.count || 0}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                          Dimensionality
                        </TableCell>
                        <TableCell>{vectorStats?.dimensions || 0}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                          Avg Magnitude
                        </TableCell>
                        <TableCell>{vectorStats?.avgMagnitude || 0}</TableCell>
                      </TableRow>
                      {vectorData && (
                        <TableRow>
                          <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                            Format Detected
                          </TableCell>
                          <TableCell>{vectorData.format}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Similarity Distribution
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Analyze similarity distribution across your vector space.
              </Typography>
              
              {vectorData && vectorData.vectors && vectorData.vectors.length > 0 ? (
                <SimilarityDistributionVisualizer
                  vectors={vectorData.vectors.map(v => v.vector).filter(v => v && Array.isArray(v))}
                  documents={vectorData.vectors}
                  embeddingModel={selectedEmbeddingModel}
                />
              ) : (
                <Alert severity="info">
                  Similarity distribution visualization will be available in a future update.
                </Alert>
              )}
              
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Embedding Model:
                </Typography>
                <Chip 
                  label={selectedEmbeddingModel} 
                  variant="outlined" 
                  color="primary"
                  size="small" 
                />
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
        <StorageIcon sx={{ mr: 1 }} />
        Vector Store Explorer
        <Tooltip title="Upload and analyze vector stores to understand embedding quality and distribution.">
          <IconButton size="small" sx={{ ml: 1 }}>
            <HelpOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        
        {/* Add a direct button to Analysis tab for accessibility */}
        <Button
          variant="contained"
          color="info"
          size="small"
          startIcon={<InfoIcon />}
          onClick={() => setActiveTab(2)}
          sx={{ ml: 'auto' }}
        >
          Open Analysis Tools
        </Button>
      </Typography>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange} 
          aria-label="vector explorer tabs"
          textColor="primary"
          indicatorColor="primary"
          sx={{ '& .MuiTabs-indicator': { height: 3 } }}
        >
          <Tab label="Upload" icon={<CloudUploadIcon />} iconPosition="start" />
          <Tab 
            label="Explore" 
            icon={<SearchIcon />} 
            iconPosition="start" 
            disabled={!vectorData && !vectorStore} 
          />
          <Tab 
            label="Analysis" 
            icon={<InfoIcon />} 
            iconPosition="start"
            sx={{ bgcolor: activeTab === 2 ? 'rgba(25, 118, 210, 0.08)' : 'transparent', borderRadius: '4px 4px 0 0' }}
          />
        </Tabs>
      </Box>
      
      {/* First, always render the Document Analysis tab in a hidden div that will be shown if activeTab === 2 */}
      <Box sx={{ display: activeTab === 2 ? 'block' : 'none' }}>
        {renderAnalysisTab()}
      </Box>
      
      {/* Then render the other tabs conditionally */}
      {activeTab === 0 && renderUploadTab()}
      {activeTab === 1 && (vectorData || vectorStore) && renderExploreTab()}
    </Box>
  );
};

export default VectorStoreExplorer; 