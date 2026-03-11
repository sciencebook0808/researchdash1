import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(body.role && { role: body.role }),
        ...(body.name && { name: body.name }),
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error("User PATCH error:", error)
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.user.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("User DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }
}
