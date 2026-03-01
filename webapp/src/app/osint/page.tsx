'use client'

import React, { useState, useEffect } from 'react'
import { Search, ExternalLink, Shield, Eye, Activity } from 'lucide-react'
import styles from './page.module.css'

export default function OsintPage() {
    const [mounted, setMounted] = useState(false)
    const spiderfootUrl = "http://localhost:5001"

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return null

    return (
        <div className={styles.page}>
            <div className={styles.atmosphere} />

            <header className={styles.header}>
                <div className={styles.titleSection}>
                    <div className={styles.statusPulse} style={{
                        backgroundColor: 'var(--status-info)',
                        boxShadow: '0 0 10px var(--color-blue-glow-20)',
                        animation: 'pulse 2s infinite'
                    }} />
                    <div>
                        <h1>Strategic Intelligence Hub</h1>
                        <p className={styles.subtitle}>
                            OSINT AUTOMATION • POWERED BY SPIDERFOOT
                        </p>
                    </div>
                </div>

                <div className={styles.headerActions}>
                    <div className={styles.timeSection} style={{ marginRight: 'var(--space-4)' }}>
                        <Activity size={12} className={styles.pulseIcon} style={{ color: 'var(--status-info)' }} />
                        <span style={{ fontSize: '10px', fontWeight: 600 }}>OSINT ENGINE LINKED</span>
                    </div>
                    <a
                        href={spiderfootUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.externalLink}
                    >
                        Launch Standalone <ExternalLink size={12} />
                    </a>
                </div>
            </header>

            <div className={styles.iframeContainer}>
                <iframe
                    src={spiderfootUrl}
                    className={styles.iframe}
                    title="SpiderFoot OSINT Engine"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
            </div>
        </div>
    )
}
