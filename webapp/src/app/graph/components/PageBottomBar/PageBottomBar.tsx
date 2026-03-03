'use client'

import { NODE_COLORS } from '../../config'
import { GraphData } from '../../types'
import { NodeTypeFilter } from '../NodeTypeFilter/NodeTypeFilter'
import styles from './PageBottomBar.module.css'

const ALL_NODE_TYPES = Object.keys(NODE_COLORS).filter((k) => k !== 'Default')
const PRESET_TYPES = ['Vulnerability', 'CVE', 'IP', 'Domain', 'Subdomain'] as const

interface PageBottomBarProps {
  data: GraphData | undefined
  is3D: boolean
  showLabels: boolean
  visibleNodeTypes: Set<string>
  onVisibleTypesChange: (newSet: Set<string>) => void
  nodesByType?: Record<string, number>
}

export function PageBottomBar({
  data,
  is3D,
  showLabels,
  visibleNodeTypes,
  onVisibleTypesChange,
  nodesByType,
}: PageBottomBarProps) {
  const handlePreset = (type: 'all' | (typeof PRESET_TYPES)[number]) => {
    if (type === 'all') {
      onVisibleTypesChange(new Set(ALL_NODE_TYPES))
    } else {
      onVisibleTypesChange(new Set([type]))
    }
  }

  const isPresetActive = (type: 'all' | (typeof PRESET_TYPES)[number]) => {
    if (type === 'all') {
      return visibleNodeTypes.size === ALL_NODE_TYPES.length
    }
    return visibleNodeTypes.size === 1 && visibleNodeTypes.has(type)
  }

  return (
    <div className={styles.bottomBar}>
      <div className={styles.presets}>
        {PRESET_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={isPresetActive(type) ? styles.presetBtnActive : styles.presetBtn}
            onClick={() => handlePreset(type)}
            title={`Show only ${type} nodes`}
          >
            {type}
          </button>
        ))}
        <button
          type="button"
          className={isPresetActive('all') ? styles.presetBtnActive : styles.presetBtn}
          onClick={() => handlePreset('all')}
          title="Show all node types"
        >
          All
        </button>
      </div>
      <div className={styles.legend}>
        <span className={styles.sectionTitle}>Node Types:</span>
        <NodeTypeFilter
          visibleNodeTypes={visibleNodeTypes}
          onVisibleTypesChange={onVisibleTypesChange}
          nodesByType={nodesByType}
        />
        <div className={styles.legendItems}>
          {Object.entries(NODE_COLORS)
            .filter(([key]) => key !== 'Default')
            .map(([type, color]) => (
              <div key={type} className={styles.legendItem}>
                <span
                  className={styles.legendColor}
                  style={{ backgroundColor: color }}
                />
                <span className={styles.legendLabel}>{type}</span>
              </div>
            ))}
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.stats}>
        <span className={styles.sectionTitle}>Stats:</span>
        <div className={styles.statItems}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Nodes:</span>
            <span className={styles.statValue}>{data?.nodes.length ?? '-'}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Links:</span>
            <span className={styles.statValue}>{data?.links.length ?? '-'}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>View:</span>
            <span className={styles.statValue}>{is3D ? '3D' : '2D'}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Labels:</span>
            <span className={styles.statValue}>{showLabels ? 'On' : 'Off'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
