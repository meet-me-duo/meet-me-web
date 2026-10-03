export const SUBMISSION_TEXT_LIMIT = 500;

export function submissionText(value: string) {
  const text = value.trim();
  const length = Array.from(text).length;
  return { text, length, valid: length >= 1 && length <= SUBMISSION_TEXT_LIMIT };
}
