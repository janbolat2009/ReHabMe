# AI safety

## Separation of concerns
| System | May | May not |
|---|---|---|
| Personalisation engine (rules) | choose exercises from the approved library, adjust levels inside clinician bounds, recommend rest/reassessment/clinician contact | invent exercises, exceed bounds, act after high discomfort |
| ML model | estimate time-to-milestone / 90-day FMA with uncertainty, abstain | be shown as validated before C4 gate; be called by the LLM |
| LLM assistant | explain exercises, platform, metrics; help with habits; route to care | diagnose, prescribe/adjust/stop medication, change treatment, predict recovery, discourage professional care |

## Assistant pipeline (`server/services/assistant/`)
1. **Safety classifier (deterministic, before anything else).** Unicode-aware patterns (RU/EN/KZ) for BE-FAST stroke signs, chest pain, seizures → fixed emergency response with *Call 103 / 112* actions, no retrieval, no LLM. Self-harm → crisis response. Medication/diagnosis/stopping-care requests → refusal + offer to prepare questions for the doctor. Prompt-injection phrases are flagged and logged.
2. **Deterministic intents** using the patient's own data (e.g. "what do I do today") are answered from the plan without external calls.
3. **Retrieval**: BM25 over a curated knowledge base (`server/knowledge/*.md`, each with source, version, review status) plus auto-generated docs from the exercise library. Query is PII-redacted first. Relevance requires both a score threshold and ≥ 50 % query-term coverage, otherwise the assistant **abstains** ("there is no verified answer; ask your clinician").
4. **Production KB gate**: `KB_REQUIRE_APPROVED=true` (enforced at boot in production) restricts retrieval to documents with `review_status: approved`. Medical documents ship as `draft` until clinician sign-off (gate C3).
5. **Generation (optional)**: only when an API key is configured **and** `LLM_EXTERNAL_PROCESSING_APPROVED=true` (DPA signed) **and** the patient gave the separate `ai_assistant_external` consent. Otherwise the answer is extractive (quoted from the source). System prompt fixes the rules; user text is wrapped in `<user_message>` and PII-redacted; output is JSON-schema constrained (`answer, citations, needs_clinician, grounded`).
6. **Output guard**: rejects dosages, treatment-change advice, diagnoses and guarantees; citations must reference retrieved chunk IDs; on any failure → extractive fallback.
7. **Logging**: messages stored AES-256-GCM-encrypted, retained 90 days by default; safety-route events written to the audit log without content.

## Removed in v2 (unsafe)
- "AI document analysis" that returned a hard-coded diagnosis ("ischemic stroke, right-arm paresis…") for *any* uploaded file.
- LLM grading of cognitive answers whose check (`"INCORRECT".includes("CORRECT")`) reported every answer as correct.
- Unauthenticated `/api/chat` proxy forwarding raw patient text to an external LLM.

## Evaluation
`server/tests/safety.test.js` and `assistant.test.js` (43 cases): 12 emergency phrasings incl. "ё" and English, 5 benign non-triggers, self-harm, 6 medical-advice refusals, emergency-over-medication precedence, 4 injection attempts, PII redaction, output guard, consent gating, citation validation, abstention. These are regression tests, not a clinical evaluation — gate C5 requires clinician red-teaming.
