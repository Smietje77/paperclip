import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { createMcpServerSchema, updateMcpServerSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { logActivity, mcpServerService } from "../services/index.js";

export function mcpServerRoutes(db: Db) {
  const router = Router();
  const svc = mcpServerService(db);

  router.get("/companies/:companyId/mcp-servers", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const servers = await svc.list(companyId);
    res.json(servers);
  });

  router.post(
    "/companies/:companyId/mcp-servers",
    validate(createMcpServerSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const created = await svc.create(companyId, req.body);

      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "mcp_server.created",
        entityType: "mcp_server",
        entityId: created.id,
        details: {
          name: created.name,
          transport: created.transport,
        },
      });

      res.status(201).json(created);
    },
  );

  router.patch("/mcp-servers/:id", validate(updateMcpServerSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    const updated = await svc.update(id, req.body);

    await logActivity(db, {
      companyId: updated.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "mcp_server.updated",
      entityType: "mcp_server",
      entityId: updated.id,
      details: { name: updated.name },
    });

    res.json(updated);
  });

  router.delete("/mcp-servers/:id", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    const removed = await svc.remove(id);
    if (!removed) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }

    await logActivity(db, {
      companyId: removed.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "mcp_server.deleted",
      entityType: "mcp_server",
      entityId: removed.id,
      details: { name: removed.name },
    });

    res.json({ ok: true });
  });

  return router;
}
