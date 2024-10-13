const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

function splitName(fullName) {
  const nameParts = fullName.trim().split(/\s+/);
  if (nameParts.length === 1) return { surname: nameParts[0], forename: '' };
  const surname = nameParts.pop();
  const forename = nameParts.join(' ');
  return { surname, forename };
}

function extractField(text, fieldName) {
  const regex = new RegExp(`${fieldName}\\s*(.+)`);
  const match = text.match(regex);
  if (!match) return '';

  let value = match[1].trim();
  
  // Special handling for Diocese
  if (fieldName === 'Diocese') {
    const dioceseParts = value.split(/\s+/);
    return dioceseParts[dioceseParts.length - 1]; // Return the last word
  }

  return value;
}

function extractEmails(text) {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  return text.match(emailRegex) || [];
}

function extractEmail(text) {
  const contactDetailsRegex = /Contact Details\s*([\s\S]*?)\s*(?:\n\n|\Z)/i;
  const contactDetailsMatch = text.match(contactDetailsRegex);
  
  if (contactDetailsMatch) {
    const contactDetailsBlock = contactDetailsMatch[1];
    const emails = extractEmails(contactDetailsBlock);
    
    if (emails.length > 0) {
      return emails[0];
    }
  }
  
  // Fallback: search for email in the entire text
  const allEmails = extractEmails(text);
  return allEmails.length > 0 ? allEmails[0] : '';
}

function extractDDOEmail(text) {
  const ddoDetailsRegex = /Contact DDO\s*([\s\S]*?)(?:\n\n|\Z)/i;
  const ddoDetailsMatch = text.match(ddoDetailsRegex);
  
  if (ddoDetailsMatch) {
    const ddoDetailsBlock = ddoDetailsMatch[1];
    const emails = extractEmails(ddoDetailsBlock);
    
    if (emails.length > 0) {
      return emails[0];
    }
  }
  
  // Fallback: search for email in the entire text
  const allEmails = extractEmails(text);
  return allEmails.length > 1 ? allEmails[1] : '';
}

app.post('/api/extract-pro-forma-data', upload.single('proForma'), async (req, res) => {
  try {
    const buffer = req.file.buffer;
    let text;

    console.log('File received:', req.file.originalname, 'Type:', req.file.mimetype);

    if (req.file.mimetype === 'application/pdf') {
      const pdfData = await pdfParse(buffer);
      text = pdfData.text;
    } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      throw new Error('Unsupported file type');
    }

    console.log('Extracted text:', text);

    const fullName = extractField(text, 'Name');
    const { surname, forename } = splitName(fullName);

    const candidateEmail = extractEmail(text);
    const ddoEmail = extractDDOEmail(text);

    console.log('Extracted candidate email:', candidateEmail);
    console.log('Extracted DDO email:', ddoEmail);

    const extractedData = {
      surname,
      forename,
      email: candidateEmail,
      diocese: extractField(text, 'Diocese'),
      ddoName: extractField(text, 'Contact DDO'),
      ddoEmail: ddoEmail,
      sponsoringBishop: extractField(text, 'Sponsoring Bishop'),
      questionToThePanel: extractField(text, 'Question to the Panel'),
    };

    console.log('Extracted data:', extractedData);

    res.json(extractedData);
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});