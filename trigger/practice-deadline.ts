import { task } from "@trigger.dev/sdk";
import { runDeadlineJob } from "../src/features/practice/deadline-runner";

export const practiceDeadline = task({
  id: "practice-deadline",
  retry: {
    maxAttempts: 5,
    factor: 2,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 30_000,
    randomize: true,
  },
  run: async (payload: { deadlineJobId: string }) => runDeadlineJob(payload.deadlineJobId),
});
