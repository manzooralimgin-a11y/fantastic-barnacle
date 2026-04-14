import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Generic data-fetching hook.
 * @param {() => Promise<any>} fetcher  - async function that returns data
 * @param {any[]}              deps     - re-fetch when these change
 * @param {{ immediate?: boolean }} options
 */
export function useFetch(fetcher, deps = [], { immediate = true } = {}) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(immediate)
  const [error,   setError]   = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const execute = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      if (mountedRef.current) {
        setData(result)
        setLoading(false)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || 'Something went wrong.')
        setLoading(false)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (immediate) execute()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execute])

  return { data, loading, error, refetch: execute }
}

/**
 * Mutation hook for POST/PUT/DELETE operations.
 * @param {(payload: any) => Promise<any>} mutationFn
 */
export function useMutation(mutationFn) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [data,    setData]    = useState(null)

  const mutate = useCallback(async (payload) => {
    setLoading(true)
    setError(null)
    try {
      const result = await mutationFn(payload)
      setData(result)
      setLoading(false)
      return result
    } catch (err) {
      const msg = err.message || 'Something went wrong.'
      setError(msg)
      setLoading(false)
      throw err
    }
  }, [mutationFn])

  const reset = useCallback(() => {
    setLoading(false)
    setError(null)
    setData(null)
  }, [])

  return { mutate, loading, error, data, reset }
}
