export const GENDER_VALUES = ['male', 'female', 'non_binary', 'another_gender', 'prefer_not_to_say'] as const;

export type Gender = (typeof GENDER_VALUES)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  non_binary: 'Non-binary',
  another_gender: 'Another gender',
  prefer_not_to_say: 'Prefer not to say',
};
