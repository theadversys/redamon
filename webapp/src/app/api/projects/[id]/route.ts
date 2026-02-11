import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { getSession } from '@/app/api/graph/neo4j'

// Path to recon and gvm output directories (fallback for local deletion)
const RECON_OUTPUT_PATH = process.env.RECON_OUTPUT_PATH || '/home/samuele/Progetti didattici/PandaExploit/recon/output'
const GVM_OUTPUT_PATH = process.env.GVM_OUTPUT_PATH || '/home/samuele/Progetti didattici/PandaExploit/gvm_scan/output'

// Recon orchestrator URL for file deletion
const RECON_ORCHESTRATOR_URL = process.env.RECON_ORCHESTRATOR_URL || 'http://localhost:8010'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/projects/[id] - Get project with all params
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(project)
  } catch (error) {
    console.error('Failed to fetch project:', error)
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    )
  }
}

// PUT /api/projects/[id] - Update project params
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json()

    // Remove fields that shouldn't be updated directly
    const { userId, createdAt, updatedAt, user, ...updateData } = body

    const project = await prisma.project.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json(project)
  } catch (error: unknown) {
    console.error('Failed to update project:', error)

    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    )
  }
}

// DELETE /api/projects/[id] - Delete project and all associated data
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    // 1. Delete project from PostgreSQL
    await prisma.project.delete({
      where: { id }
    })

    // 2. Delete recon JSON file via orchestrator (it has write permissions)
    try {
      const orchestratorResponse = await fetch(`${RECON_ORCHESTRATOR_URL}/recon/${id}/data`, {
        method: 'DELETE',
      })
      if (orchestratorResponse.ok) {
        const result = await orchestratorResponse.json()
        console.log(`Orchestrator deleted files:`, result.deleted)
      } else {
        console.warn(`Orchestrator failed to delete files: ${orchestratorResponse.status}`)
      }
    } catch (orchestratorError) {
      console.warn(`Failed to call orchestrator for file deletion: ${orchestratorError}`)

      // Fallback: try to delete locally (may fail due to permissions)
      const reconFilePath = path.join(RECON_OUTPUT_PATH, `recon_${id}.json`)
      if (existsSync(reconFilePath)) {
        try {
          await unlink(reconFilePath)
          console.log(`Deleted recon file locally: ${reconFilePath}`)
        } catch (err) {
          console.warn(`Failed to delete recon file locally: ${err}`)
        }
      }
    }

    // 3. Delete GVM JSON file if it exists
    const gvmFilePath = path.join(GVM_OUTPUT_PATH, `gvm_${id}.json`)
    if (existsSync(gvmFilePath)) {
      try {
        await unlink(gvmFilePath)
        console.log(`Deleted GVM file: ${gvmFilePath}`)
      } catch (err) {
        console.warn(`Failed to delete GVM file: ${err}`)
      }
    }

    // 4. Delete all Neo4j nodes for this project
    try {
      const session = getSession()
      try {
        // Delete all nodes that belong to this project (DETACH DELETE removes relationships too)
        await session.run(
          `MATCH (n {project_id: $projectId}) DETACH DELETE n`,
          { projectId: id }
        )
        console.log(`Deleted Neo4j nodes for project: ${id}`)
      } finally {
        await session.close()
      }
    } catch (neo4jError) {
      // Log but don't fail the request if Neo4j cleanup fails
      console.warn(`Failed to delete Neo4j data: ${neo4jError}`)
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Failed to delete project:', error)

    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    )
  }
}
