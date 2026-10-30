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

  const rawText = await response.text().catch(() => '');

  if (
    response.status === 413 ||
    rawText.trim().startsWith('Request Entity Too Large') ||
    rawText.startsWith('Request Entity Too Large')
  ) {
    throw new Error(
      'Attached documents exceed the 4.5MB serverless transmission limit. Please remove some attachments or compress large documents before retrying.'
    );
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.toLowerCase().includes('application/json');

  // Inspect empty responses
  if (!rawText || rawText.trim().length === 0) {
    if (!response.ok) {
      throw new Error(`AI assistant service returned an empty error response (HTTP ${response.status}).`);
    }
    throw new Error(`AI assistant returned an empty response (HTTP ${response.status}).`);
  }

  // Inspect content-type before attempting JSON deserialization
  if (!isJson) {
    if (!response.ok) {
      throw new Error(`AI assistant request failed (HTTP ${response.status}): ${rawText.slice(0, 300)}`);
    }
    throw new Error(
      `Expected JSON response from AI assistant but received '${contentType || 'unknown'}' (HTTP ${response.status}): ${rawText.slice(0, 150)}`
    );
  }

  let jsonResult: AiAssistantResponse<T>;
  try {
    let text = rawText.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    jsonResult = JSON.parse(text);
  } catch (parseErr) {
    if (!response.ok) {
      throw new Error(
        `AI assistant request failed (HTTP ${response.status}) with invalid/truncated response: ${rawText.slice(0, 300)}`
      );
    }
    throw new Error(
      `Failed to parse AI assistant response (truncated or invalid JSON payload): ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
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
