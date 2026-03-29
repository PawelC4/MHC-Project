import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

// Initialize the Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { base64Image, mimeType, stationName, quest } = body;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `
      You are a strict but fun judge for a NYC Subway scavenger hunt.
      The user claims they are at the "${stationName}" station.
      Their current quest is: "${quest}".
      
      Look at the provided photo.
      1. Is it reasonably likely they are at a subway station (or this specific station)?
      2. Did they attempt the quest?
      
      Respond ONLY with a raw JSON object (no markdown, no code blocks) using this exact structure:
      {
        "success": true/false,
        "message": "A short, fun 1-sentence explanation of why they passed or failed."
      }
    `;

    const imageParts = [
      {
        inlineData: {
          data: base64Image.replace(/^data:image\/\w+;base64,/, ''), 
          mimeType: mimeType || 'image/jpeg',
        },
      },
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = result.response.text();
    
    // Clean up any potential markdown formatting
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedResponse = JSON.parse(cleanJson);

    return NextResponse.json(parsedResponse);

  } catch (error) {
    console.error('Gemini API Error:', error);
    return NextResponse.json(
      { success: false, message: "The AI judge is currently asleep. Try again!" },
      { status: 500 }
    );
  }
}