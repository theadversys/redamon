'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useProject } from '@/providers/ProjectProvider'
import {
  Network,
  ShieldCheck,
  Target,
  ClipboardList,
  FolderOpen,
  Key,
  BarChart3,
  Search,
  Home,
  Swords,
  FlaskConical,
  History,
  Server,
  ChevronLeft,
  ChevronRight,
  Users,
  Smartphone,
} from 'lucide-react'
import styles from './SideNav.module.css'

const STORAGE_KEY = 'pandaexploit-sidebar-collapsed'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  enabled: boolean
  group: 'ops' | 'intel' | 'tools'
}

const navItems: NavItem[] = [
  // ── OPS ──────────────────────────────────────────────
  { label: 'Agent Zero',       href: '/',              icon: <Home size={16} />,          enabled: true, group: 'ops' },
  { label: 'Agent Swarm',      href: '/agents',        icon: <Users size={16} />,         enabled: true, group: 'ops' },
  { label: 'Operations',       href: '/operations',    icon: <Swords size={16} />,        enabled: true, group: 'ops' },
  { label: 'Engagements',      href: '/engagements',   icon: <History size={16} />,       enabled: true, group: 'ops' },
  { label: 'Command Center',   href: '/dashboard',     icon: <BarChart3 size={16} />,     enabled: true, group: 'ops' },
  { label: 'Recon Graph',      href: '/graph',         icon: <Network size={16} />,       enabled: true, group: 'ops' },
  // ── INTEL ─────────────────────────────────────────────
  { label: 'Asset Inventory',  href: '/assets',        icon: <Server size={16} />,        enabled: true, group: 'intel' },
  { label: 'Vulnerabilities',  href: '/vulnerabilities', icon: <ShieldCheck size={16} />, enabled: true, group: 'intel' },
  { label: 'MITRE ATT&CK',     href: '/mitre',         icon: <Target size={16} />,        enabled: true, group: 'intel' },
  { label: 'Secrets',          href: '/secrets',       icon: <Key size={16} />,           enabled: true, group: 'intel' },
  { label: 'OSINT',            href: '/osint',         icon: <Search size={16} />,        enabled: true, group: 'intel' },
  // ── TOOLS ─────────────────────────────────────────────
  { label: 'AI Red Team',      href: '/ai-security',   icon: <FlaskConical size={16} />,  enabled: true, group: 'tools' },
  { label: 'Mobile Testing',  href: '/mobile',        icon: <Smartphone size={16} />,    enabled: true, group: 'tools' },
  { label: 'Audit Log',        href: '/actions',       icon: <ClipboardList size={16} />, enabled: true, group: 'tools' },
  { label: 'Projects',         href: '/projects',      icon: <FolderOpen size={16} />,    enabled: true, group: 'tools' },
]

const GROUP_LABELS: Record<NavItem['group'], string> = {
  ops:   'OPS',
  intel: 'INTEL',
  tools: 'TOOLS',
}

export function SideNav() {
  const pathname = usePathname()
  const { projectId } = useProject()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Read localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'true') setCollapsed(true)
    } catch {}
    setMounted(true)
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, String(next)) } catch {}
      return next
    })
  }, [])

  const getHref = (baseHref: string) => {
    if (baseHref === '/vulnerabilities' && projectId) return `/vulnerabilities?project=${projectId}`
    if (baseHref === '/secrets' && projectId)         return `/secrets?project=${projectId}`
    return baseHref
  }

  // Suppress flash before localStorage is read
  if (!mounted) return null

  let lastGroup: NavItem['group'] | null = null

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}
      data-collapsed={collapsed}
    >
      {/* ── Header / Logo ── */}
      <div className={styles.header}>
        <Link href="/" className={styles.logoLink}>
          <Image
            src="/logo.png"
            alt="PandaExploit"
            width={26}
            height={26}
            className={styles.logoImg}
            unoptimized
          />
          {!collapsed && (
            <span className={styles.logoText}>
              <span className={styles.logoAccent}>Panda</span>Exploit
            </span>
          )}
        </Link>
      </div>

      {/* ── Nav Items ── */}
      <nav className={styles.nav}>
        <ul className={styles.navList}>
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`)

            const showGroupHeader = lastGroup !== item.group
            lastGroup = item.group

            return (
              <li key={item.href}>
                {showGroupHeader && (
                  <div className={styles.groupHeader}>
                    {!collapsed
                      ? <span className={styles.groupLabel}>{GROUP_LABELS[item.group]}</span>
                      : <span className={styles.groupDot} aria-hidden />}
                  </div>
                )}

                {item.enabled ? (
                  <Link
                    href={getHref(item.href)}
                    className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                    title={collapsed ? item.label : undefined}
                    data-tooltip={collapsed ? item.label : undefined}
                  >
                    <span className={styles.icon}>{item.icon}</span>
                    {!collapsed && <span className={styles.label}>{item.label}</span>}
                  </Link>
                ) : (
                  <span
                    className={`${styles.navItem} ${styles.disabled}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className={styles.icon}>{item.icon}</span>
                    {!collapsed && (
                      <>
                        <span className={styles.label}>{item.label}</span>
                        <span className={styles.soon}>Soon</span>
                      </>
                    )}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      {/* ── Collapse Toggle ── */}
      <button
        className={styles.collapseBtn}
        onClick={toggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        {!collapsed && <span className={styles.collapseBtnLabel}>Collapse</span>}
      </button>
    </aside>
  )
}
