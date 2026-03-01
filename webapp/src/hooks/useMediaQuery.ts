'use client'

import { useState, useEffect } from 'react'

/**
 * A hook that listens for changes in a media query and returns whether it matches.
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false)

    useEffect(() => {
        if (typeof window === 'undefined') return

        const media = window.matchMedia(query)

        // Initial check
        if (media.matches !== matches) {
            setMatches(media.matches)
        }

        const listener = (event: MediaQueryListEvent) => {
            setMatches(event.matches)
        }

        media.addEventListener('change', listener)
        return () => media.removeEventListener('change', listener)
    }, [query, matches])

    return matches
}
