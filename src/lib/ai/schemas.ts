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
  type: z.enum(['public', 'government', 'media', 'employees', 'company', 'influencer', 'regulator']).catch('public'),
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
    publicAwareness: z.number().int().min(0).max(100).optional().default(10),
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
  speakerId: z.string().optional().catch(undefined),
})

export const CohortUpdateSchema = z.object({
  cohortName: z.string(),
  mood: z.enum(['Calm', 'Concerned', 'Angry', 'Confused', 'Fatigued']).catch('Concerned'),
  dominantNarrative: z.string(),
  behaviours: z.array(z.string()),
  sentimentDelta: z.number().transform((v) => Math.max(-0.25, Math.min(0.25, v))),
  activationDelta: z.number().transform((v) => Math.max(-0.25, Math.min(0.25, v))),
  trustDelta: z.number().transform((v) => Math.max(-0.25, Math.min(0.25, v))),
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

export const HealthDeltasSchema = z.object({
  overallDelta: z.number().transform((v) => Math.max(-5, Math.min(8, v))),
  publicSentimentDelta: z.number().transform((v) => Math.max(-5, Math.min(8, v))),
  mediaHeatDelta: z.number().transform((v) => Math.max(-6, Math.min(5, v))),
  regulatoryPressureDelta: z.number().transform((v) => Math.max(-6, Math.min(5, v))),
  internalStabilityDelta: z.number().transform((v) => Math.max(-5, Math.min(8, v))),
  fraudRiskDelta: z.number().transform((v) => Math.max(-6, Math.min(5, v))),
  publicAwarenessDelta: z.number().transform((v) => Math.max(0, Math.min(8, v))).optional().default(0),
})

export const NewNodeSchema = z.object({
  label: z.string(),
  type: z.enum(['public', 'government', 'media', 'employees', 'company', 'influencer', 'regulator']).catch('public'),
  sentiment: z.number().transform((v) => Math.max(-1, Math.min(1, v))),
  activation: z.number().transform((v) => Math.max(0, Math.min(1, v))),
  trustInCompany: z.number().transform((v) => Math.max(0, Math.min(1, v))),
  connectTo: z.array(z.string()).min(1).max(3),
})

export const EnhancedTickResponseSchema = z.object({
  messages: z.array(EnhancedMessageSchema).min(1),
  cohortUpdates: z.array(CohortUpdateSchema).min(1),
  healthDeltas: HealthDeltasSchema.optional().catch(undefined),
  decisionPrompt: DecisionPromptSchema.optional().catch(undefined),
  secondaryEvents: z.array(SecondaryEventSchema).optional().catch(undefined),
  newNodes: z.array(NewNodeSchema).optional().catch(undefined),
})
export type EnhancedTickResponse = z.infer<typeof EnhancedTickResponseSchema>

// --- Speaker profiles ---
export const SpeakerProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  handle: z.string(),
  cohortName: z.string(),
  role: z.string(),
  personality: z.string(),
  messageType: z.enum(['news', 'influencer', 'official', 'forum', 'secondary']).catch('forum'),
  reach: z.number().transform((v) => Math.max(0, Math.min(1, v))),
})
export type SpeakerProfile = z.infer<typeof SpeakerProfileSchema>

export const SpeakerProfilesResponseSchema = z.object({
  speakers: z.array(SpeakerProfileSchema).min(10).max(30),
})
export type SpeakerProfilesResponse = z.infer<typeof SpeakerProfilesResponseSchema>

// --- Executive recommendations ---
export const ExecutiveRecommendationSchema = z.object({
  role: z.string(),
  name: z.string(),
  recommendation: z.string(),
  reasoning: z.string(),
})
export type ExecutiveRecommendation = z.infer<typeof ExecutiveRecommendationSchema>

export const ExecutiveAdvisorySchema = z.object({
  recommendations: z.array(ExecutiveRecommendationSchema).min(4).max(4),
})
export type ExecutiveAdvisory = z.infer<typeof ExecutiveAdvisorySchema>

// --- Population stats ---
export const PopulationStatsSchema = z.object({
  cohortName: z.string(),
  population: z.number().int(),
  activeSpeakers: z.number().int(),
  aggregateSentiment: z.number().transform((v) => Math.max(-1, Math.min(1, v))),
  trendDirection: z.enum(['improving', 'stable', 'declining']),
})
export type PopulationStats = z.infer<typeof PopulationStatsSchema>
