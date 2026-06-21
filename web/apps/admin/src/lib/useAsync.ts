import { useCallback, useEffect, useState } from 'react'

export type AsyncStatus = 'loading' | 'success' | 'error'

export interface AsyncResult<T> {
  status: AsyncStatus
  data: T | null
  error: unknown
  reload: () => void
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncResult<T> {
  const [state, setState] = useState<{ status: AsyncStatus; data: T | null; error: unknown }>({
    status: 'loading',
    data: null,
    error: null,
  })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let active = true
    setState({ status: 'loading', data: null, error: null })
    fn().then(
      (data) => { if (active) setState({ status: 'success', data, error: null }) },
      (error) => { if (active) setState({ status: 'error', data: null, error }) },
    )
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps])

  return { ...state, reload }
}
