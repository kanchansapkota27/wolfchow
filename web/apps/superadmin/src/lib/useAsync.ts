import { useCallback, useEffect, useRef, useState } from 'react'

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
 * An AbortController is created per invocation and aborted on cleanup so
 * in-flight fetch calls are cancelled rather than abandoned, avoiding
 * NS_BINDING_ABORTED noise in the network panel.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncResult<T> {
  const [state, setState] = useState<{ status: AsyncStatus; data: T | null; error: unknown }>({
    status: 'loading',
    data: null,
    error: null,
  })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    controllerRef.current?.abort()
    controllerRef.current = new AbortController()
    setState({ status: 'loading', data: null, error: null })
    fn().then(
      (data) => {
        if (!controllerRef.current?.signal.aborted) setState({ status: 'success', data, error: null })
      },
      (error: unknown) => {
        if (!controllerRef.current?.signal.aborted) setState({ status: 'error', data: null, error })
      },
    )
    return () => {
      controllerRef.current?.abort()
    }
    // fn is intentionally excluded; callers pass a stable `deps` list instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps])

  return { ...state, reload }
}
