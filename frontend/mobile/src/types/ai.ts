export type AIConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNAVAILABLE';
export type AITrustCategory = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';

export interface AITrustAssessment {
  id?: string;
  incident_id: string;
  trust_score: number | null;
  confidence_level: AIConfidenceLevel;
  trust_category: AITrustCategory | null;
  model_version: string;
  feature_version: string;
  explanation: string[];
  raw_probability?: number | null;
  created_at?: string;
  updated_at?: string;
}
