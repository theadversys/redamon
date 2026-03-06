'use client'

import { Settings } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ProjectSelector } from './ProjectSelector'
import styles from './GlobalHeader.module.css'

export function GlobalHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.spacer} />
      <div className={styles.actions}>
        <ProjectSelector />
        <div className={styles.divider} />
        <ThemeToggle />
        <div className={styles.divider} />
        <a href="/projects" className={styles.iconButton} title="Projects &amp; Settings">
          <Settings size={16} />
        </a>
      </div>
    </header>
  )
}
