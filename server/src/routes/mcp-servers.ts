import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { createMcpServerSchema, updateMcpServerSchema, MARKETING_MCP_CATALOG } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { logActivity, mcpServerService } from "../services/index.js";

export function mcpServerRoutes(db: Db) {
  const router = Router();
  const svc = mcpServerService(db);

  router.get("/mcp-catalog", async (req, res) => {
    assertBoard(req);
    res.json(MARKETING_MCP_CATALOG);
  });

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

  router.post("/companies/:companyId/mcp-servers/install-from-catalog", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const body = (req.body ?? {}) as { catalogKey?: unknown };
    const catalogKey = typeof body.catalogKey === "string" ? body.catalogKey : "";
    if (!catalogKey) {
      res.status(400).json({ error: "catalogKey is required" });
      return;
    }

    const created = await svc.installFromCatalog(companyId, catalogKey);

    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "mcp_server.installed_from_catalog",
      entityType: "mcp_server",
      entityId: created.id,
      details: { name: created.name, catalogKey },
    });

    res.status(201).json(created);
  });

  router.post("/companies/:companyId/mcp-servers/install-starter-pack", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const result = await svc.installStarterPack(companyId);

    for (const entry of result.installed) {
      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "mcp_server.installed_from_catalog",
        entityType: "mcp_server",
        entityId: entry.id,
        details: { name: entry.name, catalogKey: entry.catalogKey, starterPack: true },
      });
    }

    res.status(201).json(result);
  });

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

  router.post("/mcp-servers/:id/test-connection", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    const result = await svc.testConnection(id);
    res.json(result);
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
