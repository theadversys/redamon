'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Filter, ChevronDown } from 'lucide-react'
import { NODE_COLORS, NODE_TYPE_ORDER, NODE_TYPE_GROUPS } from '../../config'
import styles from './NodeTypeFilter.module.css'

interface NodeTypeFilterProps {
  visibleNodeTypes: Set<string>
  onVisibleTypesChange: (newSet: Set<string>) => void
  nodesByType?: Record<string, number>
}

function getAllNodeTypes(nodesByType?: Record<string, number>): string[] {
  const fromData = nodesByType ? Object.keys(nodesByType) : []
  return [...new Set([...NODE_TYPE_ORDER, ...fromData])]
}

export function NodeTypeFilter({
  visibleNodeTypes,
  onVisibleTypesChange,
  nodesByType,
}: NodeTypeFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState({ bottom: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const allTypes = getAllNodeTypes(nodesByType)

  const updatePosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    setDropdownPosition({
      bottom: typeof window !== 'undefined' ? window.innerHeight - rect.top + 8 : 0,
      left: rect.left,
    })
  }

  useEffect(() => {
    if (isOpen) {
      updatePosition()
      const handleResize = () => updatePosition()
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [isOpen])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      const inTrigger = triggerRef.current?.contains(target)
      const inDropdown = dropdownRef.current?.contains(target)
      if (!inTrigger && !inDropdown) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleToggle = (type: string) => {
    const next = new Set(visibleNodeTypes)
    if (next.has(type)) {
      next.delete(type)
      if (next.size === 0) return
    } else {
      next.add(type)
    }
    onVisibleTypesChange(next)
  }

  const handleSelectAll = () => {
    onVisibleTypesChange(new Set(allTypes))
  }

  const handleDeselectAll = () => {
    if (allTypes.length === 0) return
    onVisibleTypesChange(new Set([allTypes[0]]))
  }

  const handleShowOnly = (type: string) => {
    onVisibleTypesChange(new Set([type]))
  }

  const visibleCount = visibleNodeTypes.size
  const totalCount = allTypes.length

  return (
    <div className={styles.container}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
        title="Filter nodes by type"
      >
        <Filter size={12} />
        <span className={styles.triggerLabel}>
          Filter
          {visibleCount < totalCount && (
            <span className={styles.badge}> {visibleCount}/{totalCount}</span>
          )}
        </span>
        <ChevronDown size={12} className={isOpen ? styles.iconOpen : ''} />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            className={styles.dropdown}
            style={{
              position: 'fixed',
              bottom: `${dropdownPosition.bottom}px`,
              left: `${dropdownPosition.left}px`,
              top: 'auto',
              zIndex: 10000,
            }}
          >
            <div className={styles.header}>
              <span className={styles.headerTitle}>Show / Hide Nodes</span>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.actionBtn} onClick={handleSelectAll}>
                Select All
              </button>
              <button type="button" className={styles.actionBtn} onClick={handleDeselectAll}>
                Deselect All
              </button>
            </div>
            <div className={styles.list}>
            {Object.entries(NODE_TYPE_GROUPS).map(([groupLabel, types]) => {
              const groupTypes = types.filter((t) => allTypes.includes(t))
              if (groupTypes.length === 0) return null
              return (
                <div key={groupLabel} className={styles.group}>
                  <div className={styles.groupLabel}>{groupLabel}</div>
                  {groupTypes.map((type) => {
                    const color = NODE_COLORS[type] || NODE_COLORS.Default
                    const count = nodesByType?.[type]
                    const isChecked = visibleNodeTypes.has(type)
                    return (
                      <div key={type} className={styles.item}>
                        <label className={styles.itemLabel}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggle(type)}
                            className={styles.checkbox}
                          />
                          <span
                            className={styles.dot}
                            style={{ backgroundColor: color }}
                          />
                          <span className={styles.typeName}>{type}</span>
                          {count !== undefined && (
                            <span className={styles.count}>({count})</span>
                          )}
                        </label>
                        <button
                          type="button"
                          className={styles.onlyBtn}
                          onClick={() => handleShowOnly(type)}
                          title={`Show only ${type} nodes`}
                        >
                          only
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {allTypes.filter((t) => !Object.values(NODE_TYPE_GROUPS).flat().includes(t)).length > 0 && (
              <div className={styles.group}>
                <div className={styles.groupLabel}>Other</div>
                {allTypes
                  .filter((t) => !Object.values(NODE_TYPE_GROUPS).flat().includes(t))
                  .map((type) => {
                    const color = NODE_COLORS[type] || NODE_COLORS.Default
                    const count = nodesByType?.[type]
                    const isChecked = visibleNodeTypes.has(type)
                    return (
                      <div key={type} className={styles.item}>
                        <label className={styles.itemLabel}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggle(type)}
                            className={styles.checkbox}
                          />
                          <span
                            className={styles.dot}
                            style={{ backgroundColor: color }}
                          />
                          <span className={styles.typeName}>{type}</span>
                          {count !== undefined && (
                            <span className={styles.count}>({count})</span>
                          )}
                        </label>
                        <button
                          type="button"
                          className={styles.onlyBtn}
                          onClick={() => handleShowOnly(type)}
                          title={`Show only ${type} nodes`}
                        >
                          only
                        </button>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </div>,
          document.body
        )}
    </div>
  )
}
