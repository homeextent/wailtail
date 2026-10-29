/**
 * Client-Side AI Service for Wailtail Editorial Assistant
 * Communicates with /api/ai-assistant serverless edge endpoint.
 */

import { auth } from '../firebase';
import {
  AiInterviewRequest,
  AiSynthesizeDraftRequest,
  AiRefineSectionRequest,
  AiAssistantPayload,
  AiAssistantResponse,
  ListingDraftSchema
} from '../types';

/**
 * Helper to encode an inspection PDF or image file into Base64 format
 * for multimodal transmission to the Gemini API.
 */
export function encodeFileToBase64(file: File): Promise<{ name: string; mimeType: string; dataBase64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      const dataBase64 = commaIdx !== -1 ? result.substring(commaIdx + 1) : result;
      resolve({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataBase64
      });
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Helper to retrieve the current user's Firebase Auth ID token.
 */
async function getAuthToken(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in to Wailtail to use the AI Editorial Assistant.');
  }

  const token = await currentUser.getIdToken();
  if (!token) {
    throw new Error('Authentication token is missing. Please sign in again.');
  }

  return token;
}

/**
 * Base dispatcher sending authenticated payloads to /api/ai-assistant.
 */
async function postAiAssistant<T>(payload: AiAssistantPayload): Promise<T> {
  const token = await getAuthToken();

  const response = await fetch('/api/ai-assistant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (response.status === 401) {
    throw new Error('Your session has expired or you are unauthorized. Please sign in again.');
  }

  if (response.status === 429) {
    throw new Error('AI generation is currently rate-limited. Please wait a moment and try again.');
  }

  let jsonResult: AiAssistantResponse<T>;
  try {
    const rawText = await response.text();
    let text = rawText.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    jsonResult = JSON.parse(text);
  } catch (parseErr) {
    throw new Error(
      `Failed to parse AI assistant response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
    );
  }

  if (!response.ok || !jsonResult.success) {
    const errorMessage = jsonResult?.error || `AI assistant request failed with status ${response.status}`;
    if (
      response.status === 429 ||
      errorMessage.toLowerCase().includes('rate-limited') ||
      errorMessage.toLowerCase().includes('resource_exhausted')
    ) {
      throw new Error('AI generation is currently rate-limited. Please wait a moment and try again.');
    }
    throw new Error(errorMessage);
  }

  return jsonResult.data as T;
}

/**
 * Action 1: Generates 3-5 chassis-targeted consignment questions
 */
export async function generateChassisInterview(params: AiInterviewRequest): Promise<string[]> {
  const data = await postAiAssistant<string[] | { questions: string[] }>({
    action: 'generate_interview',
    ...params
  });

  if (Array.isArray(data)) {
    return data;
  }

  return data?.questions || [];
}

/**
 * Action 2: Synthesizes a full draft adhering to ListingDraftSchema
 */
export async function synthesizeListingDraft(params: AiSynthesizeDraftRequest): Promise<ListingDraftSchema> {
  const draft = await postAiAssistant<ListingDraftSchema>({
    action: 'synthesize_full_draft',
    ...params
  });

  // Payload sanitization fallback
  if (draft && draft.financials) {
    draft.financials.currency = 'CAD';
    if (typeof draft.financials.reserveAmount !== 'number' || isNaN(draft.financials.reserveAmount)) {
      draft.financials.reserveAmount = 0;
    }
  }

  return draft;
}

/**
 * Action 3: Refines overviewNarrative or showcaseChapters sections
 */
export async function refineListingSection(
  params: AiRefineSectionRequest
): Promise<{ overviewHeading?: string; overviewNarrative?: string[]; showcaseChapters?: any[] }> {
  return postAiAssistant<{ overviewHeading?: string; overviewNarrative?: string[]; showcaseChapters?: any[] }>({
    action: 'refine_section',
    ...params
  });
}
