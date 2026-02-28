import { z } from 'zod'

// --- Questions generation ---
export const QuestionsResponseSchema = z.object({
  questions: z.array(z.string()).min(1).max(3),
})
export type QuestionsResponse = z.infer<typeof QuestionsResponseSchema>

// --- Setup generation (cohorts + timeline) ---
export const CohortSchema = z.object({
  name: z.string(),
  description: z.string(),
  attentionWeights: z.object({
    news: z.number(),
    social: z.number(),
    official: z.number(),
  }),
  sensitivityTags: z.array(z.string()),
})

export const TimelineEventSchema = z.object({
  dayNumber: z.number().int().min(0),
  dateLabel: z.string(),
  title: z.string(),
  description: z.string(),
})

export const SetupResponseSchema = z.object({
  projectName: z.string(),
  cohorts: z.array(CohortSchema).min(2).max(6),
  events: z.array(TimelineEventSchema).min(1),
})
export type SetupResponse = z.infer<typeof SetupResponseSchema>

// --- Tick generation (messages + cohort summaries) ---
export const MessageSchema = z.object({
  type: z.enum(['news', 'influencer', 'official', 'comment']),
  author: z.string(),
  content: z.string(),
  parentIndex: z.number().optional(), // index into messages array for comments
})

export const CohortSummarySchema = z.object({
  cohortName: z.string(),
  mood: z.enum(['Calm', 'Concerned', 'Angry', 'Confused', 'Fatigued']),
  dominantNarrative: z.string(),
  behaviours: z.array(z.string()),
})

export const TickResponseSchema = z.object({
  messages: z.array(MessageSchema).min(3),
  cohortSummaries: z.array(CohortSummarySchema).min(2),
})
export type TickResponse = z.infer<typeof TickResponseSchema>

// --- Graph generation ---
export const GraphNodeSchema = z.object({
  label: z.string(),
  type: z.enum(['public', 'government', 'media', 'employees', 'company', 'influencer', 'regulator']),
  cohortName: z.string().nullable().optional(),
  sentiment: z.number().min(-1).max(1),
  activation: z.number().min(0).max(1),
  trustInCompany: z.number().min(0).max(1),
})

export const GraphEdgeSchema = z.object({
  sourceLabel: z.string(),
  targetLabel: z.string(),
  weight: z.number().min(0).max(1),
  type: z.enum(['influence', 'trust', 'information']),
})

export const GraphSetupSchema = z.object({
  nodes: z.array(GraphNodeSchema).min(4),
  edges: z.array(GraphEdgeSchema).min(3),
  healthScores: z.object({
    overall: z.number().int().min(0).max(100),
    publicSentiment: z.number().int().min(0).max(100),
    mediaHeat: z.number().int().min(0).max(100),
    regulatoryPressure: z.number().int().min(0).max(100),
    internalStability: z.number().int().min(0).max(100),
    fraudRisk: z.number().int().min(0).max(100),
  }),
})
export type GraphSetup = z.infer<typeof GraphSetupSchema>

// --- Enhanced tick generation ---
export const EnhancedMessageSchema = z.object({
  type: z.enum(['news', 'influencer', 'official', 'forum', 'secondary']).catch('forum'),
  author: z.string(),
  content: z.string(),
  reach: z.number().transform((v) => Math.max(0, Math.min(1, v))),
  sentiment: z.number().transform((v) => Math.max(-1, Math.min(1, v))),
})

export const CohortUpdateSchema = z.object({
  cohortName: z.string(),
  mood: z.enum(['Calm', 'Concerned', 'Angry', 'Confused', 'Fatigued']).catch('Concerned'),
  dominantNarrative: z.string(),
  behaviours: z.array(z.string()),
  sentimentDelta: z.number().transform((v) => Math.max(-0.15, Math.min(0.15, v))),
  activationDelta: z.number().transform((v) => Math.max(-0.15, Math.min(0.15, v))),
  trustDelta: z.number().transform((v) => Math.max(-0.15, Math.min(0.15, v))),
})

export const DecisionPromptSchema = z.object({
  prompt: z.string(),
  options: z.array(z.string()).min(2).max(4),
})

export const SecondaryEventSchema = z.object({
  title: z.string(),
  description: z.string(),
  type: z.enum(['viral_spike', 'misinformation_wave', 'scam_wave', 'whistleblower_leak', 'regulatory_action']),
})

export const EnhancedTickResponseSchema = z.object({
  messages: z.array(EnhancedMessageSchema).min(1),
  cohortUpdates: z.array(CohortUpdateSchema).min(1),
  decisionPrompt: DecisionPromptSchema.optional().catch(undefined),
  secondaryEvents: z.array(SecondaryEventSchema).optional().catch(undefined),
})
export type EnhancedTickResponse = z.infer<typeof EnhancedTickResponseSchema>
