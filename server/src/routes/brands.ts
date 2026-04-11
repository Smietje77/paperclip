import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  addBrandImageSchema,
  updateBrandSchema,
  type BrandColors,
  type BrandTypography,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { brandService, logActivity } from "../services/index.js";

export function brandRoutes(db: Db) {
  const router = Router();
  const svc = brandService(db);

  router.get("/companies/:companyId/brand", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const brand = await svc.get(companyId);
    res.json(brand);
  });

  router.put(
    "/companies/:companyId/brand",
    validate(updateBrandSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const body = req.body as {
        brandName?: string | null;
        tagline?: string | null;
        colors?: BrandColors | null;
        typography?: BrandTypography | null;
        logoLightAssetId?: string | null;
        logoDarkAssetId?: string | null;
        iconAssetId?: string | null;
        voiceTone?: string | null;
        brandGuidelines?: string | null;
      };

      const updated = await svc.upsert(companyId, body);

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "brand.updated",
        entityType: "brand",
        entityId: companyId,
        details: {
          hasColors: !!updated.colors,
          hasTypography: !!updated.typography,
          hasLogoLight: !!updated.logoLightAssetId,
          hasLogoDark: !!updated.logoDarkAssetId,
          hasIcon: !!updated.iconAssetId,
        },
      });

      res.json(updated);
    },
  );

  router.post(
    "/companies/:companyId/brand/images",
    validate(addBrandImageSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const image = await svc.addImage(companyId, {
        assetId: req.body.assetId,
        caption: req.body.caption,
      });

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "brand.image_added",
        entityType: "brand",
        entityId: image.id,
        details: { assetId: image.assetId },
      });

      res.status(201).json(image);
    },
  );

  router.delete("/companies/:companyId/brand/images/:imageId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const imageId = req.params.imageId as string;
    assertCompanyAccess(req, companyId);

    await svc.removeImage(companyId, imageId);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "brand.image_removed",
      entityType: "brand",
      entityId: imageId,
      details: {},
    });

    res.json({ ok: true });
  });

  return router;
}
