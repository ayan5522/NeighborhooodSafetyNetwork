export type VerificationType = 'CONFIRM' | 'DISPUTE';

export type CommunityVerificationStatus =
  | 'UNVERIFIED'
  | 'COMMUNITY_CONFIRMED'
  | 'COMMUNITY_DISPUTED';

export interface VerificationSummary {
  incident_id: string;
  confirm_count: number;
  dispute_count: number;
  total_verifications: number;
  status: CommunityVerificationStatus;
  my_verification: VerificationType | null;
}

export const VERIFICATION_STATUS_META: Record<
  CommunityVerificationStatus,
  { label: string; color: string; bgColor: string }
> = {
  UNVERIFIED: {
    label: 'Unverified',
    color: '#4B5563',
    bgColor: '#F3F4F6',
  },
  COMMUNITY_CONFIRMED: {
    label: 'Community Confirmed',
    color: '#065F46',
    bgColor: '#D1FAE5',
  },
  COMMUNITY_DISPUTED: {
    label: 'Community Disputed',
    color: '#991B1B',
    bgColor: '#FEE2E2',
  },
};
