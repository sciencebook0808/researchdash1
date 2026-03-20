/**
 * GET    /api/agent/files
 * POST   /api/agent/files
 * DELETE /api/agent/files?id=
 *
 * FIX: searchParams.get("type") returns string | null.
 * Prisma AgentFileWhereInput.type expects the AgentFileType enum.
 * We use direct equality checks to narrow string -> AgentFileType.
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { requireWriteAuth } from "@/lib/api-auth"
import { prisma } from "@/lib/prisma"
import { toApiError } from "@/lib/errors"

type AgentFileType = "system" | "rules" | "tools"

function isAgentFileType(value: string | null): value is AgentFileType {
  return value === "system" || value === "rules" || value === "tools"
}

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const rawType = searchParams.get("type")
    const activeOnly = searchParams.get("active") === "true"

    if (rawType !== null && !isAgentFileType(rawType)) {
      return NextResponse.json(
        { error: "type must be system, rules, or tools" },
        { status: 400 }
      )
    }

    const typeFilter: AgentFileType | null = isAgentFileType(rawType) ? rawType : null

    const files = await prisma.agentFile.findMany({
      where: {
        ...(typeFilter !== null ? { type: typeFilter } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      select: {
        id: true,
        name: true,
        type: true,
        content: true,
        isActive: true,
        order: true,
        createdAt: true,
        updatedAt: true,
        history: {
          select: {
            id: true,
            version: true,
            savedBy: true,
            createdAt: true,
          },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
      orderBy: [{ type: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    })

    return NextResponse.json({
      files,
      counts: {
        total: files.length,
        active: files.filter((f) => f.isActive).length,
        system: files.filter((f) => f.type === "system").length,
        rules: files.filter((f) => f.type === "rules").length,
        tools: files.filter((f) => f.type === "tools").length,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: toApiError(err, "agent/files GET") },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  const authResult = await requireWriteAuth()
  if (!authResult.ok) return authResult.response

  try {
    const body = await req.json()
    const { id, name, content, isActive, order } = body
    const rawType: unknown = body.type

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }
    if (!content?.trim()) {
      return NextResponse.json({ error: "content is required" }, { status: 400 })
    }

    if (typeof rawType !== "string" || !isAgentFileType(rawType)) {
      return NextResponse.json(
        { error: "type must be system, rules, or tools" },
        { status: 400 }
      )
    }
    const fileType: AgentFileType = rawType

    if (fileType === "system" && isActive === false && id) {
      const activeSystemCount = await prisma.agentFile.count({
        where: { type: "system", isActive: true, id: { not: id } },
      })
      if (activeSystemCount === 0) {
        return NextResponse.json(
          { error: "Cannot deactivate the last active system file." },
          { status: 400 }
        )
      }
    }

    if (id) {
      const existing = await prisma.agentFile.findUnique({
        where: { id },
        select: {
          id: true,
          content: true,
          history: {
            select: { version: true },
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      })
      if (!existing) {
        return NextResponse.json({ error: "File not found" }, { status: 404 })
      }

      const latestVersion = existing.history[0]?.version ?? 0
      await prisma.agentFileHistory.create({
        data: {
          fileId: id,
          content: existing.content,
          version: latestVersion + 1,
          savedBy: authResult.email,
        },
      })

      const updated = await prisma.agentFile.update({
        where: { id },
        data: {
          name,
          type: fileType,
          content,
          isActive: isActive ?? true,
          order: order ?? 0,
        },
      })

      return NextResponse.json({
        success: true,
        file: updated,
        versionSaved: latestVersion + 1,
        message: "File updated. Previous version saved as v" + (latestVersion + 1) + ".",
      })
    }

    const created = await prisma.agentFile.create({
      data: {
        name,
        type: fileType,
        content,
        isActive: isActive ?? true,
        order: order ?? 0,
      },
    })

    return NextResponse.json(
      { success: true, file: created, message: "File \"" + name + "\" created." },
      { status: 201 }
    )
  } catch (err) {
    return NextResponse.json(
      { error: toApiError(err, "agent/files POST") },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  const authResult = await requireWriteAuth()
  if (!authResult.ok) return authResult.response

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    const file = await prisma.agentFile.findUnique({
      where: { id },
      select: { type: true, isActive: true },
    })
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    if (file.type === "system" && file.isActive) {
      const count = await prisma.agentFile.count({
        where: { type: "system", isActive: true },
      })
      if (count <= 1) {
        return NextResponse.json(
          { error: "Cannot delete the last active system file." },
          { status: 400 }
        )
      }
    }

    await prisma.agentFile.delete({ where: { id } })
    return NextResponse.json({ success: true, message: "File deleted." })
  } catch (err) {
    return NextResponse.json(
      { error: toApiError(err, "agent/files DELETE") },
      { status: 500 }
    )
  }
}
