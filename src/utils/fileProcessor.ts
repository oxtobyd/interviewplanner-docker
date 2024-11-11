import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import 'pdfjs-dist/build/pdf.worker.mjs';  // Import the worker
import mammoth from 'mammoth';

// Set up worker
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export const extractTextFromFile = async (file: File): Promise<string> => {
  console.log('Starting file extraction. File type:', file.type);
  const fileType = file.type;
  
  try {
    if (fileType === 'application/pdf') {
      console.log('Processing PDF file');
      const arrayBuffer = await file.arrayBuffer();
      console.log('PDF ArrayBuffer created');
      
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      console.log('PDF loaded, number of pages:', pdf.numPages);
      
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        console.log(`Processing page ${i}`);
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(' ');
        text += pageText + '\n';
      }
      
      console.log('Complete extracted text:', text);
      return text;
    } 
    else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }
    
    throw new Error('Unsupported file type');
  } catch (error) {
    console.error('Error extracting text from file:', error);
    throw error;
  }
};

// Base extractor function
const extractField = (text: string, fieldName: string): string => {
  const regex = new RegExp(`${fieldName}[:\\s]+(.+)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
};

export const extractName = (text: string): string => {
  console.log('Starting name extraction');
  // Look for name between "Name" and "Original"
  const namePattern = /Name\s+([^]*?)(?=\s+Original)/i;
  const match = text.match(namePattern);
  return match ? match[1].trim() : '';
};

export const extractEmail = (text: string): string => {
  // Look for email between shellydking@gmail.com specifically for candidate's email
  const match = text.match(/Contact Number:\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
  return match ? match[1].trim() : '';
};

export const extractDiocese = (text: string): string => {
  // Look for Diocese and remove the word "Diocese" from result
  const match = text.match(/Diocese\s+([^]*?)(?=\s*Sponsoring Bishop)/i);
  if (match) {
    return match[1].replace(/Diocese\s*/i, '').trim();
  }
  return '';
};

export const extractDDOName = (text: string): string => {
  // Look for name between "Contact DDO" and "email:"
  const match = text.match(/Contact DDO\s+([^]*?)(?=\s*email:)/i);
  return match ? match[1].trim() : '';
};

export const extractDDOEmail = (text: string): string => {
  const match = text.match(/email:\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
  return match ? match[1].trim() : '';
};

export const extractSponsoringBishop = (text: string): string => {
  const match = text.match(/Sponsoring Bishop\s+([^]*?)(?=\s*Contact DDO)/i);
  return match ? match[1].trim() : '';
};

export const extractQuestionToPanel = (text: string): string => {
  console.log('Starting question extraction');
  const match = text.match(/3\.\s*Question to the Panel\s*([^]*?)(?=\s*4\.\s*Training Proposal)/i);
  
  if (match && match[1]) {
    // Clean up any extra whitespace and line breaks
    return match[1]
      .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
      .trim();
  }
  
  console.log('No question to panel match found');
  return '';
};

// Helper function to split name
export const splitName = (fullName: string): { surname: string; forename: string } => {
  const parts = fullName.split(' ');
  const surname = parts.pop() || '';
  const forename = parts.join(' ');
  return { surname, forename };
};