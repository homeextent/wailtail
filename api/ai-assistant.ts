/**
 * Vercel Serverless Function: /api/ai-assistant
 * Powers Wailtail's AI Editorial Assistant.
 * Interfaces with Google Gemini to support:
 * 1. Targeted chassis interview generation (gemini-1.5-flash)
 * 2. Full listing draft synthesis (gemini-1.5-pro with multimodal document support)
 * 3. Contextual in-section refinements (gemini-1.5-flash)
 */

import * as admin from 'firebase-admin';
import {
  AiAssistantAction,
  AiInterviewRequest,
  AiSynthesizeDraftRequest,
  AiRefineSectionRequest,
  ListingDraftSchema,
  ShowcaseChapter
} from '../src/types';

const firebaseAdmin = (admin as any).default || admin;

function sendJson(res: any, status: number, data: any) {
  if (res.setHeader) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }

  res.statusCode = status;
  res.end(JSON.stringify(data));
}

async function parseRequestBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return new Promise((resolve) => {
    let bodyData = '';
    req.on('data', (chunk: any) => {
      bodyData += chunk;
    });
    req.on('end', () => {
      try {
        resolve(bodyData ? JSON.parse(bodyData) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function initFirebaseAdmin() {
  if (!firebaseAdmin.apps.length) {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
    if (serviceAccountRaw) {
      const serviceAccount = JSON.parse(serviceAccountRaw);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount)
      });
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
    } else {
      firebaseAdmin.initializeApp();
    }
  }
}

function cleanAndParseJson(rawText: string): any {
  let text = rawText.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '');
    text = text.replace(/\s*```$/, '');
  }
  return JSON.parse(text);
}

function cleanBase64(base64OrDataUrl: string): string {
  if (!base64OrDataUrl) return '';
  const commaIdx = base64OrDataUrl.indexOf(',');
  if (commaIdx !== -1 && base64OrDataUrl.substring(0, commaIdx).includes('base64')) {
    return base64OrDataUrl.substring(commaIdx + 1).trim();
  }
  return base64OrDataUrl.trim();
}

async function callGeminiApi(params: {
  model: 'gemini-1.5-pro' | 'gemini-1.5-flash';
  apiKey: string;
  systemInstruction?: string;
  userParts: Array<any>;
  responseSchema?: any;
}): Promise<any> {
  const { model, apiKey, systemInstruction, userParts, responseSchema } = params;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload: any = {
    contents: [
      {
        role: 'user',
        parts: userParts
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  if (responseSchema) {
    payload.generationConfig.responseSchema = responseSchema;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (response.status === 429) {
    const error: any = new Error('AI generation is currently rate-limited. Please wait a moment and try again.');
    error.status = 429;
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429 || errorText.toLowerCase().includes('resource_exhausted')) {
      const error: any = new Error('AI generation is currently rate-limited. Please wait a moment and try again.');
      error.status = 429;
      throw error;
    }
    const error: any = new Error(`Gemini API error (${response.status}): ${errorText}`);
    error.status = response.status;
    throw error;
  }

  const geminiData = await response.json();
  const textContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    throw new Error('Gemini API did not return any candidate content.');
  }

  return cleanAndParseJson(textContent);
}

export default async function handler(req: any, res: any) {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    if (res.setHeader) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (typeof res.status === 'function') {
      return res.status(200).end();
    }
    res.statusCode = 200;
    return res.end();
  }

  if (req.method && req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Method not allowed. Use POST.' });
  }

  // Auth & Access Guard
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return sendJson(res, 401, {
      success: false,
      error: 'Unauthorized: Missing or invalid Authorization header.'
    });
  }

  const idToken = authHeader.substring(7).trim();
  if (!idToken) {
    return sendJson(res, 401, {
      success: false,
      error: 'Unauthorized: Missing Bearer token.'
    });
  }

  try {
    initFirebaseAdmin();
    await firebaseAdmin.auth().verifyIdToken(idToken);
  } catch (authErr: any) {
    console.error('[ai-assistant] Authentication verification failed:', authErr?.message);
    return sendJson(res, 401, {
      success: false,
      error: 'Unauthorized: Invalid or expired token.'
    });
  }

  // Read Gemini API Key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, {
      success: false,
      error: 'GEMINI_API_KEY is not configured on serverless environment'
    });
  }

  try {
    const body = await parseRequestBody(req);
    const action: AiAssistantAction = body?.action;

    if (!action) {
      return sendJson(res, 400, {
        success: false,
        error: 'Missing required parameter: action is required.'
      });
    }

    if (action === 'generate_interview') {
      const interviewParams: AiInterviewRequest = body.payload || body;
      const { year, make, model, generation } = interviewParams;

      if (!year || !make || !model) {
        return sendJson(res, 400, {
          success: false,
          error: 'Missing vehicle taxonomy (year, make, model required for interview generation).'
        });
      }

      const prompt = `You are a veteran collector car consignment journalist for Wailtail, Canada's premier online collector car auction.
Based on the following vehicle:
- Year: ${year}
- Make: ${make}
- Model: ${model}
- Generation/Chassis: ${generation || 'Standard/Not Specified'}

Generate 3 to 5 targeted provenance, mechanical, and service history questions specific to this chassis (e.g. Porsche air-cooled reseals, BMW VANOS/subframes, timing belt logs, paint meter readings, corrosion checks, past modifications, ownership chain).
Always include questions regarding Reserve Expectation ($CAD) and Starting Bid ($CAD) within the scope of these consignment questions.

Return a JSON object matching this schema:
{
  "questions": [
    "question 1",
    "question 2"
  ]
}`;

      const responseSchema = {
        type: 'OBJECT',
        properties: {
          questions: {
            type: 'ARRAY',
            items: { type: 'STRING' }
          }
        },
        required: ['questions']
      };

      const result = await callGeminiApi({
        model: 'gemini-1.5-flash',
        apiKey,
        userParts: [{ text: prompt }],
        responseSchema
      });

      const questions = Array.isArray(result?.questions)
        ? result.questions
        : Array.isArray(result)
        ? result
        : [];

      return sendJson(res, 200, {
        success: true,
        data: questions
      });
    }

    if (action === 'synthesize_full_draft') {
      const synthesizeParams: AiSynthesizeDraftRequest = body.payload || body;
      const { notes, documents, interviewAnswers, baseDraft } = synthesizeParams;

      const systemInstruction = `You are the senior editorial director at Wailtail, Canada's premier online collector car auction.
Your mission is to synthesize a comprehensive, Bring-a-Trailer style vehicle listing draft adhering strictly to ListingDraftSchema.

CRITICAL EDITORIAL GUIDELINES & ANTI-HALLUCINATION GUARDRAILS:
1. Anti-Hallucination: NEVER fabricate provenance, undocumented repairs, fake owner counts, past accidents, or unverified paintwork. If details are not supported by the provided notes, interview responses, or attached inspection documents, state them accurately as unknown or omit speculative claims.
2. Canadian CAD Standards: All financials (startingBid, minimumIncrement, reserveAmount) MUST be in Canadian Dollars (CAD). Default currency to 'CAD'.
3. Reserve Rules: If a reserve price is not explicitly specified, default reserveAmount to 0 (representing a No Reserve auction).
4. Tone & Style: Objective, meticulous, and authoritative editorial prose. Transparently describe cosmetic blemishes, patina, and mechanical needs alongside highlights.
5. Structure:
   - Section 1: Title, subtitle, year, make, model, generation, vin, mileage, distanceUnit ('km' or 'mi'), location, engine, gearbox, exteriorColor, interior, titleStatus, sellerName, highlightsBadge.
   - Section 2: overviewHeading and overviewNarrative (array of 2-4 comprehensive editorial paragraphs).
   - Section 3: specifications table (array of label/value objects: e.g. Engine, Transmission, Drivetrain, Mileage, VIN, Exterior Color, Interior Color, Title Status, Location).
   - Section 4: Exactly 4 showcaseChapters locked to:
     * EXTERIOR (Title: "Exterior Highlights")
     * POWERTRAIN (Title: "Powertrain")
     * INTERIOR (Title: "Cabin & Cockpit")
     * CHASSIS (Title: "Chassis & Suspension")
     Each chapter MUST include an engaging subtitle, comprehensive narrative, highlights array with checkmark-worthy key details, and category-aware specCards array ({ key, value, isCustomKey: false }).
   - Section 7: financials ({ currency: 'CAD', startingBid: number, minimumIncrement: number, reserveAmount: number, durationDays: number }).`;

      const userPrompt = `Please synthesize a complete Wailtail auction listing draft from the following information:

SELLER NOTES:
${notes || 'No general notes provided.'}

INTERVIEW ANSWERS:
${interviewAnswers ? JSON.stringify(interviewAnswers, null, 2) : 'No interview answers provided.'}

BASE DRAFT / EXISTING SPECIFICATIONS:
${baseDraft ? JSON.stringify(baseDraft, null, 2) : 'No base draft provided.'}

Generate a full ListingDraftSchema JSON object adhering strictly to the required schema.`;

      const userParts: any[] = [{ text: userPrompt }];

      if (Array.isArray(documents) && documents.length > 0) {
        for (const doc of documents) {
          if (doc?.dataBase64 && doc?.mimeType) {
            userParts.push({
              inlineData: {
                mimeType: doc.mimeType,
                data: cleanBase64(doc.dataBase64)
              }
            });
          }
        }
      }

      const listingDraftResponseSchema = {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          subtitle: { type: 'STRING' },
          year: { type: 'STRING' },
          make: { type: 'STRING' },
          model: { type: 'STRING' },
          generation: { type: 'STRING' },
          vin: { type: 'STRING' },
          mileage: { type: 'STRING' },
          distanceUnit: { type: 'STRING' },
          location: { type: 'STRING' },
          engine: { type: 'STRING' },
          gearbox: { type: 'STRING' },
          exteriorColor: { type: 'STRING' },
          interior: { type: 'STRING' },
          titleStatus: { type: 'STRING' },
          sellerName: { type: 'STRING' },
          highlightsBadge: { type: 'STRING' },
          overviewHeading: { type: 'STRING' },
          overviewNarrative: {
            type: 'ARRAY',
            items: { type: 'STRING' }
          },
          specifications: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                label: { type: 'STRING' },
                value: { type: 'STRING' }
              },
              required: ['label', 'value']
            }
          },
          showcaseChapters: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                category: { type: 'STRING' },
                title: { type: 'STRING' },
                subtitle: { type: 'STRING' },
                narrative: { type: 'STRING' },
                photoUrl: { type: 'STRING' },
                photoCaption: { type: 'STRING' },
                highlights: {
                  type: 'ARRAY',
                  items: { type: 'STRING' }
                },
                specCards: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      key: { type: 'STRING' },
                      value: { type: 'STRING' },
                      isCustomKey: { type: 'BOOLEAN' }
                    },
                    required: ['key', 'value', 'isCustomKey']
                  }
                }
              },
              required: ['category', 'title', 'subtitle', 'narrative', 'highlights', 'specCards']
            }
          },
          financials: {
            type: 'OBJECT',
            properties: {
              currency: { type: 'STRING' },
              startingBid: { type: 'NUMBER' },
              minimumIncrement: { type: 'NUMBER' },
              reserveAmount: { type: 'NUMBER' },
              durationDays: { type: 'NUMBER' }
            },
            required: ['currency', 'startingBid', 'minimumIncrement', 'reserveAmount', 'durationDays']
          }
        },
        required: [
          'title',
          'subtitle',
          'year',
          'make',
          'model',
          'vin',
          'mileage',
          'distanceUnit',
          'location',
          'engine',
          'gearbox',
          'exteriorColor',
          'interior',
          'titleStatus',
          'highlightsBadge',
          'overviewHeading',
          'overviewNarrative',
          'specifications',
          'showcaseChapters',
          'financials'
        ]
      };

      const rawDraft = await callGeminiApi({
        model: 'gemini-1.5-pro',
        apiKey,
        systemInstruction,
        userParts,
        responseSchema: listingDraftResponseSchema
      });

      // Payload Sanitization and defaults
      const draft: ListingDraftSchema = {
        title: rawDraft.title || baseDraft?.title || 'Collector Vehicle',
        subtitle: rawDraft.subtitle || baseDraft?.subtitle || '',
        year: rawDraft.year || baseDraft?.year || '',
        make: rawDraft.make || baseDraft?.make || '',
        model: rawDraft.model || baseDraft?.model || '',
        generation: rawDraft.generation || baseDraft?.generation || '',
        vin: rawDraft.vin || baseDraft?.vin || '',
        mileage: rawDraft.mileage || baseDraft?.mileage || '',
        distanceUnit: (rawDraft.distanceUnit === 'mi' ? 'mi' : 'km') as 'km' | 'mi',
        location: rawDraft.location || baseDraft?.location || 'Canada',
        engine: rawDraft.engine || baseDraft?.engine || '',
        gearbox: rawDraft.gearbox || baseDraft?.gearbox || '',
        exteriorColor: rawDraft.exteriorColor || baseDraft?.exteriorColor || '',
        interior: rawDraft.interior || baseDraft?.interior || '',
        titleStatus: rawDraft.titleStatus || baseDraft?.titleStatus || 'Clean',
        sellerName: rawDraft.sellerName || baseDraft?.sellerName || '',
        sellerEmail: baseDraft?.sellerEmail || '',
        sellerPhone: baseDraft?.sellerPhone || '',
        highlightsBadge: rawDraft.highlightsBadge || baseDraft?.highlightsBadge || 'Canadian Market Selection',
        hagertyValuationUrl: baseDraft?.hagertyValuationUrl || '',
        serviceRecordsUrl: baseDraft?.serviceRecordsUrl || '',
        overviewHeading: rawDraft.overviewHeading || 'Overview & Provenance',
        overviewNarrative: Array.isArray(rawDraft.overviewNarrative)
          ? rawDraft.overviewNarrative
          : [rawDraft.overviewNarrative || ''],
        specifications: Array.isArray(rawDraft.specifications) ? rawDraft.specifications : [],
        showcaseChapters: Array.isArray(rawDraft.showcaseChapters)
          ? rawDraft.showcaseChapters.map((ch: any, idx: number) => {
              const cat = (ch.category || ['EXTERIOR', 'POWERTRAIN', 'INTERIOR', 'CHASSIS'][idx] || 'CUSTOM').toUpperCase();
              return {
                id: `chapter-${cat.toLowerCase()}-${idx}`,
                category: cat,
                title: ch.title || `${cat} Highlights`,
                subtitle: ch.subtitle || '',
                narrative: ch.narrative || '',
                photoUrl: ch.photoUrl || '',
                photoCaption: ch.photoCaption || '',
                highlights: Array.isArray(ch.highlights) ? ch.highlights : [],
                specCards: Array.isArray(ch.specCards)
                  ? ch.specCards.map((sc: any, scIdx: number) => ({
                      id: `spec-${cat.toLowerCase()}-${scIdx}`,
                      key: sc.key || '',
                      value: sc.value || '',
                      isCustomKey: Boolean(sc.isCustomKey)
                    }))
                  : []
              };
            })
          : [],
        financials: {
          currency: 'CAD',
          startingBid: typeof rawDraft.financials?.startingBid === 'number' && !isNaN(rawDraft.financials.startingBid)
            ? rawDraft.financials.startingBid
            : 100,
          minimumIncrement: typeof rawDraft.financials?.minimumIncrement === 'number' && !isNaN(rawDraft.financials.minimumIncrement)
            ? rawDraft.financials.minimumIncrement
            : 50,
          reserveAmount: typeof rawDraft.financials?.reserveAmount === 'number' && !isNaN(rawDraft.financials.reserveAmount)
            ? rawDraft.financials.reserveAmount
            : 0,
          durationDays: typeof rawDraft.financials?.durationDays === 'number' && !isNaN(rawDraft.financials.durationDays)
            ? rawDraft.financials.durationDays
            : 7
        }
      };

      return sendJson(res, 200, {
        success: true,
        data: draft
      });
    }

    if (action === 'refine_section') {
      const refineParams: AiRefineSectionRequest = body.payload || body;
      const { targetSection, contextSpecs, instructions, prompt: userPrompt } = refineParams;
      const editorialInstructions = instructions || userPrompt || '';

      if (targetSection === 'overviewNarrative') {
        const prompt = `You are a veteran collector car auction editor at Wailtail, Canada's premier online auction.
Refine or generate the Overview Narrative for this listing adhering strictly to Bring-a-Trailer editorial style based on the provided specifications and editorial instructions.

VEHICLE SPECIFICATIONS & CONTEXT:
${JSON.stringify(contextSpecs || {}, null, 2)}

${editorialInstructions ? `EDITORIAL INSTRUCTIONS:\n${editorialInstructions}` : ''}

ANTI-HALLUCINATION GUARDRAIL:
Do not fabricate claims, undocumented service history, or unverified facts. Present all provenance clearly and objectively.

Return a JSON object matching this schema:
{
  "overviewHeading": "Headline text e.g. Single-Owner Canadian-Market 993 Carrera",
  "overviewNarrative": [
    "Paragraph 1 covering vehicle provenance and initial delivery...",
    "Paragraph 2 covering equipment, cosmetic presentation, and maintenance history..."
  ]
}`;

        const responseSchema = {
          type: 'OBJECT',
          properties: {
            overviewHeading: { type: 'STRING' },
            overviewNarrative: {
              type: 'ARRAY',
              items: { type: 'STRING' }
            }
          },
          required: ['overviewHeading', 'overviewNarrative']
        };

        const result = await callGeminiApi({
          model: 'gemini-1.5-flash',
          apiKey,
          userParts: [{ text: prompt }],
          responseSchema
        });

        return sendJson(res, 200, {
          success: true,
          data: {
            overviewHeading: result?.overviewHeading || 'Overview & Provenance',
            overviewNarrative: Array.isArray(result?.overviewNarrative)
              ? result.overviewNarrative
              : [result?.overviewNarrative || '']
          }
        });
      }

      if (targetSection === 'showcaseChapters') {
        const prompt = `You are a veteran collector car auction editor at Wailtail, Canada's premier online auction.
Refine or synthesize the 4 locked Showcase Chapters for this listing matching the ShowcaseChapter schema:
1. EXTERIOR (Title: "Exterior Highlights")
2. POWERTRAIN (Title: "Powertrain")
3. INTERIOR (Title: "Cabin & Cockpit")
4. CHASSIS (Title: "Chassis & Suspension")

VEHICLE SPECIFICATIONS & CONTEXT:
${JSON.stringify(contextSpecs || {}, null, 2)}

${editorialInstructions ? `EDITORIAL INSTRUCTIONS:\n${editorialInstructions}` : ''}

ANTI-HALLUCINATION GUARDRAIL:
Base narratives, highlights, and spec cards strictly on known vehicle specifications. Do not invent aftermarket parts or false condition notes.

Return a JSON object containing an array of exactly 4 showcaseChapters.`;

        const responseSchema = {
          type: 'OBJECT',
          properties: {
            showcaseChapters: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'STRING' },
                  category: { type: 'STRING' },
                  title: { type: 'STRING' },
                  subtitle: { type: 'STRING' },
                  narrative: { type: 'STRING' },
                  photoUrl: { type: 'STRING' },
                  photoCaption: { type: 'STRING' },
                  highlights: {
                    type: 'ARRAY',
                    items: { type: 'STRING' }
                  },
                  specCards: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        id: { type: 'STRING' },
                        key: { type: 'STRING' },
                        value: { type: 'STRING' },
                        isCustomKey: { type: 'BOOLEAN' }
                      },
                      required: ['id', 'key', 'value', 'isCustomKey']
                    }
                  }
                },
                required: ['id', 'category', 'title', 'subtitle', 'narrative', 'highlights', 'specCards']
              }
            }
          },
          required: ['showcaseChapters']
        };

        const result = await callGeminiApi({
          model: 'gemini-1.5-flash',
          apiKey,
          userParts: [{ text: prompt }],
          responseSchema
        });

        const rawChapters = Array.isArray(result?.showcaseChapters) ? result.showcaseChapters : [];
        const lockedCategories: Array<'EXTERIOR' | 'POWERTRAIN' | 'INTERIOR' | 'CHASSIS'> = [
          'EXTERIOR',
          'POWERTRAIN',
          'INTERIOR',
          'CHASSIS'
        ];
        const lockedTitles: Record<string, string> = {
          EXTERIOR: 'Exterior Highlights',
          POWERTRAIN: 'Powertrain',
          INTERIOR: 'Cabin & Cockpit',
          CHASSIS: 'Chassis & Suspension'
        };

        const showcaseChapters: ShowcaseChapter[] = lockedCategories.map((category, idx) => {
          const found = rawChapters.find((ch: any) => ch?.category?.toUpperCase() === category) || rawChapters[idx] || {};
          return {
            id: found.id || `chapter-${category.toLowerCase()}-${idx}`,
            category,
            title: lockedTitles[category],
            subtitle: found.subtitle || '',
            narrative: found.narrative || '',
            photoUrl: found.photoUrl || '',
            photoCaption: found.photoCaption || '',
            highlights: Array.isArray(found.highlights) ? found.highlights : [],
            specCards: Array.isArray(found.specCards)
              ? found.specCards.map((sc: any, scIdx: number) => ({
                  id: sc.id || `spec-${category.toLowerCase()}-${scIdx}`,
                  key: sc.key || '',
                  value: sc.value || '',
                  isCustomKey: Boolean(sc.isCustomKey)
                }))
              : []
          };
        });

        return sendJson(res, 200, {
          success: true,
          data: { showcaseChapters }
        });
      }

      return sendJson(res, 400, {
        success: false,
        error: `Unknown targetSection '${targetSection}'. Expected 'overviewNarrative' or 'showcaseChapters'.`
      });
    }

    return sendJson(res, 400, {
      success: false,
      error: `Invalid action: ${action}`
    });
  } catch (err: any) {
    console.error('[ai-assistant] Handler error:', err);
    if (err?.status === 429 || err?.message?.includes('rate-limited') || err?.message?.includes('RESOURCE_EXHAUSTED')) {
      return sendJson(res, 429, {
        success: false,
        error: 'AI generation is currently rate-limited. Please wait a moment and try again.'
      });
    }

    return sendJson(res, err?.status || 500, {
      success: false,
      error: err?.message || 'Internal AI assistant processing error'
    });
  }
}
