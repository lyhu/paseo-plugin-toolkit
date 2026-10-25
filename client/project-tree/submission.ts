export interface SubmissionState {
  pending: boolean;
  error: string;
}

/** One submit at a time; failed work keeps the adapter open with its draft and error. */
export function createNodeSubmission(change: (state: SubmissionState) => void) {
  let pending = false;
  return {
    get pending() {
      return pending;
    },
    async perform(work: () => Promise<void>, complete: () => void) {
      if (pending) return;
      pending = true;
      change({ pending: true, error: "" });
      let error = "";
      try {
        await work();
        complete();
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
      } finally {
        pending = false;
        change({ pending: false, error });
      }
    },
  };
}
