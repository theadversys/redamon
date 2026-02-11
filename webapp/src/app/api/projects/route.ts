import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/projects - List projects (optional user_id filter)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    const projects = await prisma.project.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        name: true,
        description: true,
        targetDomain: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    return NextResponse.json(projects)
  } catch (error) {
    console.error('Failed to fetch projects:', error)
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    )
  }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, name, targetDomain, ...optionalParams } = body

    if (!userId || !name || !targetDomain) {
      return NextResponse.json(
        { error: 'userId, name, and targetDomain are required' },
        { status: 400 }
      )
    }

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Default scan modules if not provided or empty
    const defaultScanModules = ['domain_discovery', 'port_scan', 'http_probe', 'resource_enum', 'vuln_scan']
    const scanModules = optionalParams.scanModules && optionalParams.scanModules.length > 0 
      ? optionalParams.scanModules 
      : defaultScanModules

    // Filter out undefined values and fields not in schema to prevent Prisma errors
    const validOptionalParams = Object.fromEntries(
      Object.entries(optionalParams).filter(([_, value]) => value !== undefined)
    )
    
    // Create project with required fields and any optional params
    const project = await prisma.project.create({
      data: {
        userId,
        name,
        targetDomain,
        ...validOptionalParams,
        scanModules: scanModules
      }
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    console.error('Failed to create project:', error)
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    )
  }
}
