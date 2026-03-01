'use client'

import React from 'react'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    width?: string | number
    height?: string | number
    variant?: 'text' | 'rect' | 'circle' | 'title' | 'avatar' | 'button' | 'card'
}

export function Skeleton({
    width,
    height,
    variant = 'rect',
    className = '',
    style,
    ...props
}: SkeletonProps) {
    const baseStyle: React.CSSProperties = {
        width,
        height,
        ...style,
    }

    // Map variants to CSS classes from loading.css
    const variantClass = {
        text: 'skeleton skeletonText',
        rect: 'skeleton',
        circle: 'skeleton skeletonAvatar',
        title: 'skeleton skeletonTitle',
        avatar: 'skeleton skeletonAvatar',
        button: 'skeleton skeletonButton',
        card: 'skeleton skeletonCard',
    }[variant]

    return (
        <div
            className={`${variantClass} ${className}`}
            style={baseStyle}
            {...props}
        />
    )
}
