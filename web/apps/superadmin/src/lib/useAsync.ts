import { useCallback, useEffect, useState } from 'react'

export type AsyncStatus = 'loading' | 'success' | 'error'

export interface AsyncResult<T> {
  status: AsyncStatus
  data: T | null
  error: unknown
  reload: () => void
}

/**
 * Run an async function and track loading/success/error, with a `reload()` to
 * retry. The fetcher re-runs whenever `deps` change or `reload()` is called.
 *
 * Each effect invocation captures its own AbortController in the closure.
 * When the effect's cleanup runs (deps changed or component unmounted), the
 * controller is aborted and the stale .then() callback skips the setState.
 * This prevents both stale-data overwrites and state updates on unmounted
 * components.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncResult<T> {
  const [state, setState] = useState<{ status: AsyncStatus; data: T | null; error: unknown }>({
    status: 'loading',
    data: null,
    error: null,
  })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    // Each invocation gets its own controller — the closure captures it so the
    // .then() callback below always checks *this* invocation's signal, not the
    // latest one stored in a ref.
    const controller = new AbortController()
    setState({ status: 'loading', data: null, error: null })
    fn().then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'success', data, error: null })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', data: null, error })
      },
    )
    return () => {
      controller.abort()
    }
    // fn is intentionally excluded; callers pass a stable `deps` list instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps])

  return { ...state, reload }
}
