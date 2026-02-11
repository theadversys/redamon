'use client'

import Image from 'next/image'
import { Search, Bell, Settings, ChevronDown } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ProjectSelector } from './ProjectSelector'
import styles from './GlobalHeader.module.css'

export function GlobalHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        <Image src="/logo.png" alt="PandaExploit" width={28} height={28} className={styles.logoImg} unoptimized />
        <span className={styles.logoText}>
          <span className={styles.logoAccent}>Panda</span>Exploit
        </span>
      </div>

      <div className={styles.spacer} />

      {/* Search - Mock */}
      <div className={styles.search}>
        <Search size={14} />
        <input
          type="text"
          placeholder="Search..."
          className={styles.searchInput}
          disabled
        />
      </div>

      <div className={styles.actions}>
        {/* Project Selector */}
        <ProjectSelector />

        <div className={styles.divider} />

        {/* Notifications - Mock */}
        <button className={styles.iconButton} title="Notifications">
          <Bell size={16} />
          <span className={styles.badge}>3</span>
        </button>

        {/* Settings - Mock */}
        <button className={styles.iconButton} title="Settings">
          <Settings size={16} />
        </button>

        <div className={styles.divider} />

        <ThemeToggle />

        <div className={styles.divider} />

        {/* User Menu - Mock */}
        <button className={styles.userButton}>
          <div className={styles.avatar}>
            <span>SA</span>
          </div>
          <span className={styles.userName}>Admin</span>
          <ChevronDown size={14} />
        </button>
      </div>
    </header>
  )
}
