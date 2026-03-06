'use client'

import Link from 'next/link'
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
  Bot,
  Home,
  Swords,
  FlaskConical,
  History,
  Server,
} from 'lucide-react'
import styles from './NavigationBar.module.css'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  enabled: boolean
  group: 'ops' | 'intel' | 'manage'
}

const navItems: NavItem[] = [
  // ── OPS ──────────────────────────────────────────────
  {
    label: 'Operations',
    href: '/operations',
    icon: <Swords size={16} />,
    enabled: true,
    group: 'ops',
  },
  {
    label: 'Engagements',
    href: '/engagements',
    icon: <History size={16} />,
    enabled: true,
    group: 'ops',
  },
  {
    label: 'Agent Swarm',
    href: '/agents',
    icon: <Bot size={16} />,
    enabled: true,
    group: 'ops',
  },
  {
    label: 'Command Center',
    href: '/dashboard',
    icon: <BarChart3 size={16} />,
    enabled: true,
    group: 'ops',
  },
  {
    label: 'Agent Zero',
    href: '/',
    icon: <Home size={16} />,
    enabled: true,
    group: 'ops',
  },
  {
    label: 'Recon Graph',
    href: '/graph',
    icon: <Network size={16} />,
    enabled: true,
    group: 'ops',
  },
  // ── INTEL ─────────────────────────────────────────────
  {
    label: 'Asset Inventory',
    href: '/assets',
    icon: <Server size={16} />,
    enabled: true,
    group: 'intel',
  },
  {
    label: 'Vulnerabilities',
    href: '/vulnerabilities',
    icon: <ShieldCheck size={16} />,
    enabled: true,
    group: 'intel',
  },
  {
    label: 'MITRE ATT&CK',
    href: '/mitre',
    icon: <Target size={16} />,
    enabled: true,
    group: 'intel',
  },
  {
    label: 'Secrets',
    href: '/secrets',
    icon: <Key size={16} />,
    enabled: true,
    group: 'intel',
  },
  {
    label: 'OSINT',
    href: '/osint',
    icon: <Search size={16} />,
    enabled: true,
    group: 'intel',
  },
  // ── MANAGE ────────────────────────────────────────────
  {
    label: 'AI Red Team',
    href: '/ai-security',
    icon: <FlaskConical size={16} />,
    enabled: true,
    group: 'manage',
  },
  {
    label: 'Audit Log',
    href: '/actions',
    icon: <ClipboardList size={16} />,
    enabled: true,
    group: 'manage',
  },
  {
    label: 'Projects',
    href: '/projects',
    icon: <FolderOpen size={16} />,
    enabled: true,
    group: 'manage',
  },
]

const GROUP_LABELS: Record<NavItem['group'], string> = {
  ops: 'OPS',
  intel: 'INTEL',
  manage: 'TOOLS',
}

export function NavigationBar() {
  const pathname = usePathname()
  const { projectId } = useProject()

  const getHref = (baseHref: string) => {
    if (baseHref === '/vulnerabilities' && projectId) return `/vulnerabilities?project=${projectId}`
    if (baseHref === '/secrets' && projectId) return `/secrets?project=${projectId}`
    return baseHref
  }

  let lastGroup: NavItem['group'] | null = null

  return (
    <nav className={styles.nav}>
      <ul className={styles.navList}>
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`)

          const showDivider = lastGroup !== null && lastGroup !== item.group
          lastGroup = item.group

          return (
            <li key={item.href} className={styles.navLi}>
              {showDivider && (
                <span className={styles.groupDivider} aria-hidden>
                  <span className={styles.groupLabel}>{GROUP_LABELS[item.group]}</span>
                </span>
              )}
              {item.enabled ? (
                <Link
                  href={getHref(item.href)}
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span className={styles.navLabel}>{item.label}</span>
                </Link>
              ) : (
                <span className={`${styles.navItem} ${styles.navItemDisabled}`}>
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span className={styles.navLabel}>{item.label}</span>
                  <span className={styles.comingSoon}>Soon</span>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
