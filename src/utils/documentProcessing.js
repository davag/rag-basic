import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import * as yaml from 'js-yaml';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

/**
 * Process a PDF file and extract its text content
 * @param {File} file - The PDF file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processPdf = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    text += pageText + ' ';
  }
  
  return text;
};

/**
 * Process a DOCX file and extract its text content
 * @param {File} file - The DOCX file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processDocx = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
};

/**
 * Process a TXT or Python file and extract its text content
 * @param {File} file - The TXT or Python file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processTxt = async (file) => {
  return await file.text();
};

/**
 * Process a Python file and extract its text content
 * @param {File} file - The Python file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processPython = async (file) => {
  const text = await file.text();
  // You could add special processing for Python files here if needed
  return text;
};

/**
 * Determine if a file is a Python file based on extension or type
 * @param {File} file - The file to check
 * @returns {boolean} - Whether the file is a Python file
 */
export const isPythonFile = (file) => {
  return file.name.endsWith('.py') || 
         file.type === 'text/x-python' || 
         file.type === 'application/x-python-code' || 
         file.type === 'text/x-python-script';
};

/**
 * Process a JSON file and extract its content
 * @param {File} file - The JSON file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processJson = async (file) => {
  const text = await file.text();
  try {
    // Parse JSON to validate it's valid JSON
    const jsonData = JSON.parse(text);
    // Convert JSON to a formatted string for better readability
    return JSON.stringify(jsonData, null, 2);
  } catch (error) {
    throw new Error(`Invalid JSON file: ${error.message}`);
  }
};

/**
 * Process a Markdown file and extract its content
 * @param {File} file - The Markdown file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processMarkdown = async (file) => {
  const text = await file.text();
  // Markdown files don't need special processing as they are already text
  // but we can validate that they contain some markdown-like content
  if (!text.includes('#') && !text.includes('*') && !text.includes('_') && !text.includes('`')) {
    console.warn(`File ${file.name} has .md extension but doesn't appear to contain markdown syntax`);
  }
  return text;
};

/**
 * Process an HTML file and extract its text content
 * @param {File} file - The HTML file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processHtml = async (file) => {
  const text = await file.text();
  // Basic HTML to text conversion - remove HTML tags
  return text.replace(/<[^>]*>/g, ' ')
             .replace(/\s+/g, ' ')
             .trim();
};

/**
 * Process a CSV/Excel file and extract its content
 * @param {File} file - The CSV/Excel file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processSpreadsheet = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer);
  
  let text = '';
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    text += `Sheet: ${sheetName}\n`;
    text += XLSX.utils.sheet_to_txt(sheet, { raw: false });
    text += '\n\n';
  });
  
  return text;
};

/**
 * Process an RTF file and extract its content
 * @param {File} file - The RTF file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processRtf = async (file) => {
  const text = await file.text();
  // Basic RTF to text conversion - remove RTF control words
  return text.replace(/\\[a-z]{1,32}(-?\d{1,10})?[ ]?/g, '')
             .replace(/\\'[0-9a-f]{2}/g, '')
             .replace(/\\[{}]/g, '')
             .replace(/\\\n/g, '\n')
             .replace(/\s+/g, ' ')
             .trim();
};

/**
 * Process an XML file and extract its content
 * @param {File} file - The XML file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processXml = async (file) => {
  const text = await file.text();
  // Basic XML to text conversion - remove XML tags
  return text.replace(/<[^>]*>/g, ' ')
             .replace(/\s+/g, ' ')
             .trim();
};

/**
 * Process a YAML file and extract its content
 * @param {File} file - The YAML file to process
 * @returns {Promise<string>} - The extracted text
 */
export const processYaml = async (file) => {
  const text = await file.text();
  try {
    // Parse YAML to validate it's valid YAML
    const yamlData = yaml.load(text);
    // Convert YAML to a formatted string for better readability
    return yaml.dump(yamlData, { indent: 2 });
  } catch (error) {
    throw new Error(`Invalid YAML file: ${error.message}`);
  }
};

