import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import cron from 'node-cron';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Gemini API Initialization
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Quizzes को memory में store करने के लिए global variable
let latestQuizzesData = {
  lastUpdated: null,
  quizzes: []
};

// JSON Response Schema Definition
const quizResponseSchema = {
  type: Type.OBJECT,
  properties: {
    quizzes: {
      type: Type.ARRAY,
      description: "List of 6 financial literacy quizzes",
      items: {
        type: Type.OBJECT,
        properties: {
          quizId: { type: Type.INTEGER },
          title: { type: Type.STRING },
          topic: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            description: "10 multiple choice questions for the quiz",
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER },
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                correctAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING }
              },
              required: ["id", "question", "options", "correctAnswer", "explanation"]
            }
          }
        },
        required: ["quizId", "title", "topic", "questions"]
      }
    }
  },
  required: ["quizzes"]
};

// Gemini API का उपयोग करके Quiz जनरेट करने का फ़ंक्शन
async function generateQuizzes() {
  console.log('Generating new Financial Literacy Quizzes...');
  
  const prompt = `
    Generate 6 distinct quizzes focused exclusively on Financial Literacy (e.g., Budgeting, Investing, Taxes, Credit Scores, Compound Interest, Debt Management).
    Each quiz must contain exactly 10 Multiple Choice Questions (MCQs).
    Each question must have 4 options, a correct answer, and a short explanation.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: quizResponseSchema,
        temperature: 0.7,
      }
    });

    const parsedData = JSON.parse(response.text);
    latestQuizzesData = {
      lastUpdated: new Date().toISOString(),
      quizzes: parsedData.quizzes
    };

    console.log('Successfully generated and updated 6 quizzes.');
  } catch (error) {
    console.error('Error generating quizzes from Gemini API:', error);
  }
}

// 1. GET /health Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    lastQuizGeneratedAt: latestQuizzesData.lastUpdated
  });
});

// 2. GET /quiz Endpoint
app.get('/quiz', (req, res) => {
  if (!latestQuizzesData.quizzes || latestQuizzesData.quizzes.length === 0) {
    return res.status(503).json({
      error: 'Quizzes are currently being generated. Please try again in a few seconds.'
    });
  }

  res.status(200).json({
    status: 'success',
    lastUpdated: latestQuizzesData.lastUpdated,
    totalQuizzes: latestQuizzesData.quizzes.length,
    data: latestQuizzesData.quizzes
  });
});

// Cron Job: हर 30 मिनट में चलेगा ('0,30 * * * *')
cron.schedule('0,30 * * * *', () => {
  console.log('Running 30-minute scheduled cron job...');
  generateQuizzes();
});

// Server स्टार्ट होने पर पहला batch तुरंत जनरेट करें
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  await generateQuizzes();
});
