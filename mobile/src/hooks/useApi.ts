import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage, isNetworkError } from "../api/client";

type Status = "loading" | "success" | "error" | "offline";

/** Centralizes the loading/error/offline state machine every screen needs
 * (Phase 8 spec section 14) instead of re-deriving it per screen. `deps`
 * re-runs the fetch, matching useEffect's dependency semantics. */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<T | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const run = useCallback(() => {
    setStatus("loading");
    fetcher()
      .then((result) => {
        setData(result);
        setStatus("success");
      })
      .catch((err) => {
        setErrorMessage(apiErrorMessage(err));
        setStatus(isNetworkError(err) ? "offline" : "error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { status, data, errorMessage, refetch: run, setData };
}