/**
 * Process a file based on its type
 * @param {File} file - The file to process
 * @returns {Promise<{pageContent: string, metadata: {source: string, namespace: string}}>} - The processed document
 */
export const processFile = async (file) => {
  let text = '';
  
  // Check for file extension and MIME type mismatch
  const extension = file.name.split('.').pop().toLowerCase();
  const expectedMimeTypes = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'py': ['text/x-python', 'application/x-python-code', 'text/x-python-script', 'application/octet-stream'],
    'json': 'application/json',
    'md': 'text/markdown',
    'html': ['text/html'],
    'htm': ['text/html'],
    'csv': ['text/csv'],
    'xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    'xls': ['application/vnd.ms-excel'],
    'rtf': 'application/rtf',
    'xml': 'application/xml',
    'yml': 'text/yaml',
    'yaml': 'text/yaml',
    'txt': 'text/plain'
  };

  // Function to check if file type matches expected MIME type
  const isValidMimeType = (fileType, expectedTypes) => {
    if (Array.isArray(expectedTypes)) {
      return expectedTypes.includes(fileType) || fileType === '';
    }
    return fileType === expectedTypes || fileType === '';
  };

  // Check for potential file type mismatch
  if (expectedMimeTypes[extension]) {
    const expectedType = expectedMimeTypes[extension];
    if (!isValidMimeType(file.type, expectedType)) {
      throw new Error(
        `Possible file type mismatch for ${file.name}. ` +
        `The file has a .${extension} extension but its content type is "${file.type || 'unknown'}". ` +
        `Please verify that the file is actually a ${extension.toUpperCase()} file and not renamed from another format.`
      );
    }
  }
  
  try {
    if (file.type === 'application/pdf') {
      text = await processPdf(file);
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      text = await processDocx(file);
    } else if (isPythonFile(file)) {
      text = await processPython(file);
    } else if (file.type === 'text/plain' || file.type === '') {
      text = await processTxt(file);
    } else if (file.type === 'application/json' || file.name.endsWith('.json')) {
      text = await processJson(file);
    } else if (file.name.endsWith('.md')) {
      text = await processMarkdown(file);
    } else if (file.type === 'text/html' || file.name.endsWith('.html') || file.name.endsWith('.htm')) {
      text = await processHtml(file);
    } else if (file.type === 'text/csv' || file.name.endsWith('.csv') || 
               file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
               file.type === 'application/vnd.ms-excel' || 
               file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      text = await processSpreadsheet(file);
    } else if (file.type === 'application/rtf' || file.name.endsWith('.rtf')) {
      text = await processRtf(file);
    } else if (file.type === 'application/xml' || file.name.endsWith('.xml')) {
      text = await processXml(file);
    } else if (file.type === 'text/yaml' || file.name.endsWith('.yml') || file.name.endsWith('.yaml')) {
      text = await processYaml(file);
    } else {
      const supportedFormats = Object.keys(expectedMimeTypes).join(', ').toUpperCase();
      throw new Error(
        `Unsupported file type: ${file.type || 'unknown'} for file ${file.name}. ` +
        `Supported formats are: ${supportedFormats}`
      );
    }
  } catch (error) {
    // Enhance error message with more context
    const baseError = error.message || 'Unknown error occurred';
    throw new Error(
      `Error processing file ${file.name} (type: ${file.type || 'unknown'}): ${baseError}. ` +
      `If you're seeing unexpected errors, please verify that the file extension matches its actual content type.`
    );
  }
  
  return {
    pageContent: text,
    metadata: { 
      source: file.name,
      originalFileName: file.name,
      documentName: file.name,
      namespace: 'default', // Default namespace, will be updated by the component
      fileType: extension,
      mimeType: file.type || 'unknown'
    }
  };
}; 