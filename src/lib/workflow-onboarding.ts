export function workflowEntry(input: {
  started: boolean;
  hasQuiz: boolean;
  hasHours: boolean;
  hasMap: boolean;
  hasTask: boolean;
}) {
  if (input.hasQuiz || input.hasHours || input.hasMap || input.hasTask) return "home";
  return input.started ? "resume" : "welcome";
}
