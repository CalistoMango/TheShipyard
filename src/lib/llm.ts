import OpenAI from "openai";
import type { Category } from "./types";
import {
  CAST_CLASSIFICATION_SYSTEM_PROMPT,
  buildCastClassificationUserPrompt,
} from "./prompts/cast-classification";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type ClassificationResult =
  | { type: "new"; category: Category; title: string; description: string }
  | { type: "duplicate"; existingIdeaId: number; reason: string }
  | { type: "rejected"; reason: string };

interface ExistingIdea {
  id: number;
  title: string;
  description: string;
}

export async function classifyCast(
  castText: string,
  existingIdeas: ExistingIdea[]
): Promise<ClassificationResult> {
  const userPrompt = buildCastClassificationUserPrompt(castText, existingIdeas);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CAST_CLASSIFICATION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from LLM");
    }

    const result = JSON.parse(content) as ClassificationResult;

    // Validate the response
    if (result.type === "new") {
      const validCategories: Category[] = ["games", "tools", "social", "defi", "content", "other"];
      if (!validCategories.includes(result.category)) {
        result.category = "other";
      }
    }

    return result;
  } catch (error) {
    console.error("LLM classification error:", error);
    // Default to rejected on error
    return {
      type: "rejected",
      reason: "Classification error - please try again",
    };
  }
}

// Test function for development
export async function testClassification() {
  const testCast = "Someone should build a Wordle clone for Farcaster with crypto-themed words!";
  const result = await classifyCast(testCast, []);
  console.log("Test classification result:", result);
  return result;
}
